-- Aplica RLS e indices do modulo de esteira.
-- As permissoes seguem o escopo real do schema atual e a restricao de colunas
-- sensiveis fica reforcada pelo trigger guard_pipeline_item_mutation.

alter table public.pipeline_items enable row level security;
alter table public.pipeline_events enable row level security;

drop policy if exists "pipeline_items_select_by_role_and_scope" on public.pipeline_items;
create policy "pipeline_items_select_by_role_and_scope"
on public.pipeline_items
for select
to authenticated
using (
  public.current_app_role()::text in ('recepcao', 'atendimento', 'admin', 'gerencia')
  and public.user_can_access_attendance(attendance_id)
);

drop policy if exists "pipeline_items_insert_admin" on public.pipeline_items;
create policy "pipeline_items_insert_admin"
on public.pipeline_items
for insert
to authenticated
with check (
  public.current_app_role() = 'admin'
  and public.user_can_access_attendance(attendance_id)
);

drop policy if exists "pipeline_items_update_by_role_and_scope" on public.pipeline_items;
create policy "pipeline_items_update_by_role_and_scope"
on public.pipeline_items
for update
to authenticated
using (
  public.current_app_role()::text in ('recepcao', 'atendimento', 'admin')
  and public.user_can_access_attendance(attendance_id)
)
with check (
  public.current_app_role()::text in ('recepcao', 'atendimento', 'admin')
  and public.user_can_access_attendance(attendance_id)
);

drop policy if exists "pipeline_items_delete_admin" on public.pipeline_items;
create policy "pipeline_items_delete_admin"
on public.pipeline_items
for delete
to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists "pipeline_events_select_authenticated" on public.pipeline_events;
create policy "pipeline_events_select_authenticated"
on public.pipeline_events
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "pipeline_events_update_admin" on public.pipeline_events;
create policy "pipeline_events_update_admin"
on public.pipeline_events
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create index if not exists pipeline_items_attendance_id_idx
  on public.pipeline_items (attendance_id);

create index if not exists pipeline_items_pipeline_type_idx
  on public.pipeline_items (pipeline_type);

create index if not exists pipeline_items_status_idx
  on public.pipeline_items (status);

create unique index if not exists pipeline_items_open_unique_idx
  on public.pipeline_items (attendance_id, pipeline_type)
  where finished_at is null;

create index if not exists pipeline_events_pipeline_item_id_idx
  on public.pipeline_events (pipeline_item_id);

create index if not exists pipeline_events_occurred_at_idx
  on public.pipeline_events (occurred_at desc);
