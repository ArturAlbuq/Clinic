create or replace function public.normalize_attendance_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at = timezone('utc', now());
  new.canceled_at = null;
  new.canceled_by = null;
  new.cancellation_reason = null;
  new.cancellation_authorized_by = null;

  return new;
end;
$$;

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

  if new.updated_at is distinct from old.updated_at then
    raise exception 'updated_at nao pode ser alterado manualmente';
  end if;

  return new;
end;
$$;

drop trigger if exists attendances_normalize_insert on public.attendances;
create trigger attendances_normalize_insert
before insert on public.attendances
for each row execute procedure public.normalize_attendance_insert();

drop trigger if exists queue_items_guard_mutation on public.queue_items;
create trigger queue_items_guard_mutation
before insert or update on public.queue_items
for each row execute procedure public.guard_queue_item_mutation();

drop policy if exists "attendances_insert_recepcao_or_admin" on public.attendances;
create policy "attendances_insert_recepcao_or_admin"
on public.attendances
for insert
to authenticated
with check (
  public.current_app_role() in ('recepcao', 'admin')
  and created_by = auth.uid()
  and canceled_at is null
  and canceled_by is null
  and cancellation_reason is null
  and cancellation_authorized_by is null
);

drop policy if exists "queue_items_insert_recepcao_or_admin" on public.queue_items;
create policy "queue_items_insert_recepcao_or_admin"
on public.queue_items
for insert
to authenticated
with check (
  public.current_app_role() in ('recepcao', 'admin')
  and exists (
    select 1
    from public.attendances a
    where a.id = attendance_id
      and a.created_by = auth.uid()
  )
  and status = 'aguardando'
  and called_at is null
  and called_by is null
  and started_at is null
  and started_by is null
  and finished_at is null
  and finished_by is null
  and canceled_at is null
  and updated_by is null
);
