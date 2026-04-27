create or replace function public.normalize_attendance_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at = timezone('utc', now());
  new.return_pending_at = null;
  new.return_pending_by = null;
  new.return_pending_reason = null;
  new.canceled_at = null;
  new.canceled_by = null;
  new.cancellation_reason = null;
  new.cancellation_authorized_by = null;
  new.deleted_at = null;
  new.deleted_by = null;
  new.deletion_reason = null;

  return new;
end;
$$;

drop policy if exists "attendances_insert_recepcao_or_admin" on public.attendances;
create policy "attendances_insert_recepcao_or_admin"
on public.attendances
for insert
to authenticated
with check (
  public.current_app_role() in ('recepcao', 'admin')
  and created_by = auth.uid()
  and return_pending_at is null
  and return_pending_by is null
  and return_pending_reason is null
  and canceled_at is null
  and canceled_by is null
  and cancellation_reason is null
  and cancellation_authorized_by is null
  and deleted_at is null
  and deleted_by is null
  and deletion_reason is null
);

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

  if public.current_app_role() not in ('atendimento', 'admin') then
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

  return jsonb_build_object('attendance', to_jsonb(target_attendance));
end;
$$;

create or replace function public.delete_attendance(
  p_attendance_id uuid,
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

  if public.current_app_role() <> 'admin' then
    raise exception 'sem permissao para excluir atendimento';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo de exclusao obrigatorio';
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

  if exists (
    select 1
    from public.queue_items q
    where q.attendance_id = target_attendance.id
      and q.status <> 'aguardando'
  ) then
    raise exception 'atendimento em movimentacao nao pode ser excluido';
  end if;

  update public.attendances
  set
    deleted_at = timezone('utc', now()),
    deleted_by = auth.uid(),
    deletion_reason = trim(p_reason)
  where id = target_attendance.id
  returning *
  into target_attendance;

  return jsonb_build_object('attendance', to_jsonb(target_attendance));
end;
$$;
