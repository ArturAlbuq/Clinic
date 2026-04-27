create or replace function public.create_attendance_with_queue_items(
  p_patient_name text,
  p_priority public.attendance_priority,
  p_notes text,
  p_exam_types public.exam_type[],
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  created_attendance public.attendances%rowtype;
  created_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('recepcao', 'admin') then
    raise exception 'sem permissao para criar atendimento';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'nome do paciente invalido';
  end if;

  if char_length(trim(coalesce(p_patient_registration_number, ''))) < 1 then
    raise exception 'numero do cadastro obrigatorio';
  end if;

  if coalesce(array_length(p_exam_types, 1), 0) = 0 then
    raise exception 'selecione ao menos um exame';
  end if;

  insert into public.attendances (
    patient_name,
    patient_registration_number,
    priority,
    notes,
    created_by
  )
  values (
    trim(p_patient_name),
    trim(p_patient_registration_number),
    p_priority,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning *
  into created_attendance;

  with distinct_exam as (
    select distinct unnest(p_exam_types) as exam_type
  ),
  inserted_items as (
    insert into public.queue_items (attendance_id, exam_type, requested_quantity)
    select
      created_attendance.id,
      distinct_exam.exam_type,
      case
        when jsonb_typeof(p_exam_quantities -> distinct_exam.exam_type::text) = 'number'
          then greatest(1, (p_exam_quantities ->> distinct_exam.exam_type::text)::integer)
        else 1
      end
    from distinct_exam
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(inserted_items)), '[]'::jsonb)
  into created_queue_items
  from inserted_items;

  return jsonb_build_object(
    'attendance', to_jsonb(created_attendance),
    'queueItems', created_queue_items
  );
end;
$$;
