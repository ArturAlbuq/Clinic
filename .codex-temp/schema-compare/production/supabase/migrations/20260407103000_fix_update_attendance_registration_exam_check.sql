create or replace function public.update_attendance_registration(
  p_attendance_id uuid,
  p_patient_name text,
  p_notes text,
  p_exam_quantities jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  locked_item record;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() <> 'admin' then
    raise exception 'sem permissao para editar atendimento';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'nome do paciente invalido';
  end if;

  if coalesce(p_exam_quantities, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'selecione ao menos um exame';
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

  if target_attendance.canceled_at is not null then
    raise exception 'atendimento cancelado nao pode ser editado';
  end if;

  for locked_item in
    select exam_type, requested_quantity
    from public.queue_items
    where attendance_id = target_attendance.id
      and status <> 'aguardando'
  loop
    if not coalesce(p_exam_quantities ? locked_item.exam_type::text, false) then
      raise exception 'exame % ja iniciou e nao pode ser removido', locked_item.exam_type;
    end if;

    if greatest(
      1,
      case
        when jsonb_typeof(p_exam_quantities -> locked_item.exam_type::text) = 'number'
          then (p_exam_quantities ->> locked_item.exam_type::text)::integer
        else 1
      end
    ) <> locked_item.requested_quantity then
      raise exception 'quantidade do exame % nao pode ser alterada apos iniciar', locked_item.exam_type;
    end if;
  end loop;

  update public.attendances
  set
    patient_name = trim(p_patient_name),
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = target_attendance.id
  returning *
  into target_attendance;

  delete from public.queue_items
  where attendance_id = target_attendance.id
    and status = 'aguardando';

  insert into public.queue_items (attendance_id, exam_type, requested_quantity)
  select
    target_attendance.id,
    desired.key::public.exam_type,
    greatest(
      1,
      case
        when jsonb_typeof(desired.value) = 'number'
          then desired.value::text::integer
        else 1
      end
    )
  from jsonb_each(coalesce(p_exam_quantities, '{}'::jsonb)) as desired
  where not exists (
    select 1
    from public.queue_items existing_item
    where existing_item.attendance_id = target_attendance.id
      and existing_item.exam_type::text = desired.key
  );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items q
  where q.attendance_id = target_attendance.id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItems', updated_queue_items
  );
end;
$$;
