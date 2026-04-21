-- Remove status intermediarios que nao devem mais aparecer no modulo de pos-atendimento.
-- Antes de trocar o enum, normaliza registros existentes para o status anterior mais seguro,
-- preservando a possibilidade de o time decidir o proximo passo manualmente.

update public.pipeline_items
set status = 'enviado_radiologista'
where status = 'recebido_radiologista';

update public.pipeline_items
set status = 'enviado_impressao'
where status = 'recebido_laboratorio';

update public.pipeline_events
set previous_status = 'enviado_radiologista'
where previous_status = 'recebido_radiologista';

update public.pipeline_events
set new_status = 'enviado_radiologista'
where new_status = 'recebido_radiologista';

update public.pipeline_events
set previous_status = 'enviado_impressao'
where previous_status = 'recebido_laboratorio';

update public.pipeline_events
set new_status = 'enviado_impressao'
where new_status = 'recebido_laboratorio';

alter type public.pipeline_status rename to pipeline_status_old;

create type public.pipeline_status as enum (
  'nao_iniciado',
  'pendente_envio',
  'enviado_radiologista',
  'devolvido_radiologista',
  'recebido_corrigido',
  'revisado_liberado',
  'em_ajuste',
  'publicado_idoc',
  'disponivel_impressao',
  'enviado_impressao',
  'enviado_laboratorio_externo',
  'retornado_laboratorio',
  'publicado_finalizado'
);

alter table public.pipeline_items
  alter column status drop default,
  alter column status type public.pipeline_status
  using status::text::public.pipeline_status,
  alter column status set default 'nao_iniciado';

alter table public.pipeline_events
  alter column previous_status type public.pipeline_status
  using case
    when previous_status is null then null
    else previous_status::text::public.pipeline_status
  end,
  alter column new_status type public.pipeline_status
  using new_status::text::public.pipeline_status;

drop type public.pipeline_status_old;
