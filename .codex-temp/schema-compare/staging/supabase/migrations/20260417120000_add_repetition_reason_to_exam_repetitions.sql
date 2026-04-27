alter table public.exam_repetitions
add column if not exists repetition_reason text;

comment on column public.exam_repetitions.repetition_reason is
  'Texto livre descrevendo o motivo da repeticao do exame, capturado pelo atendente.';

create index if not exists exam_repetitions_repetition_reason_idx
  on public.exam_repetitions (repetition_reason);

create or replace function public.register_exam_repetition(
  p_queue_item_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_reason text;
  repetition_id uuid;
  target_queue_item public.queue_items%rowtype;
  prior_count integer;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() <> 'atendimento' then
    raise exception 'sem permissao para registrar repeticao';
  end if;

  normalized_reason := trim(coalesce(p_reason, ''));

  if char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500 then
    raise exception 'motivo deve ter entre 3 e 500 caracteres';
  end if;

  select q.*
  into target_queue_item
  from public.queue_items q
  where q.id = p_queue_item_id
    and q.deleted_at is null
  for update of q;

  if target_queue_item.id is null then
    raise exception 'item da fila nao encontrado';
  end if;

  if target_queue_item.status not in ('em_atendimento', 'finalizado') then
    raise exception 'status invalido para repeticao';
  end if;

  select count(*)
  into prior_count
  from public.queue_items q
  where q.exam_type = target_queue_item.exam_type
    and q.status = 'finalizado'
    and q.id <> target_queue_item.id;

  insert into public.exam_repetitions (
    queue_item_id,
    exam_type,
    room_slug,
    technician_id,
    repetition_index,
    repetition_reason
  )
  values (
    target_queue_item.id,
    target_queue_item.exam_type,
    target_queue_item.room_slug,
    auth.uid(),
    greatest(prior_count, 1),
    normalized_reason
  )
  on conflict (queue_item_id) do update
  set repetition_reason = excluded.repetition_reason
  returning id into repetition_id;

  return jsonb_build_object(
    'success', true,
    'repetitionId', repetition_id
  );
end;
$$;

grant execute on function public.register_exam_repetition(uuid, text) to authenticated;
