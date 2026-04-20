-- Drop the trigger that was automatically inserting into exam_repetitions
-- on every finalized exam, without user action. This caused false positives.
drop trigger if exists on_queue_item_finalized on public.queue_items;
drop function if exists public.handle_exam_repetition();

-- Delete all auto-generated repetitions (they have no reason set).
-- Legitimate manual repetitions always have a reason.
delete from public.exam_repetitions where repetition_reason is null;
