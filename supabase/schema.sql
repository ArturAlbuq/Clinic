create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('recepcao', 'atendimento', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.exam_type as enum (
    'fotografia_escaneamento',
    'periapical',
    'panoramico',
    'tomografia'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.queue_status as enum (
    'aguardando',
    'chamado',
    'em_atendimento',
    'finalizado',
    'cancelado'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.attendance_priority as enum (
    'normal',
    'sessenta_mais_outras',
    'oitenta_mais'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exam_rooms (
  slug text primary key,
  exam_type public.exam_type not null unique,
  name text not null,
  sort_order integer not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_room_access (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  room_slug text not null references public.exam_rooms (slug) on update cascade on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, room_slug)
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null check (char_length(trim(patient_name)) >= 2),
  priority public.attendance_priority not null default 'normal',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references public.profiles (id),
  canceled_at timestamptz,
  canceled_by uuid references public.profiles (id),
  cancellation_reason text,
  cancellation_authorized_by uuid references public.profiles (id),
  legacy_single_queue_item_id uuid unique
);

create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  patient_name text check (patient_name is null or char_length(trim(patient_name)) >= 2),
  exam_type public.exam_type not null,
  room_slug text not null references public.exam_rooms (slug) on update cascade,
  notes text,
  status public.queue_status not null default 'aguardando',
  created_by uuid references public.profiles (id),
  requested_quantity integer not null default 1 check (requested_quantity >= 1),
  called_at timestamptz,
  called_by uuid references public.profiles (id),
  started_at timestamptz,
  started_by uuid references public.profiles (id),
  finished_at timestamptz,
  finished_by uuid references public.profiles (id),
  canceled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.queue_items
  add column if not exists attendance_id uuid references public.attendances (id) on delete cascade;

alter table public.queue_items
  add column if not exists updated_by uuid references public.profiles (id);

create index if not exists attendances_created_at_idx
  on public.attendances (created_at desc);

create index if not exists attendances_priority_created_at_idx
  on public.attendances (priority, created_at asc);

create index if not exists profile_room_access_room_slug_idx
  on public.profile_room_access (room_slug);

create index if not exists queue_items_created_at_idx
  on public.queue_items (created_at desc);

create index if not exists queue_items_room_status_idx
  on public.queue_items (room_slug, status, created_at desc);

create index if not exists queue_items_attendance_id_idx
  on public.queue_items (attendance_id);

insert into public.exam_rooms (slug, exam_type, name, sort_order)
values
  (
    'fotografia-escaneamento',
    'fotografia_escaneamento',
    'Fotos/escaneamento',
    1
  ),
  ('periapical', 'periapical', 'Radiografia intra-oral', 2),
  ('panoramico', 'panoramico', 'Radiografia extra-oral', 3),
  ('tomografia', 'tomografia', 'Tomografia', 4)
on conflict (slug) do update
set
  exam_type = excluded.exam_type,
  name = excluded.name,
  sort_order = excluded.sort_order;

insert into public.attendances (
  patient_name,
  priority,
  notes,
  created_at,
  created_by,
  legacy_single_queue_item_id
)
select
  coalesce(nullif(trim(q.patient_name), ''), 'Paciente sem nome'),
  'normal'::public.attendance_priority,
  q.notes,
  q.created_at,
  q.created_by,
  q.id
from public.queue_items q
left join public.attendances a
  on a.legacy_single_queue_item_id = q.id
where q.attendance_id is null
  and q.created_by is not null
  and a.id is null;

update public.queue_items q
set attendance_id = a.id
from public.attendances a
where q.attendance_id is null
  and a.legacy_single_queue_item_id = q.id;

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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(metadata ->> 'full_name', split_part(new.email, '@', 1)),
    'recepcao'::public.app_role
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name;

  return new;
end;
$$;

create or replace function public.sync_queue_item_room()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select slug
  into new.room_slug
  from public.exam_rooms
  where exam_type = new.exam_type;

  if new.room_slug is null then
    raise exception 'sala nao encontrada para o exame %', new.exam_type;
  end if;

  return new;
end;
$$;

create or replace function public.sync_legacy_queue_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  attendance_row public.attendances%rowtype;
begin
  if new.attendance_id is null then
    raise exception 'attendance_id obrigatorio para queue_items';
  end if;

  select *
  into attendance_row
  from public.attendances
  where id = new.attendance_id;

  if attendance_row.id is null then
    raise exception 'atendimento nao encontrado para queue_item %', new.attendance_id;
  end if;

  new.patient_name = attendance_row.patient_name;
  new.notes = attendance_row.notes;
  new.created_by = attendance_row.created_by;

  return new;
end;
$$;

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

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.user_has_room_access(target_room_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() in ('admin', 'recepcao') then true
    when public.current_app_role() <> 'atendimento' then false
    else exists (
      select 1
      from public.profile_room_access pra
      where pra.profile_id = auth.uid()
        and pra.room_slug = target_room_slug
    )
  end;
$$;

create or replace function public.user_can_access_attendance(target_attendance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() in ('admin', 'recepcao') then true
    when public.current_app_role() <> 'atendimento' then false
    else exists (
      select 1
      from public.queue_items q
      join public.profile_room_access pra
        on pra.room_slug = q.room_slug
      where q.attendance_id = target_attendance_id
        and pra.profile_id = auth.uid()
    )
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists queue_items_touch_updated_at on public.queue_items;
create trigger queue_items_touch_updated_at
before update on public.queue_items
for each row execute procedure public.touch_updated_at();

drop trigger if exists queue_items_sync_room on public.queue_items;
create trigger queue_items_sync_room
before insert or update of exam_type on public.queue_items
for each row execute procedure public.sync_queue_item_room();

drop trigger if exists queue_items_sync_legacy_fields on public.queue_items;
create trigger queue_items_sync_legacy_fields
before insert or update of attendance_id on public.queue_items
for each row execute procedure public.sync_legacy_queue_fields();

drop trigger if exists queue_items_enforce_flow on public.queue_items;
create trigger queue_items_enforce_flow
before update of status on public.queue_items
for each row execute procedure public.enforce_queue_status_flow();

drop trigger if exists queue_items_stamp_status on public.queue_items;
create trigger queue_items_stamp_status
before update of status on public.queue_items
for each row execute procedure public.stamp_queue_status();

alter table public.profiles enable row level security;
alter table public.exam_rooms enable row level security;
alter table public.profile_room_access enable row level security;
alter table public.attendances enable row level security;
alter table public.queue_items enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists "exam_rooms_select_authenticated" on public.exam_rooms;
create policy "exam_rooms_select_authenticated"
on public.exam_rooms
for select
to authenticated
using (true);

drop policy if exists "profile_room_access_select_self_or_admin" on public.profile_room_access;
create policy "profile_room_access_select_self_or_admin"
on public.profile_room_access
for select
to authenticated
using (profile_id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists "attendances_select_by_role_and_scope" on public.attendances;
create policy "attendances_select_by_role_and_scope"
on public.attendances
for select
to authenticated
using (public.user_can_access_attendance(id));

drop policy if exists "attendances_insert_recepcao_or_admin" on public.attendances;
create policy "attendances_insert_recepcao_or_admin"
on public.attendances
for insert
to authenticated
with check (
  public.current_app_role() in ('recepcao', 'admin')
  and created_by = auth.uid()
);

drop policy if exists "queue_items_select_by_role_and_room" on public.queue_items;
create policy "queue_items_select_by_role_and_room"
on public.queue_items
for select
to authenticated
using (public.user_has_room_access(room_slug));

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
);

drop policy if exists "queue_items_update_by_room_or_admin" on public.queue_items;
create policy "queue_items_update_by_room_or_admin"
on public.queue_items
for update
to authenticated
using (
  public.current_app_role() = 'admin'
  or (
    public.current_app_role() = 'atendimento'
    and public.user_has_room_access(room_slug)
  )
)
with check (
  updated_by = auth.uid()
  and (
    public.current_app_role() = 'admin'
    or (
      public.current_app_role() = 'atendimento'
      and public.user_has_room_access(room_slug)
    )
  )
);

alter table public.queue_items replica identity full;
alter table public.attendances replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.queue_items;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.attendances;
exception
  when duplicate_object then null;
end
$$;
