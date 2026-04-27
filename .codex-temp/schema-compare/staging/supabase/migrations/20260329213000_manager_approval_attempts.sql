create table if not exists public.manager_approval_attempts (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id) on delete cascade,
  attendance_id uuid not null references public.attendances (id) on delete cascade,
  manager_email text not null,
  authorized_manager_id uuid references public.profiles (id) on delete set null,
  success boolean not null,
  failure_reason text,
  ip_address text,
  user_agent text,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists manager_approval_attempts_actor_attempted_at_idx
  on public.manager_approval_attempts (actor_user_id, attempted_at desc);

create index if not exists manager_approval_attempts_attendance_attempted_at_idx
  on public.manager_approval_attempts (attendance_id, attempted_at desc);

alter table public.manager_approval_attempts enable row level security;

drop policy if exists "manager_approval_attempts_select_self_or_admin"
  on public.manager_approval_attempts;
create policy "manager_approval_attempts_select_self_or_admin"
on public.manager_approval_attempts
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or public.current_app_role() = 'admin'
);

drop policy if exists "manager_approval_attempts_insert_self"
  on public.manager_approval_attempts;
create policy "manager_approval_attempts_insert_self"
on public.manager_approval_attempts
for insert
to authenticated
with check (actor_user_id = auth.uid());
