-- supabase/migrations/20260412030000_add_gerencia_role.sql

-- 1. Adicionar valor ao enum app_role
alter type public.app_role add value if not exists 'gerencia';

-- 2. Atualizar user_has_room_access para incluir gerencia como leitura completa
create or replace function public.user_has_room_access(target_room_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() in ('admin', 'recepcao', 'gerencia') then true
    when public.current_app_role() <> 'atendimento' then false
    else exists (
      select 1
      from public.profile_room_access pra
      where pra.profile_id = auth.uid()
        and pra.room_slug = target_room_slug
    )
  end;
$$;

-- 3. Atualizar user_can_access_attendance para incluir gerencia como leitura completa
create or replace function public.user_can_access_attendance(target_attendance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() in ('admin', 'recepcao', 'gerencia') then true
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
