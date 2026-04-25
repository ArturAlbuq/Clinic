# Spec: Remover etapa "chamado" do fluxo de atendimento

## Contexto

O fluxo atual de atendimento possui três etapas operadas pelo técnico:

1. **aguardando** → botão "Chamar paciente" → **chamado**
2. **chamado** → botão "Iniciar exame" → **em_atendimento**
3. **em_atendimento** → botão "Concluir exame" → **finalizado**

A etapa `chamado` é redundante: o técnico chama verbalmente o paciente e imediatamente começa o exame. O objetivo é colapsar as duas primeiras etapas em uma só, de modo que ao entrar na sala o paciente já parta direto para `em_atendimento`.

## Objetivo

O botão exibido para um paciente `aguardando` deve ser **"Iniciar exame"**, transitando direto para `em_atendimento`, eliminando a etapa intermediária `chamado` do fluxo operacional.

O status `chamado` permanece no enum do banco (não é removido) para preservar compatibilidade com dados históricos.

## Escopo das mudanças

### 1. `src/lib/queue.ts`

- `getNextStatus("aguardando")` → retorna `"em_atendimento"` (antes retornava `"chamado"`)
- `getNextStatusLabel("aguardando")` → retorna `"Iniciar exame"` (antes retornava `"Chamar paciente"`)
- A entrada `case "chamado": return "em_atendimento"` em `getNextStatus` é removida
- A entrada `case "chamado": return "Iniciar exame"` em `getNextStatusLabel` é removida

### 2. `src/lib/constants.ts`

- Label de `aguardando` em `ROOM_STATUS_LABELS` (e equivalente): `"Aguardando ser chamado"` → `"Aguardando"`
- Label de `chamado` pode permanecer para exibição de histórico

### 3. `src/app/api/clinic/queue-items/[id]/route.ts`

- Remover `"chamado"` do `ALLOWED_STATUSES` — a API não deve mais aceitar transição para `chamado` via PATCH status
- A transição `aguardando → em_atendimento` já é permitida pelo banco (o trigger de `called_at` cobre a transição para `em_atendimento` vinda de `aguardando`)

### 4. `supabase/migrations` — nova migration (obrigatória)

O trigger `enforce_queue_status_flow` no banco bloqueia `aguardando → em_atendimento` com `raise exception`. A migration deve:

- Adicionar `if old.status = 'aguardando' and new.status = 'em_atendimento' then return new; end if;` no trigger `enforce_queue_status_flow`
- No trigger `stamp_queue_status`, adicionar condição: se `old.status = 'aguardando'` e `new.status = 'em_atendimento'`, preencher `called_at` (caso ainda null) — para preservar o cálculo de tempo de espera
- Manter as condições existentes envolvendo `chamado` para compatibilidade com dados históricos

### 5. `src/lib/queue.test.ts`

- Atualizar testes:
  - `getNextStatus("aguardando")` deve retornar `"em_atendimento"`
  - `getNextStatus("chamado")` deve retornar `null` (não há próximo status operacional)
  - `getNextStatusLabel("aguardando")` deve retornar `"Iniciar exame"`

### 6. UI — `room-queue-board.tsx` e `STATUS_CONTAINER_STYLES`

- O estilo `chamado` em `STATUS_CONTAINER_STYLES` pode permanecer para exibição de itens históricos com status `chamado`
- Nenhuma mudança estrutural necessária além das mudanças em `queue.ts` e `constants.ts`

## O que NÃO muda

- O enum `queue_status` no banco não é alterado — `chamado` continua válido
- Dados históricos com `status = 'chamado'` continuam exibíveis normalmente
- Métricas que contam `chamado` como "em exame" continuam funcionando para histórico

## Critérios de aceitação

1. Um paciente `aguardando` exibe o botão "Iniciar exame"
2. Ao clicar, o status transita direto para `em_atendimento`
3. O status `chamado` não aparece mais como etapa intermediária em novos atendimentos
4. `called_at` é preenchido corretamente na transição `aguardando → em_atendimento`
5. Todos os testes existentes passam após atualização
