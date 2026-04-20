# 1. Regra principal
Não altere nenhuma tabela ou lógica existente sem antes analisar o schema atual completo.
Toda nova migration deve ter timestamp no nome: YYYYMMDDHHMMSS_descricao.sql.
Nunca editar migration já aplicada — criar migration de correção.

# 2. Objetivo
Implementar a base de dados do módulo Esteira Pós-Atendimento integrada à fila digital existente.
Ao final, o banco deve suportar: flags de esteira no cadastro, criação automática de esteiras ao finalizar
atendimento, histórico de movimentações e RLS por perfil.

# 3. Fase obrigatória antes de codar
- Ler o schema atual completo (supabase/migrations e supabase/schema.sql se existir)
- Verificar a estrutura de attendances e queue_items
- Verificar os enums existentes (user_role, queue_status, exam_type)
- Não criar nada que já exista
- Listar o que será criado antes de criar

# 4. O que deve ser implementado

## 4.1 — Novos campos no attendance (migration 1)
Adicionar campos condicionais para definir abertura das esteiras:
- com_laudo boolean NOT NULL DEFAULT false
- com_cefalometria boolean NOT NULL DEFAULT false
- com_impressao_fotografia boolean NOT NULL DEFAULT false
- com_laboratorio_externo_escaneamento boolean NOT NULL DEFAULT false

Esses campos só têm sentido quando o exame correspondente está vinculado ao atendimento,
mas são armazenados no nível do attendance por ser o momento do cadastro.

## 4.2 — Enum pipeline_type (migration 2)
Criar enum:
create type public.pipeline_type as enum ('laudo', 'cefalometria', 'fotografia', 'escaneamento');

## 4.3 — Enum pipeline_status (migration 2)
Criar enums separados por tipo ou um enum unificado.
Recomendação: enum unificado com todos os status possíveis de todas as esteiras.
Status necessários:
- nao_iniciado
- pendente_envio
- enviado_radiologista
- recebido_radiologista
- devolvido_radiologista
- recebido_corrigido
- revisado_liberado
- em_ajuste
- publicado_idoc
- disponivel_impressao
- enviado_impressao
- recebido_laboratorio
- enviado_laboratorio_externo
- retornado_laboratorio
- publicado_finalizado

## 4.4 — Tabela pipeline_items (migration 2)
create table public.pipeline_items (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendances(id) on delete restrict,
  queue_item_id uuid references public.queue_items(id) on delete set null,
  pipeline_type public.pipeline_type not null,
  status public.pipeline_status not null default 'nao_iniciado',
  responsible_id uuid references public.profiles(id) on delete set null,
  sla_deadline timestamptz,
  notes text,
  opened_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

## 4.5 — Tabela pipeline_events (migration 2)
create table public.pipeline_events (
  id uuid primary key default gen_random_uuid(),
  pipeline_item_id uuid not null references public.pipeline_items(id) on delete cascade,
  previous_status public.pipeline_status,
  new_status public.pipeline_status not null,
  performed_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  notes text,
  metadata jsonb
);

## 4.6 — Trigger de abertura automática das esteiras (migration 3)
Criar função e trigger:
- Disparar quando queue_item.status muda para 'finalizado'
- A função deve verificar os flags do attendance vinculado ao queue_item
- Regras de abertura:
  - se attendance.com_laudo = true E exam_type IN ('periapical','interproximal','panoramica','telerradiografia','tomografia'): abrir pipeline laudo
  - se attendance.com_cefalometria = true E exam_type = 'telerradiografia': abrir pipeline cefalometria
  - se exam_type IN ('fotografia','escaneamento'): sempre abrir pipeline correspondente (com flags de sub-tipo no metadata)
  - se attendance.com_laboratorio_externo_escaneamento = true: adicionar metadata laboratorio_externo=true no pipeline de escaneamento
  - se attendance.com_impressao_fotografia = true: adicionar metadata com_impressao=true no pipeline de fotografia
- Não abrir esteira se já existir uma aberta para o mesmo attendance + pipeline_type (evitar duplicata)
- Registrar evento pipeline_event tipo 'created' ao abrir cada esteira

## 4.7 — RLS das novas tabelas
pipeline_items:
- recepcao: SELECT e UPDATE (apenas campos de status e notes, não sla)
- atendimento: SELECT e UPDATE (apenas campos de status e notes, não sla)
- admin: SELECT, INSERT, UPDATE, DELETE

pipeline_events:
- todos os perfis autenticados: SELECT
- INSERT: via trigger ou service_role apenas (nunca direto do client)
- UPDATE/DELETE: admin apenas

## 4.8 — Índices
Criar índices em:
- pipeline_items(attendance_id)
- pipeline_items(pipeline_type)
- pipeline_items(status)
- pipeline_events(pipeline_item_id)
- pipeline_events(occurred_at)

# 5. Diretrizes de implementação
- Timezone: sempre timestamptz, nunca timestamp sem timezone
- Todos os campos de data devem respeitar America/Manaus no momento de exibição (responsabilidade do frontend)
- Migrations nomeadas com timestamp: ex: 20260418120000_add_pipeline_flags_to_attendances.sql
- Não usar CASCADE em delete onde puder comprometer histórico de auditoria
- Trigger deve ser AFTER UPDATE ON queue_items, FOR EACH ROW, WHEN (NEW.status = 'finalizado' AND OLD.status != 'finalizado')
- Usar security definer nas funções de trigger

# 6. Ordem desejada
1. Ler schema atual
2. Listar o que já existe e o que será criado
3. Migration 1: campos no attendance
4. Migration 2: enums + tabelas pipeline_items e pipeline_events
5. Migration 3: trigger de abertura automática
6. Migration 4: RLS das novas tabelas + índices
7. Gerar tipos TypeScript atualizados (database.ts)

# 7. Entregáveis obrigatórios
- [ ] 4 migration files com nomes corretos
- [ ] Função + trigger SQL documentados e funcionais
- [ ] RLS aplicada em pipeline_items e pipeline_events
- [ ] Tipos TypeScript atualizados para as novas tabelas e enums
- [ ] Comentário em cada migration explicando o que ela faz

# 8. Critérios de aceite
- Ao mudar queue_item.status para 'finalizado', as esteiras corretas são abertas automaticamente
- Esteiras não são duplicadas se o trigger disparar duas vezes
- RLS impede recepcao e atendimento de deletar ou alterar sla_deadline
- pipeline_events nunca pode ser deletado pelo client
- Tipos TypeScript refletem o schema atualizado sem erros

# 9. Restrições finais
- NÃO alterar tabelas já existentes além dos campos especificados na migration 1
- NÃO criar tabelas com nome diferente do especificado
- NÃO aceitar role de abertura de esteira vinda do client — somente via trigger ou service_role
- NÃO criar lógica de SLA no banco agora — apenas o campo sla_deadline para ser preenchido futuramente
- NÃO implementar nenhuma tela — somente banco e tipos