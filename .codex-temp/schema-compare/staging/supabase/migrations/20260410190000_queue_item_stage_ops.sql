alter table public.queue_items
  add column if not exists canceled_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_authorized_by uuid references public.profiles (id) on delete set null,
  add column if not exists return_pending_at timestamptz,
  add column if not exists return_pending_by uuid references public.profiles (id) on delete set null,
  add column if not exists return_pending_reason text,
  add column if not exists reactivated_at timestamptz,
  add column if not exists reactivated_by uuid references public.profiles (id) on delete set null;

update public.queue_items q
set
  canceled_by = coalesce(q.canceled_by, a.canceled_by),
  cancellation_reason = coalesce(q.cancellation_reason, a.cancellation_reason),
  cancellation_authorized_by = coalesce(
    q.cancellation_authorized_by,
    a.cancellation_authorized_by
  )
from public.attendances a
where q.attendance_id = a.id
  and q.status = 'cancelado'
  and (
    q.canceled_by is null
    or q.cancellation_reason is null
    or q.cancellation_authorized_by is null
  );

update public.queue_items q
set
  return_pending_at = coalesce(q.return_pending_at, a.return_pending_at),
  return_pending_by = coalesce(q.return_pending_by, a.return_pending_by),
  return_pending_reason = coalesce(q.return_pending_reason, a.return_pending_reason)
from public.attendances a
where q.attendance_id = a.id
  and q.status not in ('finalizado', 'cancelado')
  and a.return_pending_at is not null
  and (
    q.return_pending_at is null
    or q.return_pending_by is null
    or q.return_pending_reason is null
  );

drop view if exists public.attendance_overview;

create or replace view public.attendance_overview
with (security_invoker = true)
as
select
  a.id,
  a.patient_name,
  a.priority,
  a.notes,
  a.created_at,
  a.created_by,
  a.canceled_at,
  a.canceled_by,
  a.cancellation_reason,
  a.cancellation_authorized_by,
  count(q.id)::integer as total_steps,
  count(*) filter (where q.status = 'finalizado')::integer as finished_steps,
  count(*) filter (where q.status = 'aguardando')::integer as waiting_steps,
  count(*) filter (
    where q.status = 'chamado' or q.status = 'em_atendimento'
  )::integer as active_steps,
  count(*) filter (where q.status = 'cancelado')::integer as canceled_steps,
  count(*) filter (
    where q.status not in ('finalizado', 'cancelado')
      and q.return_pending_at is not null
  )::integer as return_pending_steps,
  case
    when a.canceled_at is not null then 'cancelado'
    when count(q.id) = 0 then 'aguardando'
    when count(*) filter (where q.status = 'cancelado') = count(q.id) then 'cancelado'
    when count(*) filter (
      where q.status in ('finalizado', 'cancelado')
    ) = count(q.id)
      and count(*) filter (where q.status = 'finalizado') > 0 then 'finalizado'
    when count(*) filter (
      where q.status not in ('finalizado', 'cancelado')
        and q.return_pending_at is not null
    ) = count(*) filter (
      where q.status not in ('finalizado', 'cancelado')
    )
      and count(*) filter (
        where q.status not in ('finalizado', 'cancelado')
      ) > 0 then 'pendente_retorno'
    when count(*) filter (where q.status = 'aguardando') = count(q.id) then 'aguardando'
    when count(*) filter (
      where q.status = 'chamado' or q.status = 'em_atendimento'
    ) > 0 then 'em_andamento'
    else 'em_andamento'
  end::text as overall_status,
  (
    select q_current.room_slug
    from public.queue_items q_current
    where q_current.attendance_id = a.id
      and q_current.status in ('chamado', 'em_atendimento')
    order by q_current.created_at asc
    limit 1
  ) as current_room_slug
from public.attendances a
left join public.queue_items q
  on q.attendance_id = a.id
group by a.id;

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

