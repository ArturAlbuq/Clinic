alter table public.attendances
  add column if not exists patient_registration_number text;

create index if not exists attendances_patient_registration_number_idx
  on public.attendances (patient_registration_number);

drop view if exists public.attendance_overview;

create or replace view public.attendance_overview
with (security_invoker = true)
as
select
  a.id,
  a.patient_name,
  a.patient_registration_number,
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

create or replace function public.create_attendance_with_queue_items(
  p_patient_name text,
  p_priority public.attendance_priority,
  p_notes text,
  p_exam_types public.exam_type[],
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  created_attendance public.attendances%rowtype;
  created_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('recepcao', 'admin') then
    raise exception 'sem permissao para criar atendimento';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'nome do paciente invalido';
  end if;

  if coalesce(array_length(p_exam_types, 1), 0) = 0 then
    raise exception 'selecione ao menos um exame';
  end if;

  insert into public.attendances (
    patient_name,
    patient_registration_number,
    priority,
    notes,
    created_by
  )
  values (
    trim(p_patient_name),
    nullif(trim(coalesce(p_patient_registration_number, '')), ''),
    p_priority,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning *
  into created_attendance;

  with distinct_exam as (
    select distinct unnest(p_exam_types) as exam_type
  ),
  inserted_items as (
    insert into public.queue_items (attendance_id, exam_type, requested_quantity)
    select
      created_attendance.id,
      distinct_exam.exam_type,
      case
        when jsonb_typeof(p_exam_quantities -> distinct_exam.exam_type::text) = 'number'
          then greatest(1, (p_exam_quantities ->> distinct_exam.exam_type::text)::integer)
        else 1
      end
    from distinct_exam
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(inserted_items)), '[]'::jsonb)
  into created_queue_items
  from inserted_items;

  return jsonb_build_object(
    'attendance', to_jsonb(created_attendance),
    'queueItems', created_queue_items
  );
end;
$$;

create or replace function public.update_attendance_registration(
  p_attendance_id uuid,
  p_patient_name text,
  p_notes text,
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null
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
    patient_registration_number = nullif(trim(coalesce(p_patient_registration_number, '')), ''),
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
