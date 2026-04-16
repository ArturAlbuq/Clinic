-- corrige exam_repetitions: repetição é global (qualquer paciente/dia),
-- não restrita ao mesmo atendimento

-- remove coluna attendance_id que não faz parte do conceito
alter table public.exam_repetitions
  drop column if exists attendance_id;

-- atualiza a função do trigger para contar globalmente por exam_type
create or replace function public.handle_exam_repetition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_count integer;
begin
  -- conta quantos queue_items do mesmo exam_type já foram finalizados globalmente
  select count(*)
  into prior_count
  from public.queue_items
  where exam_type = new.exam_type
    and status = 'finalizado'
    and id <> new.id;

  if prior_count >= 1 then
    insert into public.exam_repetitions (
      queue_item_id,
      exam_type,
      room_slug,
      technician_id,
      repeated_at,
      repetition_index
    )
    values (
      new.id,
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
