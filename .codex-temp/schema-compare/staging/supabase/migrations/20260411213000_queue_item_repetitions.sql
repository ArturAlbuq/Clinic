do $$
begin
  create type public.exam_repeat_reason as enum (
    'erro_posicionamento',
    'movimento_paciente',
    'falha_tecnica',
    'imagem_insatisfatoria',
    'erro_configuracao',
    'artefato_interferencia',
    'cooperacao_insuficiente',
    'solicitacao_responsavel_tecnico',
    'problema_equipamento',
    'outro'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.queue_items
  add column if not exists repetition_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'queue_items_repetition_count_check'
  ) then
    alter table public.queue_items
      add constraint queue_items_repetition_count_check
      check (repetition_count >= 0);
  end if;
end
$$;

create table if not exists public.queue_item_repetitions (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendances (id) on delete cascade,
  queue_item_id uuid not null references public.queue_items (id) on delete cascade,
  exam_type public.exam_type not null,
  room_slug text not null references public.exam_rooms (slug) on update cascade,
  reason public.exam_repeat_reason not null,
  notes text,
  operator_user_id uuid references public.profiles (id) on delete set null,
  recorded_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists queue_item_repetitions_created_at_idx
  on public.queue_item_repetitions (created_at desc);

create index if not exists queue_item_repetitions_queue_item_created_at_idx
  on public.queue_item_repetitions (queue_item_id, created_at desc);

create index if not exists queue_item_repetitions_attendance_created_at_idx
  on public.queue_item_repetitions (attendance_id, created_at desc);

create index if not exists queue_item_repetitions_reason_created_at_idx
  on public.queue_item_repetitions (reason, created_at desc);

create or replace function public.register_queue_item_repetition(
  p_queue_item_id uuid,
  p_reason public.exam_repeat_reason,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  target_queue_item public.queue_items%rowtype;
  created_repetition public.queue_item_repetitions%rowtype;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('atendimento', 'admin') then
    raise exception 'sem permissao para registrar repeticao';
  end if;

  if p_reason = 'outro'::public.exam_repeat_reason
    and char_length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'detalhe da repeticao obrigatorio para outro motivo';
  end if;

  select q.*
  into target_queue_item
  from public.queue_items q
  join public.attendances a
    on a.id = q.attendance_id
  where q.id = p_queue_item_id
    and q.deleted_at is null
    and a.deleted_at is null
    and public.user_can_access_attendance(a.id)
  for update of q;

  if target_queue_item.id is null then
    raise exception 'etapa nao encontrada';
  end if;

  if target_queue_item.status = 'cancelado' then
    raise exception 'etapa cancelada nao pode registrar repeticao';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = target_queue_item.attendance_id;

  insert into public.queue_item_repetitions (
    attendance_id,
    queue_item_id,
    exam_type,
    room_slug,
    reason,
    notes,
    operator_user_id,
    recorded_by
  )
  values (
    target_attendance.id,
    target_queue_item.id,
    target_queue_item.exam_type,
    target_queue_item.room_slug,
    p_reason,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(target_queue_item.started_by, target_queue_item.called_by, auth.uid()),
    auth.uid()
  )
  returning *
  into created_repetition;

  perform set_config('clinic.allow_repetition_count_update', 'true', true);

  update public.queue_items
  set
    repetition_count = repetition_count + 1,
    updated_by = auth.uid()
  where id = target_queue_item.id
  returning *
  into target_queue_item;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items q
  where q.attendance_id = target_attendance.id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItem', to_jsonb(target_queue_item),
    'queueItems', updated_queue_items,
    'repetition', to_jsonb(created_repetition)
  );
end;
$$;

create or replace function public.guard_queue_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status = 'aguardando';
    new.called_at = null;
    new.called_by = null;
    new.started_at = null;
    new.started_by = null;
    new.finished_at = null;
    new.finished_by = null;
    new.canceled_at = null;
    new.canceled_by = null;
    new.cancellation_reason = null;
    new.cancellation_authorized_by = null;
    new.return_pending_at = null;
    new.return_pending_by = null;
    new.return_pending_reason = null;
    new.reactivated_at = null;
    new.reactivated_by = null;
    new.deleted_at = null;
    new.deleted_by = null;
    new.repetition_count = 0;
    new.created_at = timezone('utc', now());
    new.updated_at = timezone('utc', now());
    new.updated_by = null;

    return new;
  end if;

  if new.attendance_id is distinct from old.attendance_id then
    raise exception 'attendance_id nao pode ser alterado';
  end if;

  if new.exam_type is distinct from old.exam_type then
    raise exception 'exam_type nao pode ser alterado';
  end if;

  if new.room_slug is distinct from old.room_slug then
    raise exception 'room_slug nao pode ser alterado';
  end if;

  if new.patient_name is distinct from old.patient_name then
    raise exception 'patient_name nao pode ser alterado';
  end if;

  if new.notes is distinct from old.notes then
    raise exception 'notes nao pode ser alterado';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by nao pode ser alterado';
  end if;

  if new.requested_quantity is distinct from old.requested_quantity then
    raise exception 'requested_quantity nao pode ser alterado';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at nao pode ser alterado';
  end if;

  if new.called_at is distinct from old.called_at then
    raise exception 'called_at nao pode ser alterado manualmente';
  end if;

  if new.called_by is distinct from old.called_by then
    raise exception 'called_by nao pode ser alterado manualmente';
  end if;

  if new.started_at is distinct from old.started_at then
    raise exception 'started_at nao pode ser alterado manualmente';
  end if;

  if new.started_by is distinct from old.started_by then
    raise exception 'started_by nao pode ser alterado manualmente';
  end if;

  if new.finished_at is distinct from old.finished_at then
    raise exception 'finished_at nao pode ser alterado manualmente';
  end if;

  if new.finished_by is distinct from old.finished_by then
    raise exception 'finished_by nao pode ser alterado manualmente';
  end if;

  if new.canceled_at is distinct from old.canceled_at then
    raise exception 'canceled_at nao pode ser alterado manualmente';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_at nao pode ser alterado manualmente';
  end if;

  if new.deleted_by is distinct from old.deleted_by then
    raise exception 'deleted_by nao pode ser alterado manualmente';
  end if;

  if new.repetition_count is distinct from old.repetition_count
    and current_setting('clinic.allow_repetition_count_update', true) <> 'true' then
    raise exception 'repetition_count nao pode ser alterado manualmente';
  end if;

  if new.updated_at is distinct from old.updated_at then
    raise exception 'updated_at nao pode ser alterado manualmente';
  end if;

  return new;
end;
$$;

alter table public.queue_item_repetitions enable row level security;

drop policy if exists "queue_items_insert_recepcao_or_admin" on public.queue_items;
create policy "queue_items_insert_recepcao_or_admin"
on public.queue_items
for insert
to authenticated
with check (
  public.current_app_role() in ('recepcao', 'admin')
  and exists (
    select 1
    from public.attendances a
    where a.id = attendance_id
      and a.created_by = auth.uid()
  )
  and status = 'aguardando'
  and called_at is null
  and called_by is null
  and started_at is null
  and started_by is null
  and finished_at is null
  and finished_by is null
  and canceled_at is null
  and canceled_by is null
  and cancellation_reason is null
  and cancellation_authorized_by is null
  and return_pending_at is null
  and return_pending_by is null
  and return_pending_reason is null
  and reactivated_at is null
  and reactivated_by is null
  and repetition_count = 0
  and updated_by is null
);

drop policy if exists "queue_item_repetitions_select_admin_or_room" on public.queue_item_repetitions;
create policy "queue_item_repetitions_select_admin_or_room"
on public.queue_item_repetitions
for select
to authenticated
using (
  public.current_app_role() = 'admin'
  or (
    public.current_app_role() = 'atendimento'
    and public.user_has_room_access(room_slug)
  )
);

do $$
begin
  alter publication supabase_realtime add table public.queue_item_repetitions;
exception
  when duplicate_object then null;
end
$$;
