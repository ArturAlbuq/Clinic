-- Cada exame com laudo gera sua propria esteira de pos-atendimento.
-- Antes: create_pipeline_item_if_missing reaproveitava o pipeline_item aberto.
-- Agora: laudos sempre criam um pipeline_item exclusivo por queue_item.

-- 0. Ajusta a constraint de unicidade de pipeline_items:
--    - Tipos nao-laudo: mantém unicidade por (attendance_id, pipeline_type) aberto
--    - Laudo: unicidade por (queue_item_id, pipeline_type) aberto — um por exame
drop index if exists public.pipeline_items_open_unique_idx;

create unique index pipeline_items_open_unique_non_laudo_idx
  on public.pipeline_items (attendance_id, pipeline_type)
  where finished_at is null and pipeline_type != 'laudo';

create unique index pipeline_items_open_unique_laudo_idx
  on public.pipeline_items (queue_item_id, pipeline_type)
  where finished_at is null and pipeline_type = 'laudo';

-- 1. Funcao que cria pipeline_item de laudo sem verificar se ja existe um aberto
create or replace function public.create_laudo_pipeline_item(
  p_attendance_id uuid,
  p_queue_item_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_pipeline_item_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
begin
  -- Verifica se ja existe um pipeline_item de laudo para este queue_item especifico
  select piqi.pipeline_item_id
  into created_pipeline_item_id
  from public.pipeline_item_queue_items piqi
  join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
  where piqi.queue_item_id = p_queue_item_id
    and pi.pipeline_type = 'laudo'
    and pi.finished_at is null
  limit 1;

  if created_pipeline_item_id is not null then
    return created_pipeline_item_id;
  end if;

  v_sla_subtype := public.resolve_sla_subtype('laudo'::public.pipeline_type, coalesce(p_metadata, '{}'));
  if v_sla_subtype is not null then
    select business_days into v_business_days
    from public.sla_config
    where pipeline_subtype = v_sla_subtype;
  end if;

  if v_business_days is not null then
    v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
  end if;

  insert into public.pipeline_items (
    attendance_id,
    queue_item_id,
    pipeline_type,
    metadata,
    created_by,
    sla_deadline
  )
  values (
    p_attendance_id,
    p_queue_item_id,
    'laudo'::public.pipeline_type,
    coalesce(p_metadata, '{}'),
    p_created_by,
    v_sla_deadline
  )
  returning id
  into created_pipeline_item_id;

  perform public.attach_queue_item_to_pipeline_item(
    created_pipeline_item_id,
    p_queue_item_id
  );

  return created_pipeline_item_id;
end;
$$;

-- 2. Atualiza o trigger para usar create_laudo_pipeline_item em vez de create_pipeline_item_if_missing
create or replace function public.handle_queue_item_pipeline_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  pipeline_created_by uuid;
  pipeline_metadata jsonb;
begin
  select *
  into target_attendance
  from public.attendances
  where id = new.attendance_id;

  if target_attendance.id is null then
    return new;
  end if;

  pipeline_created_by := coalesce(
    auth.uid(),
    new.finished_by,
    new.started_by,
    new.called_by,
    target_attendance.created_by
  );

  -- Laudo: um pipeline_item exclusivo por queue_item
  if new.com_laudo
    and new.exam_type in (
      'periapical',
      'interproximal',
      'panoramica',
      'tomografia'
    ) then
    perform public.create_laudo_pipeline_item(
      new.attendance_id,
      new.id,
      jsonb_build_object('source_exam_type', new.exam_type),
      pipeline_created_by
    );
  end if;

  -- Cefalometria: continua por cadastro
  if target_attendance.com_cefalometria
    and new.exam_type = 'telerradiografia' then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'cefalometria',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'fotografia' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);
    if target_attendance.com_impressao_fotografia then
      pipeline_metadata := pipeline_metadata || jsonb_build_object('com_impressao', true);
    end if;
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'fotografia',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'escaneamento_intra_oral' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);
    if target_attendance.com_laboratorio_externo_escaneamento then
      pipeline_metadata := pipeline_metadata || jsonb_build_object('laboratorio_externo', true);
    end if;
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'escaneamento',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  return new;
end;
$$;

-- 3. Backfill: desfaz agrupamentos existentes em pipeline_items de laudo abertos
-- Para cada pipeline_item de laudo aberto com mais de 1 queue_item linkado:
--   - mantém o link com o queue_item mais antigo
--   - cria um pipeline_item novo para cada queue_item excedente
do $$
declare
  r record;
  extra_qi record;
  new_pi_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
begin
  for r in
    select pi.id as pipeline_item_id, pi.attendance_id, pi.metadata, pi.created_by, pi.opened_at
    from public.pipeline_items pi
    where pi.pipeline_type = 'laudo'
      and pi.finished_at is null
      and (
        select count(*)
        from public.pipeline_item_queue_items piqi
        where piqi.pipeline_item_id = pi.id
      ) > 1
  loop
    for extra_qi in
      select piqi.queue_item_id, qi.exam_type
      from public.pipeline_item_queue_items piqi
      join public.queue_items qi on qi.id = piqi.queue_item_id
      where piqi.pipeline_item_id = r.pipeline_item_id
      order by qi.created_at asc
      offset 1
    loop
      delete from public.pipeline_item_queue_items
      where pipeline_item_id = r.pipeline_item_id
        and queue_item_id = extra_qi.queue_item_id;

      v_sla_subtype := public.resolve_sla_subtype(
        'laudo'::public.pipeline_type,
        jsonb_build_object('source_exam_type', extra_qi.exam_type)
      );
      v_business_days := null;
      v_sla_deadline := null;

      if v_sla_subtype is not null then
        select business_days into v_business_days
        from public.sla_config
        where pipeline_subtype = v_sla_subtype;
      end if;

      if v_business_days is not null then
        -- Usa opened_at do item original como base do SLA, nao now()
        v_sla_deadline := public.add_business_days(r.opened_at, v_business_days);
      end if;

      insert into public.pipeline_items (
        attendance_id,
        queue_item_id,
        pipeline_type,
        metadata,
        created_by,
        opened_at,
        sla_deadline
      )
      values (
        r.attendance_id,
        extra_qi.queue_item_id,
        'laudo'::public.pipeline_type,
        jsonb_build_object('source_exam_type', extra_qi.exam_type),
        r.created_by,
        r.opened_at,
        v_sla_deadline
      )
      returning id into new_pi_id;

      insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
      values (new_pi_id, extra_qi.queue_item_id)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;
