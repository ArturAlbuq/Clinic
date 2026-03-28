alter type public.queue_status add value if not exists 'cancelado';

drop function if exists public.create_attendance_with_queue_items(
  text,
  public.attendance_priority,
  text,
  public.exam_type[]
);

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n
      on n.oid = t.typnamespace
    where t.typname = 'attendance_priority_v2'
      and n.nspname = 'public'
  ) then
    create type public.attendance_priority_v2 as enum (
      'normal',
      'sessenta_mais_outras',
      'oitenta_mais'
    );
  end if;
end
$$;

alter table public.attendances
  alter column priority drop default;

alter table public.attendances
  alter column priority type public.attendance_priority_v2
  using (
    case priority::text
      when 'urgente' then 'oitenta_mais'
      when 'alta' then 'sessenta_mais_outras'
      else 'normal'
    end
  )::public.attendance_priority_v2;

drop type if exists public.attendance_priority;

alter type public.attendance_priority_v2 rename to attendance_priority;

alter table public.attendances
  alter column priority set default 'normal'::public.attendance_priority;

alter table public.attendances
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references public.profiles (id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_authorized_by uuid references public.profiles (id);

alter table public.queue_items
  add column if not exists requested_quantity integer not null default 1,
  add column if not exists called_by uuid references public.profiles (id),
  add column if not exists started_by uuid references public.profiles (id),
  add column if not exists finished_by uuid references public.profiles (id),
  add column if not exists canceled_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'queue_items_requested_quantity_check'
  ) then
    alter table public.queue_items
      add constraint queue_items_requested_quantity_check
      check (requested_quantity >= 1);
  end if;
end
$$;

update public.exam_rooms
set name = case slug
  when 'fotografia-escaneamento' then 'Fotos/escaneamento'
  when 'periapical' then 'Radiografia intra-oral'
  when 'panoramico' then 'Radiografia extra-oral'
  when 'tomografia' then 'Tomografia'
  else name
end;

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
  case
    when a.canceled_at is not null then 'cancelado'
    when count(q.id) = 0 then 'aguardando'
    when count(*) filter (where q.status = 'finalizado') = count(q.id) then 'finalizado'
    when count(*) filter (where q.status = 'aguardando') = count(q.id) then 'aguardando'
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

create or replace function public.enforce_queue_status_flow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'cancelado' and old.status in ('aguardando', 'chamado', 'em_atendimento') then
    return new;
  end if;

  if old.status = 'aguardando' and new.status = 'chamado' then
    return new;
  end if;

  if old.status = 'chamado' and new.status = 'em_atendimento' then
    return new;
  end if;

  if old.status = 'em_atendimento' and new.status = 'finalizado' then
    return new;
  end if;

  raise exception 'transicao de status invalida: % -> %', old.status, new.status;
end;
$$;

create or replace function public.stamp_queue_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'chamado' and old.called_at is null then
    new.called_at = timezone('utc', now());
    if auth.uid() is not null and new.called_by is null then
      new.called_by = auth.uid();
    end if;
  end if;

  if new.status = 'em_atendimento' and old.started_at is null then
    new.started_at = timezone('utc', now());
    if auth.uid() is not null and new.started_by is null then
      new.started_by = auth.uid();
    end if;
  end if;

  if new.status = 'finalizado' and old.finished_at is null then
    new.finished_at = timezone('utc', now());
    if auth.uid() is not null and new.finished_by is null then
      new.finished_by = auth.uid();
    end if;
  end if;

  if new.status = 'cancelado' and old.canceled_at is null then
    new.canceled_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

create or replace function public.create_attendance_with_queue_items(
  p_patient_name text,
  p_priority public.attendance_priority,
  p_notes text,
  p_exam_types public.exam_type[],
  p_exam_quantities jsonb default '{}'::jsonb
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
    priority,
    notes,
    created_by
  )
  values (
    trim(p_patient_name),
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

  if public.current_app_role() not in ('atendimento', 'admin') then
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
