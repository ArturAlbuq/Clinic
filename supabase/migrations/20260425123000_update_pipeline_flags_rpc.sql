-- Permite correcao atomica dos flags que alimentam o pipeline de pos-atendimento.
-- Mantem as policies existentes e reforca a protecao de queue_items.com_laudo
-- contra updates diretos por perfis nao-admin.

create or replace function public.guard_queue_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status = 'aguardando';
    new.called_at = null;
    new.called_by = null;
    new.started_at = null;
    new.started_by = null;
    new.finished_at = null;
    new.finished_by = null;
    new.canceled_at = null;
    new.canceled_by = null;
    new.cancellation_reason = null;
    new.cancellation_authorized_by = null;
    new.return_pending_at = null;
    new.return_pending_by = null;
    new.return_pending_reason = null;
    new.reactivated_at = null;
    new.reactivated_by = null;
    new.deleted_at = null;
    new.deleted_by = null;
    new.created_at = timezone('utc', now());
    new.updated_at = timezone('utc', now());
    new.updated_by = null;

    return new;
  end if;

  if new.attendance_id is distinct from old.attendance_id then
    raise exception 'attendance_id nao pode ser alterado';
  end if;

  if new.exam_type is distinct from old.exam_type then
    raise exception 'exam_type nao pode ser alterado';
  end if;

  if new.room_slug is distinct from old.room_slug then
    raise exception 'room_slug nao pode ser alterado';
  end if;

  if new.patient_name is distinct from old.patient_name then
    raise exception 'patient_name nao pode ser alterado';
  end if;

  if new.notes is distinct from old.notes then
    raise exception 'notes nao pode ser alterado';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by nao pode ser alterado';
  end if;

  if new.requested_quantity is distinct from old.requested_quantity then
    raise exception 'requested_quantity nao pode ser alterado';
  end if;

  if new.com_laudo is distinct from old.com_laudo
    and public.current_app_role() <> 'admin' then
    raise exception 'com_laudo so pode ser alterado por admin';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at nao pode ser alterado';
  end if;

  if new.called_at is distinct from old.called_at then
    raise exception 'called_at nao pode ser alterado manualmente';
  end if;

  if new.called_by is distinct from old.called_by then
    raise exception 'called_by nao pode ser alterado manualmente';
  end if;

  if new.started_at is distinct from old.started_at then
    raise exception 'started_at nao pode ser alterado manualmente';
  end if;

  if new.started_by is distinct from old.started_by then
    raise exception 'started_by nao pode ser alterado manualmente';
  end if;

  if new.finished_at is distinct from old.finished_at then
    raise exception 'finished_at nao pode ser alterado manualmente';
  end if;

  if new.finished_by is distinct from old.finished_by then
    raise exception 'finished_by nao pode ser alterado manualmente';
  end if;

  if new.canceled_at is distinct from old.canceled_at then
    raise exception 'canceled_at nao pode ser alterado manualmente';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_at nao pode ser alterado manualmente';
  end if;

  if new.deleted_by is distinct from old.deleted_by then
    raise exception 'deleted_by nao pode ser alterado manualmente';
  end if;

  if new.updated_at is distinct from old.updated_at then
    raise exception 'updated_at nao pode ser alterado manualmente';
  end if;

  return new;
end;
$$;

