alter table public.profiles
  alter column role set default 'recepcao'::public.app_role;

create table if not exists public.profile_room_access (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  room_slug text not null references public.exam_rooms (slug) on update cascade on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, room_slug)
);

create index if not exists profile_room_access_room_slug_idx
  on public.profile_room_access (room_slug);

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
  p_exam_types public.exam_type[]
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

  with inserted_items as (
    insert into public.queue_items (attendance_id, exam_type)
    select created_attendance.id, distinct_exam.exam_type
    from (
      select distinct unnest(p_exam_types) as exam_type
    ) as distinct_exam
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

alter table public.profile_room_access enable row level security;

drop policy if exists "profile_room_access_select_self_or_admin" on public.profile_room_access;
create policy "profile_room_access_select_self_or_admin"
on public.profile_room_access
for select
to authenticated
using (profile_id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists "attendances_select_authenticated" on public.attendances;
drop policy if exists "attendances_select_by_role_and_scope" on public.attendances;
create policy "attendances_select_by_role_and_scope"
on public.attendances
for select
to authenticated
using (public.user_can_access_attendance(id));

drop policy if exists "queue_items_select_authenticated" on public.queue_items;
drop policy if exists "queue_items_select_by_role_and_room" on public.queue_items;
create policy "queue_items_select_by_role_and_room"
on public.queue_items
for select
to authenticated
using (public.user_has_room_access(room_slug));

drop policy if exists "queue_items_update_atendimento_or_admin" on public.queue_items;
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
