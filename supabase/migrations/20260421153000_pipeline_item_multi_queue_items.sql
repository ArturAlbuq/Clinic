-- Permite que uma esteira de pos-atendimento referencie varios exames.
-- O campo pipeline_items.queue_item_id permanece apenas como referencia legada.

create table if not exists public.pipeline_item_queue_items (
  pipeline_item_id uuid not null references public.pipeline_items (id) on delete cascade,
  queue_item_id uuid not null references public.queue_items (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (pipeline_item_id, queue_item_id)
);

alter table public.pipeline_item_queue_items enable row level security;

drop policy if exists "pipeline_item_queue_items_select_by_scope" on public.pipeline_item_queue_items;
create policy "pipeline_item_queue_items_select_by_scope"
on public.pipeline_item_queue_items
for select
to authenticated
using (
  exists (
    select 1
    from public.pipeline_items pipeline_item
    where pipeline_item.id = pipeline_item_queue_items.pipeline_item_id
      and public.current_app_role()::text in ('recepcao', 'atendimento', 'admin', 'gerencia')
      and public.user_can_access_attendance(pipeline_item.attendance_id)
  )
);

drop policy if exists "pipeline_item_queue_items_insert_admin" on public.pipeline_item_queue_items;
create policy "pipeline_item_queue_items_insert_admin"
on public.pipeline_item_queue_items
for insert
to authenticated
with check (public.current_app_role() = 'admin');

drop policy if exists "pipeline_item_queue_items_delete_admin" on public.pipeline_item_queue_items;
create policy "pipeline_item_queue_items_delete_admin"
on public.pipeline_item_queue_items
for delete
to authenticated
using (public.current_app_role() = 'admin');

create index if not exists pipeline_item_queue_items_pipeline_item_id_idx
  on public.pipeline_item_queue_items (pipeline_item_id);

create index if not exists pipeline_item_queue_items_queue_item_id_idx
  on public.pipeline_item_queue_items (queue_item_id);

create or replace function public.attach_queue_item_to_pipeline_item(
  p_pipeline_item_id uuid,
  p_queue_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pipeline_attendance_id uuid;
  queue_attendance_id uuid;
  inserted_rows integer := 0;
begin
  if p_pipeline_item_id is null or p_queue_item_id is null then
    return;
  end if;

  select attendance_id
  into pipeline_attendance_id
  from public.pipeline_items
  where id = p_pipeline_item_id;

  select attendance_id
  into queue_attendance_id
  from public.queue_items
  where id = p_queue_item_id;

  if pipeline_attendance_id is null then
    raise exception 'pipeline_item nao encontrado';
  end if;

  if queue_attendance_id is null then
    raise exception 'queue_item nao encontrado';
  end if;

  if pipeline_attendance_id is distinct from queue_attendance_id then
    raise exception 'queue_item e pipeline_item precisam pertencer ao mesmo atendimento';
  end if;

  insert into public.pipeline_item_queue_items (
    pipeline_item_id,
    queue_item_id
  )
  values (
    p_pipeline_item_id,
    p_queue_item_id
  )
  on conflict do nothing;

  get diagnostics inserted_rows = row_count;

  if inserted_rows > 0 then
    update public.pipeline_items
    set updated_at = timezone('utc', now())
    where id = p_pipeline_item_id;
  end if;
end;
$$;

create or replace function public.create_pipeline_item_if_missing(
  p_attendance_id uuid,
  p_queue_item_id uuid,
  p_pipeline_type public.pipeline_type,
  p_metadata jsonb default '{}'::jsonb,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_pipeline_item_id uuid;
  v_sla_subtype public.sla_pipeline_subtype;
  v_business_days integer;
  v_sla_deadline timestamptz;
begin
  select pipeline_item.id
  into created_pipeline_item_id
  from public.pipeline_items pipeline_item
  where pipeline_item.attendance_id = p_attendance_id
    and pipeline_item.pipeline_type = p_pipeline_type
    and pipeline_item.finished_at is null
  order by pipeline_item.opened_at desc
  limit 1;

  if created_pipeline_item_id is not null then
    perform public.attach_queue_item_to_pipeline_item(
      created_pipeline_item_id,
      p_queue_item_id
    );
    return created_pipeline_item_id;
  end if;

  v_sla_subtype := public.resolve_sla_subtype(
    p_pipeline_type,
    coalesce(p_metadata, '{}'::jsonb)
  );

  if v_sla_subtype is not null then
    select business_days
    into v_business_days
    from public.sla_config
    where pipeline_subtype = v_sla_subtype;
  end if;

  if v_business_days is not null then
    v_sla_deadline := public.add_business_days(
      timezone('utc', now()),
      v_business_days
    );
  end if;

  insert into public.pipeline_items (
    attendance_id,
    queue_item_id,
    pipeline_type,
    metadata,
    notes,
    created_by,
    sla_deadline
  )
  values (
    p_attendance_id,
    p_queue_item_id,
    p_pipeline_type,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_created_by,
    v_sla_deadline
  )
  returning id
  into created_pipeline_item_id;

  perform public.attach_queue_item_to_pipeline_item(
    created_pipeline_item_id,
    p_queue_item_id
  );

  return created_pipeline_item_id;
exception
  when unique_violation then
    select pipeline_item.id
    into created_pipeline_item_id
    from public.pipeline_items pipeline_item
    where pipeline_item.attendance_id = p_attendance_id
      and pipeline_item.pipeline_type = p_pipeline_type
      and pipeline_item.finished_at is null
    order by pipeline_item.opened_at desc
    limit 1;

    perform public.attach_queue_item_to_pipeline_item(
      created_pipeline_item_id,
      p_queue_item_id
    );

    return created_pipeline_item_id;
end;
$$;

insert into public.pipeline_item_queue_items (
  pipeline_item_id,
  queue_item_id
)
select
  pipeline_item.id,
  pipeline_item.queue_item_id
from public.pipeline_items pipeline_item
where pipeline_item.queue_item_id is not null
on conflict do nothing;

with inferred_pipeline_links as (
  select
    matched_pipeline.id as pipeline_item_id,
    queue_item.id as queue_item_id
  from public.queue_items queue_item
  join public.attendances attendance
    on attendance.id = queue_item.attendance_id
  join lateral (
    select pipeline_item.id
    from public.pipeline_items pipeline_item
    where pipeline_item.attendance_id = queue_item.attendance_id
      and pipeline_item.pipeline_type = case
        when queue_item.exam_type in (
          'periapical',
          'interproximal',
          'panoramica',
          'tomografia'
        ) and queue_item.com_laudo then 'laudo'::public.pipeline_type
        when queue_item.exam_type = 'telerradiografia'
          and attendance.com_cefalometria then 'cefalometria'::public.pipeline_type
        when queue_item.exam_type = 'fotografia' then 'fotografia'::public.pipeline_type
        when queue_item.exam_type = 'escaneamento_intra_oral' then 'escaneamento'::public.pipeline_type
        else null
      end
      and pipeline_item.opened_at <= coalesce(
        queue_item.finished_at,
        queue_item.updated_at,
        queue_item.created_at
      )
    order by pipeline_item.opened_at desc
    limit 1
  ) as matched_pipeline on true
)
insert into public.pipeline_item_queue_items (
  pipeline_item_id,
  queue_item_id
)
select
  inferred_pipeline_links.pipeline_item_id,
  inferred_pipeline_links.queue_item_id
from inferred_pipeline_links
on conflict do nothing;
