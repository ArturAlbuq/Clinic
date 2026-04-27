create table if not exists public.queue_item_executions (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendances (id) on delete cascade,
  queue_item_id uuid not null references public.queue_items (id) on delete cascade,
  exam_type public.exam_type not null,
  room_slug text not null references public.exam_rooms (slug) on update cascade,
  cycle_number integer not null check (cycle_number > 0),
  started_at timestamptz not null,
  started_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  end_kind text check (
    end_kind in ('finalizado', 'cancelado', 'retorno_pendente', 'legacy_manual')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists queue_item_executions_queue_cycle_idx
  on public.queue_item_executions (queue_item_id, cycle_number);

create index if not exists queue_item_executions_started_at_idx
  on public.queue_item_executions (started_at desc);

create index if not exists queue_item_executions_exam_started_at_idx
  on public.queue_item_executions (exam_type, started_at desc);

create index if not exists queue_item_executions_room_started_at_idx
  on public.queue_item_executions (room_slug, started_at desc);

create index if not exists queue_item_executions_started_by_started_at_idx
  on public.queue_item_executions (started_by, started_at desc);

alter table public.queue_item_executions enable row level security;

drop policy if exists "queue_item_executions_select_admin_or_room" on public.queue_item_executions;
create policy "queue_item_executions_select_admin_or_room"
on public.queue_item_executions
for select
to authenticated
using (
  public.current_app_role() = 'admin'
  or (
    public.current_app_role() = 'atendimento'
    and public.user_has_room_access(room_slug)
  )
);

create or replace function public.sync_queue_item_execution_history()
returns trigger
language plpgsql
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

drop trigger if exists queue_items_sync_execution_history on public.queue_items;
create trigger queue_items_sync_execution_history
after update of status, return_pending_at, reactivated_at on public.queue_items
for each row execute procedure public.sync_queue_item_execution_history();

insert into public.queue_item_executions (
  attendance_id,
  queue_item_id,
  exam_type,
  room_slug,
  cycle_number,
  started_at,
  started_by,
  ended_at,
  ended_by,
  end_kind
)
select
  q.attendance_id,
  q.id,
  q.exam_type,
  q.room_slug,
  1,
  q.started_at,
  q.started_by,
  coalesce(q.finished_at, q.canceled_at, q.return_pending_at),
  coalesce(q.finished_by, q.canceled_by, q.return_pending_by),
  case
    when q.finished_at is not null then 'finalizado'
    when q.canceled_at is not null then 'cancelado'
    when q.return_pending_at is not null then 'retorno_pendente'
    else null
  end
from public.queue_items q
where q.started_at is not null
  and not exists (
    select 1
    from public.queue_item_executions execution
    where execution.queue_item_id = q.id
  );

insert into public.queue_item_executions (
  attendance_id,
  queue_item_id,
  exam_type,
  room_slug,
  cycle_number,
  started_at,
  started_by,
  ended_at,
  ended_by,
  end_kind
)
select
  repetition.attendance_id,
  repetition.queue_item_id,
  repetition.exam_type,
  repetition.room_slug,
  repetition.sequence_number + 1,
  repetition.created_at,
  repetition.operator_user_id,
  repetition.created_at,
  coalesce(repetition.operator_user_id, repetition.recorded_by),
  'legacy_manual'
from (
  select
    history.*,
    row_number() over (
      partition by history.queue_item_id
      order by history.created_at asc, history.id asc
    ) as sequence_number
  from public.queue_item_repetitions history
) repetition
where not exists (
  select 1
  from public.queue_item_executions execution
  where execution.queue_item_id = repetition.queue_item_id
    and execution.cycle_number = repetition.sequence_number + 1
);

do $$
begin
  perform set_config('clinic.allow_repetition_count_update', 'true', true);

  update public.queue_items queue_item
  set repetition_count = greatest(coalesce(execution.total_cycles, 0) - 1, 0)
  from (
    select queue_item_id, count(*)::integer as total_cycles
    from public.queue_item_executions
    group by queue_item_id
  ) execution
  where queue_item.id = execution.queue_item_id;

  update public.queue_items
  set repetition_count = 0
  where id not in (
    select distinct queue_item_id
    from public.queue_item_executions
  );
end
$$;
