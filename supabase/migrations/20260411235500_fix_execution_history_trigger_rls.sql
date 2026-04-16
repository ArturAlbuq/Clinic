create or replace function public.sync_queue_item_execution_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  execution_started_at timestamptz;
  next_cycle_number integer;
begin
  actor_user_id := coalesce(
    auth.uid(),
    new.updated_by,
    old.updated_by,
    new.started_by,
    old.started_by,
    new.finished_by,
    new.canceled_by,
    new.return_pending_by,
    new.reactivated_by
  );

  if old.return_pending_at is null and new.return_pending_at is not null then
    update public.queue_item_executions
    set
      ended_at = coalesce(new.return_pending_at, timezone('utc', now())),
      ended_by = coalesce(new.return_pending_by, actor_user_id),
      end_kind = 'retorno_pendente'
    where queue_item_id = new.id
      and ended_at is null;

    return new;
  end if;

  if old.status <> 'finalizado' and new.status = 'finalizado' then
    update public.queue_item_executions
    set
      ended_at = coalesce(new.finished_at, timezone('utc', now())),
      ended_by = coalesce(new.finished_by, actor_user_id),
      end_kind = 'finalizado'
    where queue_item_id = new.id
      and ended_at is null;

    return new;
  end if;

  if old.status <> 'cancelado' and new.status = 'cancelado' then
    update public.queue_item_executions
    set
      ended_at = coalesce(new.canceled_at, timezone('utc', now())),
      ended_by = coalesce(new.canceled_by, actor_user_id),
      end_kind = 'cancelado'
    where queue_item_id = new.id
      and ended_at is null;

    return new;
  end if;

  if (
    (old.status <> 'em_atendimento' and new.status = 'em_atendimento')
    or (
      old.return_pending_at is not null
      and new.return_pending_at is null
      and new.status = 'em_atendimento'
    )
  ) then
    if not exists (
      select 1
      from public.queue_item_executions execution
      where execution.queue_item_id = new.id
        and execution.ended_at is null
    ) then
      select coalesce(max(execution.cycle_number), 0) + 1
      into next_cycle_number
      from public.queue_item_executions execution
      where execution.queue_item_id = new.id;

      execution_started_at := case
        when old.return_pending_at is not null and new.return_pending_at is null
          then coalesce(new.reactivated_at, timezone('utc', now()))
        else coalesce(new.started_at, timezone('utc', now()))
      end;

      insert into public.queue_item_executions (
        attendance_id,
        queue_item_id,
        exam_type,
        room_slug,
        cycle_number,
        started_at,
        started_by
      )
      values (
        new.attendance_id,
        new.id,
        new.exam_type,
        new.room_slug,
        next_cycle_number,
        execution_started_at,
        coalesce(new.started_by, new.reactivated_by, actor_user_id)
      );

      perform set_config('clinic.allow_repetition_count_update', 'true', true);

      update public.queue_items
      set repetition_count = greatest(next_cycle_number - 1, 0)
      where id = new.id;
    end if;
  end if;

  return new;
end;
$$;
