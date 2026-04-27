-- Remove unique constraint to allow multiple repetitions per exam
alter table public.exam_repetitions drop constraint if exists exam_repetitions_queue_item_id_key;

-- Add repetition sequence number to track repetition order
alter table public.exam_repetitions add column if not exists repetition_sequence integer default 0;

-- Update existing records to have sequence using CTE
with ranked as (
  select id, row_number() over (partition by queue_item_id order by repeated_at asc) as seq
  from public.exam_repetitions
)
update public.exam_repetitions er
set repetition_sequence = ranked.seq
from ranked
where er.id = ranked.id;

-- Make repetition_sequence not null
alter table public.exam_repetitions alter column repetition_sequence set not null;

-- Add unique constraint per queue_item
alter table public.exam_repetitions add constraint exam_repetitions_unique_sequence unique (queue_item_id, repetition_sequence);
