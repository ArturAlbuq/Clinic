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
