-- Cria as funcoes e triggers do modulo de esteira:
-- abertura automatica ao finalizar queue_items, guarda de mutacoes
-- e historico automatico de eventos de status.

create or replace function public.guard_pipeline_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  actor_role := public.current_app_role();

  if tg_op = 'INSERT' then
    new.status := coalesce(new.status, 'nao_iniciado'::public.pipeline_status);
    new.notes := nullif(trim(coalesce(new.notes, '')), '');
    new.metadata := coalesce(new.metadata, '{}'::jsonb);
    new.opened_at := coalesce(new.opened_at, timezone('utc', now()));
    new.updated_at := timezone('utc', now());
    new.created_by := coalesce(new.created_by, auth.uid());

    if new.status = 'publicado_finalizado' and new.finished_at is null then
      new.finished_at := new.opened_at;
    end if;

    return new;
  end if;

  if new.attendance_id is distinct from old.attendance_id then
    raise exception 'attendance_id nao pode ser alterado';
  end if;

  if new.queue_item_id is distinct from old.queue_item_id then
    raise exception 'queue_item_id nao pode ser alterado';
  end if;

  if new.pipeline_type is distinct from old.pipeline_type then
    raise exception 'pipeline_type nao pode ser alterado';
  end if;

  if new.opened_at is distinct from old.opened_at then
    raise exception 'opened_at nao pode ser alterado manualmente';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by nao pode ser alterado manualmente';
  end if;

  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  new.updated_at := timezone('utc', now());

  if new.status is distinct from old.status then
    if new.status = 'publicado_finalizado' then
      new.finished_at := coalesce(new.finished_at, timezone('utc', now()));
    elsif old.status = 'publicado_finalizado' then
      new.finished_at := null;
    else
      new.finished_at := old.finished_at;
    end if;
  else
    new.finished_at := old.finished_at;
  end if;

  if actor_role in ('recepcao', 'atendimento') then
    if new.responsible_id is distinct from old.responsible_id then
      raise exception 'responsible_id nao pode ser alterado por este perfil';
    end if;

    if new.sla_deadline is distinct from old.sla_deadline then
      raise exception 'sla_deadline nao pode ser alterado por este perfil';
    end if;

    if new.metadata is distinct from old.metadata then
      raise exception 'metadata nao pode ser alterado por este perfil';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.log_pipeline_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pipeline_events (
      pipeline_item_id,
      previous_status,
      new_status,
      performed_by,
      notes,
      metadata
    )
    values (
      new.id,
      null,
      new.status,
      coalesce(auth.uid(), new.created_by),
      new.notes,
      coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('event_type', 'created')
    );

    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.pipeline_events (
      pipeline_item_id,
      previous_status,
      new_status,
      performed_by,
      notes,
      metadata
    )
    values (
      new.id,
      old.status,
      new.status,
      auth.uid(),
      new.notes,
      jsonb_build_object('event_type', 'status_changed')
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_pipeline_item_if_missing(
  p_attendance_id uuid,
  p_queue_item_id uuid,
  p_pipeline_type public.pipeline_type,
  p_metadata jsonb default '{}'::jsonb,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_pipeline_item_id uuid;
begin
  select pipeline_item.id
  into created_pipeline_item_id
  from public.pipeline_items pipeline_item
  where pipeline_item.attendance_id = p_attendance_id
    and pipeline_item.pipeline_type = p_pipeline_type
    and pipeline_item.finished_at is null
  order by pipeline_item.opened_at desc
  limit 1;

  if created_pipeline_item_id is not null then
    return created_pipeline_item_id;
  end if;

  insert into public.pipeline_items (
    attendance_id,
    queue_item_id,
    pipeline_type,
    metadata,
    notes,
    created_by
  )
  values (
    p_attendance_id,
    p_queue_item_id,
    p_pipeline_type,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_created_by
  )
  returning id
  into created_pipeline_item_id;

  return created_pipeline_item_id;
exception
  when unique_violation then
    select pipeline_item.id
    into created_pipeline_item_id
    from public.pipeline_items pipeline_item
    where pipeline_item.attendance_id = p_attendance_id
      and pipeline_item.pipeline_type = p_pipeline_type
      and pipeline_item.finished_at is null
    order by pipeline_item.opened_at desc
    limit 1;

    return created_pipeline_item_id;
end;
$$;

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

  if target_attendance.com_laudo
    and new.exam_type in (
      'periapical',
      'interproximal',
      'panoramica',
      'telerradiografia',
      'tomografia'
    ) then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'laudo',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

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
      pipeline_metadata := pipeline_metadata
        || jsonb_build_object('laboratorio_externo', true);
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

drop trigger if exists pipeline_items_guard_mutation on public.pipeline_items;
create trigger pipeline_items_guard_mutation
before insert or update on public.pipeline_items
for each row execute procedure public.guard_pipeline_item_mutation();

drop trigger if exists pipeline_items_log_events on public.pipeline_items;
create trigger pipeline_items_log_events
after insert or update on public.pipeline_items
for each row execute procedure public.log_pipeline_item_event();

drop trigger if exists queue_items_open_pipeline_on_finalize on public.queue_items;
create trigger queue_items_open_pipeline_on_finalize
after update on public.queue_items
for each row
when (new.status = 'finalizado' and old.status <> 'finalizado')
execute procedure public.handle_queue_item_pipeline_opening();
