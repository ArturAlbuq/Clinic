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
    'finalizado'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.attendance_priority as enum ('normal', 'alta', 'urgente');
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

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null check (char_length(trim(patient_name)) >= 2),
  priority public.attendance_priority not null default 'normal',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references public.profiles (id),
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
  called_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
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
    'Fotografia / escaneamento intra-oral',
    1
  ),
  ('periapical', 'periapical', 'Periapical', 2),
  ('panoramico', 'panoramico', 'Panorâmico', 3),
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
  count(q.id)::integer as total_steps,
  count(*) filter (where q.status = 'finalizado')::integer as finished_steps,
  count(*) filter (where q.status = 'aguardando')::integer as waiting_steps,
  count(*) filter (
    where q.status = 'chamado' or q.status = 'em_atendimento'
  )::integer as active_steps,
  case
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
    coalesce((metadata ->> 'role')::public.app_role, 'recepcao'::public.app_role)
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role;

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
    raise exception 'Sala não encontrada para o exame %', new.exam_type;
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
    raise exception 'Atendimento não encontrado para queue_item %', new.attendance_id;
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

  if old.status = 'aguardando' and new.status = 'chamado' then
    return new;
  end if;

  if old.status = 'chamado' and new.status = 'em_atendimento' then
    return new;
  end if;

  if old.status = 'em_atendimento' and new.status = 'finalizado' then
    return new;
  end if;

  raise exception 'Transição de status inválida: % -> %', old.status, new.status;
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
  end if;

  if new.status = 'em_atendimento' and old.started_at is null then
    new.started_at = timezone('utc', now());
  end if;

  if new.status = 'finalizado' and old.finished_at is null then
    new.finished_at = timezone('utc', now());
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

drop policy if exists "attendances_select_authenticated" on public.attendances;
create policy "attendances_select_authenticated"
on public.attendances
for select
to authenticated
using (true);

drop policy if exists "attendances_insert_recepcao_or_admin" on public.attendances;
create policy "attendances_insert_recepcao_or_admin"
on public.attendances
for insert
to authenticated
with check (
  public.current_app_role() in ('recepcao', 'admin')
  and created_by = auth.uid()
);

drop policy if exists "queue_items_select_authenticated" on public.queue_items;
create policy "queue_items_select_authenticated"
on public.queue_items
for select
to authenticated
using (true);

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

drop policy if exists "queue_items_update_atendimento_or_admin" on public.queue_items;
create policy "queue_items_update_atendimento_or_admin"
on public.queue_items
for update
to authenticated
using (public.current_app_role() in ('atendimento', 'admin'))
with check (public.current_app_role() in ('atendimento', 'admin'));

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
