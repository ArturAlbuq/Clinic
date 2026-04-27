-- Migration: sla_config table, business-days helper, SLA-aware pipeline opening

-- 1. Table
create table if not exists public.sla_config (
  id            uuid primary key default gen_random_uuid(),
  pipeline_subtype text not null unique,
  business_days integer not null check (business_days > 0),
  updated_at    timestamptz not null default timezone('utc', now()),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.sla_config enable row level security;

create policy "sla_config_read_all"
  on public.sla_config for select
  to authenticated using (true);

create policy "sla_config_write_admin"
  on public.sla_config for all
  to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- 2. Seed default values
insert into public.sla_config (pipeline_subtype, business_days) values
  ('laudo_2d',                    3),
  ('laudo_tomografia',            5),
  ('cefalometria',                3),
  ('fotografia_idoc',             2),
  ('fotografia_impressao',        3),
  ('escaneamento_digital',        2),
  ('escaneamento_laboratorio',    3)
on conflict (pipeline_subtype) do nothing;

-- 3. add_business_days(start_ts, days): adds N business days (Mon–Fri) to a timestamp
create or replace function public.add_business_days(
  p_start timestamptz,
  p_days  integer
)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_date date := p_start::date;
  v_remaining integer := p_days;
begin
  while v_remaining > 0 loop
    v_date := v_date + interval '1 day';
    -- 0=Sun 6=Sat in extract(dow)
    if extract(dow from v_date) not in (0, 6) then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  -- preserve time-of-day from p_start but on the new date in UTC
  return (v_date + (p_start - p_start::date))::timestamptz;
end;
$$;

-- 4. Helper: resolve which sla_config subtype applies to a pipeline_type + metadata
create or replace function public.resolve_sla_subtype(
  p_pipeline_type public.pipeline_type,
  p_metadata      jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_pipeline_type = 'laudo' then
    if coalesce(p_metadata->>'source_exam_type', '') = 'tomografia' then
      return 'laudo_tomografia';
    else
      return 'laudo_2d';
    end if;
  end if;

  if p_pipeline_type = 'cefalometria' then
    return 'cefalometria';
  end if;

  if p_pipeline_type = 'fotografia' then
    if coalesce((p_metadata->>'com_impressao')::boolean, false) then
      return 'fotografia_impressao';
    else
      return 'fotografia_idoc';
    end if;
  end if;

  if p_pipeline_type = 'escaneamento' then
    if coalesce((p_metadata->>'laboratorio_externo')::boolean, false) then
      return 'escaneamento_laboratorio';
    else
      return 'escaneamento_digital';
    end if;
  end if;

  return null;
end;
$$;

-- 5. Update create_pipeline_item_if_missing to set sla_deadline from sla_config
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
  v_sla_subtype text;
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
    return created_pipeline_item_id;
  end if;

  -- Resolve SLA deadline
  v_sla_subtype := public.resolve_sla_subtype(p_pipeline_type, coalesce(p_metadata, '{}'::jsonb));
  if v_sla_subtype is not null then
    select business_days into v_business_days
    from public.sla_config
    where pipeline_subtype = v_sla_subtype;
  end if;

  if v_business_days is not null then
    v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
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

    return created_pipeline_item_id;
end;
$$;