create or replace function public.update_pipeline_flags(
  p_queue_item_id uuid,
  p_com_laudo boolean default null,
  p_com_cefalometria boolean default null,
  p_com_impressao_fotografia boolean default null,
  p_com_laboratorio_externo_escaneamento boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  target_queue_item public.queue_items%rowtype;
  target_attendance public.attendances%rowtype;
  next_com_laudo boolean;
  next_com_cefalometria boolean;
  next_com_impressao_fotografia boolean;
  next_com_laboratorio_externo_escaneamento boolean;
  updated_pipeline_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  actor_role := public.current_app_role();

  if actor_role <> 'admin' then
    raise exception 'sem permissao para corrigir flags de pos-atendimento';
  end if;

  select *
  into target_queue_item
  from public.queue_items
  where id = p_queue_item_id
    and deleted_at is null
  for update;

  if target_queue_item.id is null then
    raise exception 'queue_item nao encontrado';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = target_queue_item.attendance_id
    and deleted_at is null
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  next_com_laudo := coalesce(p_com_laudo, target_queue_item.com_laudo);
  next_com_cefalometria := coalesce(
    p_com_cefalometria,
    target_attendance.com_cefalometria
  );
  next_com_impressao_fotografia := coalesce(
    p_com_impressao_fotografia,
    target_attendance.com_impressao_fotografia
  );
  next_com_laboratorio_externo_escaneamento := coalesce(
    p_com_laboratorio_externo_escaneamento,
    target_attendance.com_laboratorio_externo_escaneamento
  );

  update public.queue_items
  set
    com_laudo = next_com_laudo,
    updated_by = auth.uid()
  where id = target_queue_item.id
  returning *
  into target_queue_item;

  update public.attendances
  set
    com_cefalometria = next_com_cefalometria,
    com_impressao_fotografia = next_com_impressao_fotografia,
    com_laboratorio_externo_escaneamento = next_com_laboratorio_externo_escaneamento
  where id = target_attendance.id
  returning *
  into target_attendance;

  -- Laudo: desde 20260424100000 o pipeline de laudo existe para todos os
  -- exames radiograficos finalizados; o flag controla o fluxo via metadata.
  update public.pipeline_items pipeline_item
  set metadata = jsonb_set(
    coalesce(pipeline_item.metadata, '{}'::jsonb),
    '{com_laudo}',
    to_jsonb(next_com_laudo),
    true
  )
  where pipeline_item.pipeline_type = 'laudo'
    and (
      pipeline_item.queue_item_id = target_queue_item.id
      or exists (
        select 1
        from public.pipeline_item_queue_items link
        where link.pipeline_item_id = pipeline_item.id
          and link.queue_item_id = target_queue_item.id
      )
    );

  if target_queue_item.status = 'finalizado'
    and target_queue_item.exam_type in (
      'periapical',
      'interproximal',
      'panoramica',
      'tomografia',
      'telerradiografia'
    )
    and not exists (
      select 1
      from public.pipeline_item_queue_items link
      join public.pipeline_items pipeline_item
        on pipeline_item.id = link.pipeline_item_id
      where link.queue_item_id = target_queue_item.id
        and pipeline_item.pipeline_type = 'laudo'
        and pipeline_item.finished_at is null
    ) then
    perform public.create_laudo_pipeline_item(
      target_queue_item.attendance_id,
      target_queue_item.id,
      jsonb_build_object(
        'source_exam_type', target_queue_item.exam_type,
        'com_laudo', next_com_laudo
      ),
      auth.uid()
    );
  end if;

  -- Cefalometria: flag por atendimento; cria o item se o exame elegivel ja
  -- tiver finalizado e a esteira ainda nao existir.
  if next_com_cefalometria
    and exists (
      select 1
      from public.queue_items queue_item
      where queue_item.attendance_id = target_attendance.id
        and queue_item.exam_type = 'telerradiografia'
        and queue_item.status = 'finalizado'
        and queue_item.deleted_at is null
    ) then
    perform public.create_pipeline_item_if_missing(
      target_attendance.id,
      (
        select queue_item.id
        from public.queue_items queue_item
        where queue_item.attendance_id = target_attendance.id
          and queue_item.exam_type = 'telerradiografia'
          and queue_item.status = 'finalizado'
          and queue_item.deleted_at is null
        order by queue_item.finished_at desc nulls last, queue_item.updated_at desc
        limit 1
      ),
      'cefalometria',
      jsonb_build_object('source_exam_type', 'telerradiografia'),
      null,
      auth.uid()
    );
  end if;

  -- Fotografia e escaneamento sempre usam metadata para decidir os proximos
  -- passos opcionais.
  update public.pipeline_items pipeline_item
  set metadata = jsonb_set(
    coalesce(pipeline_item.metadata, '{}'::jsonb),
    '{com_impressao}',
    to_jsonb(next_com_impressao_fotografia),
    true
  )
  where pipeline_item.attendance_id = target_attendance.id
    and pipeline_item.pipeline_type = 'fotografia';

  update public.pipeline_items pipeline_item
  set metadata = jsonb_set(
    coalesce(pipeline_item.metadata, '{}'::jsonb),
    '{laboratorio_externo}',
    to_jsonb(next_com_laboratorio_externo_escaneamento),
    true
  )
  where pipeline_item.attendance_id = target_attendance.id
    and pipeline_item.pipeline_type = 'escaneamento';

  select coalesce(jsonb_agg(to_jsonb(pipeline_item) order by pipeline_item.opened_at), '[]'::jsonb)
  into updated_pipeline_items
  from public.pipeline_items pipeline_item
  where pipeline_item.attendance_id = target_attendance.id
    and (
      pipeline_item.pipeline_type in ('cefalometria', 'fotografia', 'escaneamento')
      or exists (
        select 1
        from public.pipeline_item_queue_items link
        where link.pipeline_item_id = pipeline_item.id
          and link.queue_item_id = target_queue_item.id
      )
    );

  return jsonb_build_object(
    'queueItem', to_jsonb(target_queue_item),
    'attendance', to_jsonb(target_attendance),
    'pipelineItems', updated_pipeline_items
  );
end;
$$;
