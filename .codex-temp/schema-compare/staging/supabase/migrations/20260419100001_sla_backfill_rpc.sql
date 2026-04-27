-- RPC to backfill sla_deadline for open pipeline_items with null sla_deadline
-- for a given pipeline_subtype configuration.
create or replace function public.backfill_sla_deadline_for_subtype(
  p_pipeline_subtype text,
  p_business_days integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pipeline_items pi
  set sla_deadline = public.add_business_days(pi.opened_at, p_business_days)
  where pi.finished_at is null
    and pi.sla_deadline is null
    and public.resolve_sla_subtype(pi.pipeline_type, pi.metadata) = p_pipeline_subtype;
end;
$$;
