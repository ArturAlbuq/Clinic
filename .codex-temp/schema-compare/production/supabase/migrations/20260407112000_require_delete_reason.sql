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