create or replace function public.cancel_attendance(
  p_attendance_id uuid,
  p_reason text,
  p_authorized_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('recepcao', 'atendimento', 'admin') then
    raise exception 'sem permissao para cancelar atendimento';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo de cancelamento obrigatorio';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = p_attendance_id
    and public.user_can_access_attendance(id)
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  if target_attendance.canceled_at is not null then
    raise exception 'atendimento ja cancelado';
  end if;

  if not exists (
    select 1
    from public.queue_items q
    where q.attendance_id = target_attendance.id
      and q.status not in ('finalizado', 'cancelado')
  ) then
    raise exception 'atendimento sem etapas abertas para cancelamento';
  end if;

  update public.attendances
  set
    canceled_at = timezone('utc', now()),
    canceled_by = auth.uid(),
    cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
    cancellation_authorized_by = p_authorized_by
  where id = target_attendance.id
  returning *
  into target_attendance;

  with updated_items as (
    update public.queue_items
    set
      status = 'cancelado',
      canceled_by = auth.uid(),
      cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
      cancellation_authorized_by = p_authorized_by,
      return_pending_at = null,
      return_pending_by = null,
      return_pending_reason = null,
      updated_by = auth.uid()
    where attendance_id = target_attendance.id
      and status not in ('finalizado', 'cancelado')
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(updated_items)), '[]'::jsonb)
  into updated_queue_items
  from updated_items;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItems', updated_queue_items
  );
end;
$$;

