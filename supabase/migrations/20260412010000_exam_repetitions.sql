-- tabela exam_repetitions
create table if not exists public.exam_repetitions (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid not null unique references public.queue_items (id) on delete cascade,
  attendance_id uuid not null references public.attendances (id) on delete cascade,
  exam_type public.exam_type not null,
  room_slug text references public.exam_rooms (slug) on update cascade,
  technician_id uuid references public.profiles (id) on delete set null,
  repeated_at timestamptz not null default (now() at time zone 'America/Manaus'),
  repetition_index integer not null check (repetition_index > 0)
);

create index if not exists exam_repetitions_repeated_at_idx
  on public.exam_repetitions (repeated_at desc);

create index if not exists exam_repetitions_exam_type_repeated_at_idx
  on public.exam_repetitions (exam_type, repeated_at desc);

create index if not exists exam_repetitions_technician_repeated_at_idx
  on public.exam_repetitions (technician_id, repeated_at desc);

create index if not exists exam_repetitions_room_slug_repeated_at_idx
  on public.exam_repetitions (room_slug, repeated_at desc);

-- RLS
alter table public.exam_repetitions enable row level security;

create policy "exam_repetitions_select_admin"
on public.exam_repetitions
for select
to authenticated
using (public.current_app_role() = 'admin');

-- trigger
create or replace function public.handle_exam_repetition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_count integer;
begin
  select count(*)
  into prior_count
  from public.queue_items
  where attendance_id = new.attendance_id
    and exam_type = new.exam_type
    and status = 'finalizado'
    and id <> new.id;

  if prior_count >= 1 then
    insert into public.exam_repetitions (
      queue_item_id,
      attendance_id,
      exam_type,
      room_slug,
      technician_id,
      repeated_at,
      repetition_index
    )
    values (
      new.id,
      new.attendance_id,
      new.exam_type,
      new.room_slug,
      new.finished_by,
      now() at time zone 'America/Manaus',
      prior_count
    )
    on conflict (queue_item_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_queue_item_finalized on public.queue_items;
create trigger on_queue_item_finalized
after update on public.queue_items
for each row
when (old.status <> 'finalizado' and new.status = 'finalizado')
execute procedure public.handle_exam_repetition();
