-- Move com_laudo de attendances para queue_items.
-- Cada queue_item agora carrega seu proprio flag de laudo,
-- permitindo selecao independente por exame.

-- 1. Adiciona coluna em queue_items
alter table public.queue_items
  add column if not exists com_laudo boolean not null default false;

-- 2. Remove coluna de attendances
alter table public.attendances
  drop column if exists com_laudo;

-- 3. Atualiza a RPC de criacao: recebe mapa por exam type em vez de boolean global
create or replace function public.create_attendance_with_queue_items(
  p_patient_name text,
  p_priority public.attendance_priority,
  p_notes text,
  p_exam_types public.exam_type[],
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null,
  p_com_laudo_per_exam jsonb default '{}'::jsonb,
  p_com_cefalometria boolean default false,
  p_com_impressao_fotografia boolean default false,
  p_com_laboratorio_externo_escaneamento boolean default false
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
    created_by,
    com_cefalometria,
    com_impressao_fotografia,
    com_laboratorio_externo_escaneamento
  )
  values (
    trim(p_patient_name),
    trim(p_patient_registration_number),
    p_priority,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    coalesce(p_com_cefalometria, false),
    coalesce(p_com_impressao_fotografia, false),
    coalesce(p_com_laboratorio_externo_escaneamento, false)
  )
  returning *
  into created_attendance;

  with distinct_exam as (
    select distinct unnest(p_exam_types) as exam_type
  ),
  inserted_items as (
    insert into public.queue_items (attendance_id, exam_type, requested_quantity, com_laudo)
    select
      created_attendance.id,
      distinct_exam.exam_type,
      case
        when coalesce(p_exam_quantities, '{}'::jsonb) ? distinct_exam.exam_type::text
          then greatest(
            1,
            (coalesce(p_exam_quantities, '{}'::jsonb) ->> distinct_exam.exam_type::text)::integer
          )
        else 1
      end,
      coalesce(
        (coalesce(p_com_laudo_per_exam, '{}'::jsonb) ->> distinct_exam.exam_type::text)::boolean,
        false
      )
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

-- 4. Atualiza a RPC de edicao: remove p_com_laudo
create or replace function public.update_attendance_registration(
  p_attendance_id uuid,
  p_patient_name text,
  p_notes text,
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null,
  p_com_cefalometria boolean default null,
  p_com_impressao_fotografia boolean default null,
  p_com_laboratorio_externo_escaneamento boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  target_attendance public.attendances%rowtype;
  locked_item record;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  actor_role := public.current_app_role();

  if actor_role not in ('recepcao', 'admin') then
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
    and public.user_can_access_attendance(id)
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  if target_attendance.canceled_at is not null then
    raise exception 'atendimento cancelado nao pode ser editado';
  end if;

  if actor_role = 'recepcao' and exists (
    select 1
    from public.queue_items q
    where q.attendance_id = target_attendance.id
      and (
        q.status <> 'aguardando'
        or q.return_pending_at is not null
        or q.called_at is not null
        or q.started_at is not null
        or q.finished_at is not null
        or q.canceled_at is not null
        or q.reactivated_at is not null
      )
  ) then
    raise exception 'recepcao so pode editar atendimento antes da chamada';
  end if;

  for locked_item in
    select exam_type, requested_quantity
    from public.queue_items
    where attendance_id = target_attendance.id
      and (status <> 'aguardando' or return_pending_at is not null)
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
    patient_registration_number = nullif(trim(coalesce(p_patient_registration_number, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    com_cefalometria = coalesce(p_com_cefalometria, target_attendance.com_cefalometria),
    com_impressao_fotografia = coalesce(
      p_com_impressao_fotografia,
      target_attendance.com_impressao_fotografia
    ),
    com_laboratorio_externo_escaneamento = coalesce(
      p_com_laboratorio_externo_escaneamento,
      target_attendance.com_laboratorio_externo_escaneamento
    )
  where id = target_attendance.id
  returning *
  into target_attendance;

  delete from public.queue_items
  where attendance_id = target_attendance.id
    and status = 'aguardando'
    and return_pending_at is null;

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

-- 5. Atualiza o trigger para ler NEW.com_laudo em vez de target_attendance.com_laudo
create or replace function public.handle_queue_item_pipeline_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  pipeline_created_by uuid;
  pipeline_metadata jsonb;
begin
  select *
  into target_attendance
  from public.attendances
  where id = new.attendance_id;

  if target_attendance.id is null then
    return new;
  end if;

  pipeline_created_by := coalesce(
    auth.uid(),
    new.finished_by,
    new.started_by,
    new.called_by,
    target_attendance.created_by
  );

  -- Laudo: lido do proprio queue_item (independente por exame)
  if new.com_laudo
    and new.exam_type in (
      'periapical',
      'interproximal',
      'panoramica',
      'telerradiografia',
      'tomografia'
    ) then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'laudo',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

  -- Cefalometria: continua lida da attendance (flag por cadastro)
  if target_attendance.com_cefalometria
    and new.exam_type = 'telerradiografia' then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'cefalometria',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'fotografia' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);

    if target_attendance.com_impressao_fotografia then
      pipeline_metadata := pipeline_metadata || jsonb_build_object('com_impressao', true);
    end if;

    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'fotografia',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'escaneamento_intra_oral' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);

    if target_attendance.com_laboratorio_externo_escaneamento then
      pipeline_metadata := pipeline_metadata
        || jsonb_build_object('laboratorio_externo', true);
    end if;

    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'escaneamento',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  return new;
end;
$$;