create or replace function public.update_attendance_registration(
  p_attendance_id uuid,
  p_patient_name text,
  p_notes text,
  p_exam_quantities jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  locked_item record;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() <> 'admin' then
    raise exception 'sem permissao para editar atendimento';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'nome do paciente invalido';
  end if;

  if coalesce(p_exam_quantities, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'selecione ao menos um exame';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = p_attendance_id
    and deleted_at is null
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  if target_attendance.canceled_at is not null then
    raise exception 'atendimento cancelado nao pode ser editado';
  end if;

  for locked_item in
    select exam_type, requested_quantity
    from public.queue_items
    where attendance_id = target_attendance.id
      and (status <> 'aguardando' or return_pending_at is not null)
  loop
    if not coalesce(p_exam_quantities ? locked_item.exam_type::text, false) then
      raise exception 'exame % ja iniciou e nao pode ser removido', locked_item.exam_type;
    end if;

    if greatest(
      1,
      case
        when jsonb_typeof(p_exam_quantities -> locked_item.exam_type::text) = 'number'
          then (p_exam_quantities ->> locked_item.exam_type::text)::integer
        else 1
      end
    ) <> locked_item.requested_quantity then
      raise exception 'quantidade do exame % nao pode ser alterada apos iniciar', locked_item.exam_type;
    end if;
  end loop;

  update public.attendances
  set
    patient_name = trim(p_patient_name),
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = target_attendance.id
  returning *
  into target_attendance;

  delete from public.queue_items
  where attendance_id = target_attendance.id
    and status = 'aguardando'
    and return_pending_at is null;

  insert into public.queue_items (attendance_id, exam_type, requested_quantity)
  select
    target_attendance.id,
    desired.key::public.exam_type,
    greatest(
      1,
      case
        when jsonb_typeof(desired.value) = 'number'
          then desired.value::text::integer
        else 1
      end
    )
  from jsonb_each(coalesce(p_exam_quantities, '{}'::jsonb)) as desired
  where not exists (
    select 1
    from public.queue_items existing_item
    where existing_item.attendance_id = target_attendance.id
      and existing_item.exam_type::text = desired.key
  );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items q
  where q.attendance_id = target_attendance.id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItems', updated_queue_items
  );
end;
$$;

create or replace function public.set_attendance_return_pending(
  p_attendance_id uuid,
  p_is_pending boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('recepcao', 'atendimento', 'admin') then
    raise exception 'sem permissao para marcar retorno';
  end if;

  if p_is_pending and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo de retorno obrigatorio';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = p_attendance_id
    and deleted_at is null
    and public.user_can_access_attendance(id)
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  if target_attendance.canceled_at is not null then
    raise exception 'atendimento cancelado nao pode ser marcado';
  end if;

  if not exists (
    select 1
    from public.queue_items q
    where q.attendance_id = target_attendance.id
      and q.status not in ('finalizado', 'cancelado')
  ) then
    raise exception 'atendimento sem etapas pendentes';
  end if;

  update public.attendances
  set
    return_pending_at = case when p_is_pending then timezone('utc', now()) else null end,
    return_pending_by = case when p_is_pending then auth.uid() else null end,
    return_pending_reason = case
      when p_is_pending then nullif(trim(coalesce(p_reason, '')), '')
      else null
    end
  where id = target_attendance.id
  returning *
  into target_attendance;

  update public.queue_items
  set
    return_pending_at = case when p_is_pending then timezone('utc', now()) else null end,
    return_pending_by = case when p_is_pending then auth.uid() else null end,
    return_pending_reason = case
      when p_is_pending then nullif(trim(coalesce(p_reason, '')), '')
      else null
    end,
    reactivated_at = case when p_is_pending then null else timezone('utc', now()) end,
    reactivated_by = case when p_is_pending then null else auth.uid() end,
    updated_by = auth.uid()
  where attendance_id = target_attendance.id
    and status not in ('finalizado', 'cancelado');

  return jsonb_build_object('attendance', to_jsonb(target_attendance));
end;
$$;

create or replace function public.cancel_queue_item(
  p_queue_item_id uuid,
  p_reason text,
  p_authorized_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  target_queue_item public.queue_items%rowtype;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() <> 'admin' then
    raise exception 'sem permissao para cancelar etapa';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo de cancelamento obrigatorio';
  end if;

  select q.*
  into target_queue_item
  from public.queue_items q
  join public.attendances a
    on a.id = q.attendance_id
  where q.id = p_queue_item_id
    and q.deleted_at is null
    and a.deleted_at is null
    and public.user_can_access_attendance(a.id)
  for update of q;

  if target_queue_item.id is null then
    raise exception 'etapa nao encontrada';
  end if;

  if target_queue_item.status in ('finalizado', 'cancelado') then
    raise exception 'etapa sem cancelamento disponivel';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = target_queue_item.attendance_id;

  update public.queue_items
  set
    status = 'cancelado',
    canceled_by = auth.uid(),
    cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
    cancellation_authorized_by = p_authorized_by,
    return_pending_at = null,
    return_pending_by = null,
    return_pending_reason = null,
    reactivated_at = null,
    reactivated_by = null,
    updated_by = auth.uid()
  where id = target_queue_item.id
  returning *
  into target_queue_item;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items q
  where q.attendance_id = target_attendance.id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItem', to_jsonb(target_queue_item),
    'queueItems', updated_queue_items
  );
end;
$$;

create or replace function public.set_queue_item_return_pending(
  p_queue_item_id uuid,
  p_is_pending boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  target_queue_item public.queue_items%rowtype;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('recepcao', 'atendimento', 'admin') then
    raise exception 'sem permissao para marcar retorno';
  end if;

  if p_is_pending and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo de retorno obrigatorio';
  end if;

  select q.*
  into target_queue_item
  from public.queue_items q
  join public.attendances a
    on a.id = q.attendance_id
  where q.id = p_queue_item_id
    and q.deleted_at is null
    and a.deleted_at is null
    and public.user_can_access_attendance(a.id)
  for update of q;

  if target_queue_item.id is null then
    raise exception 'etapa nao encontrada';
  end if;

  if target_queue_item.status in ('finalizado', 'cancelado') then
    raise exception 'etapa sem pendencia';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = target_queue_item.attendance_id;

  update public.queue_items
  set
    return_pending_at = case when p_is_pending then timezone('utc', now()) else null end,
    return_pending_by = case when p_is_pending then auth.uid() else null end,
    return_pending_reason = case
      when p_is_pending then nullif(trim(coalesce(p_reason, '')), '')
      else null
    end,
    reactivated_at = case when p_is_pending then null else timezone('utc', now()) end,
    reactivated_by = case when p_is_pending then null else auth.uid() end,
    updated_by = auth.uid()
  where id = target_queue_item.id
  returning *
  into target_queue_item;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items q
  where q.attendance_id = target_attendance.id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItem', to_jsonb(target_queue_item),
    'queueItems', updated_queue_items
  );
end;
$$;

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
  and canceled_by is null
  and cancellation_reason is null
  and cancellation_authorized_by is null
  and return_pending_at is null
  and return_pending_by is null
  and return_pending_reason is null
  and reactivated_at is null
  and reactivated_by is null
  and updated_by is null
);
