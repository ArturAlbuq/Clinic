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

drop policy if exists "attendances_select_by_role_and_scope" on public.attendances;
create policy "attendances_select_authenticated"
on public.attendances
for select
to authenticated
using (true);

drop policy if exists "queue_items_select_by_role_and_room" on public.queue_items;
create policy "queue_items_select_authenticated"
on public.queue_items
for select
to authenticated
using (true);

drop policy if exists "queue_items_update_by_room_or_admin" on public.queue_items;
create policy "queue_items_update_atendimento_or_admin"
on public.queue_items
for update
to authenticated
using (public.current_app_role() in ('atendimento', 'admin'))
with check (public.current_app_role() in ('atendimento', 'admin'));

drop policy if exists "profile_room_access_select_self_or_admin" on public.profile_room_access;
drop table if exists public.profile_room_access;

drop function if exists public.user_has_room_access(text);
drop function if exists public.user_can_access_attendance(uuid);
drop function if exists public.create_attendance_with_queue_items(
  text,
  public.attendance_priority,
  text,
  public.exam_type[]
);
