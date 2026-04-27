-- Cria enums e tabelas do modulo de esteira pos-atendimento.
-- A tabela pipeline_items recebe metadata porque as regras de abertura
-- precisam persistir flags complementares por pipeline aberto.

do $$
begin
  create type public.pipeline_type as enum (
    'laudo',
    'cefalometria',
    'fotografia',
    'escaneamento'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.pipeline_status as enum (
    'nao_iniciado',
    'pendente_envio',
    'enviado_radiologista',
    'recebido_radiologista',
    'devolvido_radiologista',
    'recebido_corrigido',
    'revisado_liberado',
    'em_ajuste',
    'publicado_idoc',
    'disponivel_impressao',
    'enviado_impressao',
    'recebido_laboratorio',
    'enviado_laboratorio_externo',
    'retornado_laboratorio',
    'publicado_finalizado'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.pipeline_items (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendances (id) on delete restrict,
  queue_item_id uuid references public.queue_items (id) on delete set null,
  pipeline_type public.pipeline_type not null,
  status public.pipeline_status not null default 'nao_iniciado',
  responsible_id uuid references public.profiles (id) on delete set null,
  sla_deadline timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pipeline_events (
  id uuid primary key default gen_random_uuid(),
  pipeline_item_id uuid not null references public.pipeline_items (id) on delete cascade,
  previous_status public.pipeline_status,
  new_status public.pipeline_status not null,
  performed_by uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  notes text,
  metadata jsonb
);
