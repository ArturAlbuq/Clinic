create or replace function public.correct_exam_flags(
  p_attendance_id uuid,
  p_com_cefalometria boolean,
  p_com_impressao_fotografia boolean,
  p_com_laboratorio_externo_escaneamento boolean,
  p_com_laudo_per_exam jsonb,  -- { "periapical": true, "panoramica": false, ... }
  p_reason text,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  target_attendance public.attendances%rowtype;
  v_performed_by uuid;

  -- flags antigas
  old_com_cefalometria boolean;
  old_com_impressao_fotografia boolean;
  old_com_laboratorio_externo_escaneamento boolean;

  -- helpers
  v_new_laudo boolean;
  v_queue_item_id uuid;
  v_pipeline_item_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
  v_queue_item record;
  updated_queue_items jsonb;
  updated_pipeline_items jsonb;
begin
  -- Auth
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  actor_role := public.current_app_role();
  if actor_role not in ('gerencia', 'admin') then
    raise exception 'sem permissao para corrigir flags de exame';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo deve ter pelo menos 3 caracteres';
  end if;

  v_performed_by := coalesce(p_performed_by, auth.uid());

  -- Lock attendance
  select * into target_attendance
  from public.attendances
  where id = p_attendance_id and deleted_at is null
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  old_com_cefalometria                    := target_attendance.com_cefalometria;
  old_com_impressao_fotografia            := target_attendance.com_impressao_fotografia;
  old_com_laboratorio_externo_escaneamento := target_attendance.com_laboratorio_externo_escaneamento;

  -- 1. Atualiza attendances
  update public.attendances
  set
    com_cefalometria                     = p_com_cefalometria,
    com_impressao_fotografia             = p_com_impressao_fotografia,
    com_laboratorio_externo_escaneamento = p_com_laboratorio_externo_escaneamento
  where id = p_attendance_id
  returning * into target_attendance;

  -- 2. Atualiza queue_items.com_laudo e gerencia pipeline_items de laudo
  for v_queue_item in
    select qi.id, qi.exam_type, qi.com_laudo
    from public.queue_items qi
    where qi.attendance_id = p_attendance_id
      and qi.exam_type in ('periapical','interproximal','panoramica','tomografia')
      and qi.deleted_at is null
  loop
    v_new_laudo := coalesce(
      (p_com_laudo_per_exam ->> v_queue_item.exam_type::text)::boolean,
      v_queue_item.com_laudo
    );

    if v_new_laudo is distinct from v_queue_item.com_laudo then
      update public.queue_items
      set com_laudo = v_new_laudo
      where id = v_queue_item.id;

      if not v_new_laudo then
        -- Fecha pipeline_item de laudo vinculado a este queue_item
        update public.pipeline_items
        set
          status   = 'publicado_finalizado',
          notes    = p_reason,
          metadata = metadata || jsonb_build_object('flag_correction', true)
        where id in (
          select piqi.pipeline_item_id
          from public.pipeline_item_queue_items piqi
          join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
          where piqi.queue_item_id = v_queue_item.id
            and pi.pipeline_type = 'laudo'
            and pi.finished_at is null
        );
      else
        -- Cria novo pipeline_item de laudo se o exame ja foi finalizado
        if exists (
          select 1 from public.queue_items
          where id = v_queue_item.id and status = 'finalizado'
        ) then
          v_sla_subtype := public.resolve_sla_subtype(
            'laudo'::public.pipeline_type,
            jsonb_build_object('source_exam_type', v_queue_item.exam_type)
          );
          v_business_days := null;
          v_sla_deadline  := null;

          if v_sla_subtype is not null then
            select business_days into v_business_days
            from public.sla_config where pipeline_subtype = v_sla_subtype;
          end if;

          if v_business_days is not null then
            v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
          end if;

          insert into public.pipeline_items (
            attendance_id, queue_item_id, pipeline_type, status,
            metadata, notes, created_by, sla_deadline
          ) values (
            p_attendance_id, v_queue_item.id, 'laudo',
            'pendente_envio',
            jsonb_build_object(
              'source_exam_type', v_queue_item.exam_type,
              'flag_correction', true
            ),
            p_reason,
            v_performed_by,
            v_sla_deadline
          )
          returning id into v_pipeline_item_id;

          insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
          values (v_pipeline_item_id, v_queue_item.id)
          on conflict do nothing;
        end if;
      end if;
    end if;
  end loop;

  -- 3. Cefalometria
  if p_com_cefalometria is distinct from old_com_cefalometria then
    if not p_com_cefalometria then
      -- Fecha
      update public.pipeline_items
      set
        status   = 'publicado_finalizado',
        notes    = p_reason,
        metadata = metadata || jsonb_build_object('flag_correction', true)
      where attendance_id = p_attendance_id
        and pipeline_type = 'cefalometria'
        and finished_at is null;
    else
      -- Cria se houver queue_item de telerradiografia finalizado
      select id into v_queue_item_id
      from public.queue_items
      where attendance_id = p_attendance_id
        and exam_type = 'telerradiografia'
        and status = 'finalizado'
        and deleted_at is null
      limit 1;

      if v_queue_item_id is not null then
        v_sla_subtype := public.resolve_sla_subtype(
          'cefalometria'::public.pipeline_type,
          jsonb_build_object('source_exam_type', 'telerradiografia')
        );
        v_business_days := null;
        v_sla_deadline  := null;

        if v_sla_subtype is not null then
          select business_days into v_business_days
          from public.sla_config where pipeline_subtype = v_sla_subtype;
        end if;

        if v_business_days is not null then
          v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
        end if;

        insert into public.pipeline_items (
          attendance_id, queue_item_id, pipeline_type, status,
          metadata, notes, created_by, sla_deadline
        ) values (
          p_attendance_id, v_queue_item_id, 'cefalometria',
          'pendente_envio',
          jsonb_build_object(
            'source_exam_type', 'telerradiografia',
            'flag_correction', true
          ),
          p_reason,
          v_performed_by,
          v_sla_deadline
        );
      end if;
    end if;
  end if;

  -- 4. Fotografia / com_impressao
  if p_com_impressao_fotografia is distinct from old_com_impressao_fotografia then
    -- Se desmarcou: fecha o pipeline_item em um unico UPDATE (evita duplo evento de auditoria)
    if not p_com_impressao_fotografia then
      update public.pipeline_items
      set
        status   = 'publicado_finalizado',
        notes    = p_reason,
        metadata = metadata
          || jsonb_build_object('com_impressao', false)
          || jsonb_build_object('flag_correction', true)
      where attendance_id = p_attendance_id
        and pipeline_type = 'fotografia'
        and finished_at is null;
    elsif p_com_impressao_fotografia and old_com_impressao_fotografia = false then
      -- Marcou: se nao existir pipeline_item aberto de fotografia, cria
      if not exists (
        select 1 from public.pipeline_items
        where attendance_id = p_attendance_id
          and pipeline_type = 'fotografia'
          and finished_at is null
      ) then
        select id into v_queue_item_id
        from public.queue_items
        where attendance_id = p_attendance_id
          and exam_type = 'fotografia'
          and status = 'finalizado'
          and deleted_at is null
        limit 1;

        if v_queue_item_id is not null then
          insert into public.pipeline_items (
            attendance_id, queue_item_id, pipeline_type, status,
            metadata, notes, created_by
          ) values (
            p_attendance_id, v_queue_item_id, 'fotografia',
            'pendente_envio',
            jsonb_build_object(
              'source_exam_type', 'fotografia',
              'com_impressao', true,
              'flag_correction', true
            ),
            p_reason,
            v_performed_by
          );
        end if;
      else
        -- Ja existe pipeline_item aberto: apenas atualiza o metadata
        update public.pipeline_items
        set
          metadata = metadata
            || jsonb_build_object('com_impressao', true)
            || jsonb_build_object('flag_correction', true),
          notes = p_reason
        where attendance_id = p_attendance_id
          and pipeline_type = 'fotografia'
          and finished_at is null;
      end if;
    end if;
  end if;

  -- 5. Escaneamento / laboratorio_externo
  if p_com_laboratorio_externo_escaneamento is distinct from old_com_laboratorio_externo_escaneamento then
    -- Se desmarcou: fecha o pipeline_item em um unico UPDATE (evita duplo evento de auditoria)
    if not p_com_laboratorio_externo_escaneamento then
      update public.pipeline_items
      set
        status   = 'publicado_finalizado',
        notes    = p_reason,
        metadata = metadata
          || jsonb_build_object('laboratorio_externo', false)
          || jsonb_build_object('flag_correction', true)
      where attendance_id = p_attendance_id
        and pipeline_type = 'escaneamento'
        and finished_at is null;
    elsif p_com_laboratorio_externo_escaneamento and old_com_laboratorio_externo_escaneamento = false then
      if not exists (
        select 1 from public.pipeline_items
        where attendance_id = p_attendance_id
          and pipeline_type = 'escaneamento'
          and finished_at is null
      ) then
        select id into v_queue_item_id
        from public.queue_items
        where attendance_id = p_attendance_id
          and exam_type = 'escaneamento_intra_oral'
          and status = 'finalizado'
          and deleted_at is null
        limit 1;

        if v_queue_item_id is not null then
          insert into public.pipeline_items (
            attendance_id, queue_item_id, pipeline_type, status,
            metadata, notes, created_by
          ) values (
            p_attendance_id, v_queue_item_id, 'escaneamento',
            'pendente_envio',
            jsonb_build_object(
              'source_exam_type', 'escaneamento_intra_oral',
              'laboratorio_externo', true,
              'flag_correction', true
            ),
            p_reason,
            v_performed_by
          );
        end if;
      else
        -- Ja existe pipeline_item aberto: apenas atualiza o metadata
        update public.pipeline_items
        set
          metadata = metadata
            || jsonb_build_object('laboratorio_externo', true)
            || jsonb_build_object('flag_correction', true),
          notes = p_reason
        where attendance_id = p_attendance_id
          and pipeline_type = 'escaneamento'
          and finished_at is null;
      end if;
    end if;
  end if;

  -- Retorno
  select coalesce(jsonb_agg(to_jsonb(qi) order by qi.created_at), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items qi
  where qi.attendance_id = p_attendance_id;

  select coalesce(jsonb_agg(to_jsonb(pi) order by pi.opened_at), '[]'::jsonb)
  into updated_pipeline_items
  from public.pipeline_items pi
  where pi.attendance_id = p_attendance_id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItems', updated_queue_items,
    'pipelineItems', updated_pipeline_items
  );
end;
$$;
