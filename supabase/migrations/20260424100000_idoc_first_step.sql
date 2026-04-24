-- Migration: 20260424100000_idoc_first_step.sql
-- Part 1: Update trigger function to create laudo pipeline for all radiographic
--         exam types regardless of com_laudo, and include telerradiografia.
-- Part 2: Backfill laudo pipeline_items for already-finalizado queue_items
--         that have com_laudo = false and no existing laudo pipeline.

-- =============================================================================
-- Part 1: Redefine handle_queue_item_pipeline_opening
-- =============================================================================

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

  -- Laudo: um pipeline_item exclusivo por queue_item
  -- Criado para todos os tipos radiograficos, independente de com_laudo
  if new.exam_type in (
    'periapical',
    'interproximal',
    'panoramica',
    'tomografia',
    'telerradiografia'
  ) then
    perform public.create_laudo_pipeline_item(
      new.attendance_id,
      new.id,
      jsonb_build_object(
        'source_exam_type', new.exam_type,
        'com_laudo', new.com_laudo
      ),
      pipeline_created_by
    );
  end if;

  -- Cefalometria: continua por cadastro
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

-- =============================================================================
-- Part 2: Backfill laudo pipeline_items for finalizado queue_items with
--         com_laudo = false that have no existing laudo pipeline
-- =============================================================================

do $$
declare
  r record;
  new_pi_id uuid;
  v_opened_at timestamptz;
begin
  for r in
    select
      qi.id           as queue_item_id,
      qi.attendance_id,
      qi.exam_type,
      qi.finished_at,
      qi.updated_at,
      qi.finished_by,
      qi.started_by,
      qi.called_by,
      a.created_by    as attendance_created_by
    from public.queue_items qi
    join public.attendances a on a.id = qi.attendance_id
    where qi.status = 'finalizado'
      and qi.com_laudo = false
      and qi.exam_type in (
        'periapical', 'interproximal', 'panoramica',
        'tomografia', 'telerradiografia'
      )
      and qi.deleted_at is null
      and not exists (
        select 1
        from public.pipeline_item_queue_items piqi
        join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
        where piqi.queue_item_id = qi.id
          and pi.pipeline_type = 'laudo'
      )
  loop
    v_opened_at := coalesce(r.finished_at, r.updated_at, timezone('utc', now()));

    insert into public.pipeline_items (
      attendance_id,
      queue_item_id,
      pipeline_type,
      metadata,
      created_by,
      opened_at,
      sla_deadline
    )
    values (
      r.attendance_id,
      r.queue_item_id,
      'laudo'::public.pipeline_type,
      jsonb_build_object(
        'source_exam_type', r.exam_type,
        'com_laudo', false
      ),
      coalesce(r.finished_by, r.started_by, r.called_by, r.attendance_created_by),
      v_opened_at,
      null
    )
    returning id into new_pi_id;

    insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
    values (new_pi_id, r.queue_item_id)
    on conflict do nothing;
  end loop;
end;
$$;
