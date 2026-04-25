# Design: Prazo por Etapa — Enviado ao Radiologista

**Data:** 2026-04-24  
**Status:** Aprovado

---

## Contexto

O sistema já possui um SLA global por tipo de pipeline (`sla_deadline` em `pipeline_items`, configurado em dias úteis via `sla_config`). O prazo global é calculado a partir de `opened_at` e representa o tempo total esperado para conclusão do pipeline.

**Problema:** Não há controle sobre o tempo que um item fica parado antes de ser enviado ao radiologista. É necessário um prazo específico para a etapa `enviado_radiologista`, com alerta visual quando o item vence ou se aproxima do vencimento.

---

## Escopo

- Somente a etapa `enviado_radiologista` (pontual, sem extensibilidade para outras etapas agora)
- Apenas pipelines do tipo `laudo` e `cefalometria` (os únicos que passam por essa etapa)
- Coexiste com o SLA global — ambos os campos ficam no item

---

## Banco de Dados

### 1. Nova coluna em `pipeline_items`

```sql
ALTER TABLE pipeline_items ADD COLUMN step_deadline timestamptz;
```

O campo é `null` por padrão. É preenchido pelo trigger quando o status muda para `enviado_radiologista`. Não é apagado se o status avançar — fica como registro histórico.

### 2. Nova linha em `sla_config`

```sql
INSERT INTO sla_config (pipeline_subtype, business_days)
VALUES ('laudo_enviado_radiologista', 12);
```

O valor `12` é placeholder — o admin ajusta pelo painel existente em `/admin/sla`.

### 3. Trigger `set_step_deadline_on_enviado_radiologista`

Trigger `BEFORE UPDATE` em `pipeline_items`. Quando `NEW.status = 'enviado_radiologista'` e `OLD.status <> 'enviado_radiologista'`:

1. Lê `business_days` de `sla_config` onde `pipeline_subtype = 'laudo_enviado_radiologista'`
2. Calcula `step_deadline = addBusinessDays(NEW.opened_at, business_days)` usando a função PostgreSQL equivalente ao `addBusinessDays` do frontend
3. Grava em `NEW.step_deadline`

Se não encontrar configuração em `sla_config`, não grava nada (evita erro silencioso).

### 4. Função auxiliar PostgreSQL `add_business_days(start timestamptz, days int)`

Equivalente ao `addBusinessDays` de `src/lib/business-days.ts`. Itera dia a dia somando apenas dias úteis (seg–sex). Deve ser criada antes do trigger.

---

## Frontend

### `PIPELINE_ITEM_BASE_SELECT` (`src/lib/pipeline.ts`)

Adicionar `step_deadline` ao select base:

```ts
export const PIPELINE_ITEM_BASE_SELECT = `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, step_deadline, metadata, opened_at, updated_at, finished_at, ...`;
```

### `PipelineItemBaseRow` (`src/lib/pipeline.ts`)

Adicionar campo ao tipo:

```ts
step_deadline: string | null;
```

### Lógica de exibição nos painéis

Quando `item.status === 'enviado_radiologista'`, exibir `step_deadline` no lugar do `sla_deadline`. Caso contrário, manter o comportamento atual com `sla_deadline`.

A função de classe de alerta é a mesma (`getSlaAlertClass` / `getSlaClass`), aplicada ao `step_deadline`:

- Verde: dentro do prazo (≥ 2h restantes)
- Amarelo: próximo do vencimento (< 2h restantes)
- Vermelho: vencido

### Painel de pós-atendimento (`pos-atendimento-dashboard.tsx`)

Na coluna de deadline da tabela, trocar `item.sla_deadline` por `item.status === 'enviado_radiologista' ? item.step_deadline : item.sla_deadline`.

### Painel gerencial (`gerencial-dashboard.tsx`)

Mesma lógica de troca condicional na coluna de deadline.

### Configuração de SLA (`/admin/sla`)

Adicionar o label no mapa `subtypeLabels` da página:

```ts
'laudo_enviado_radiologista': 'Enviado ao radiologista (prazo de etapa)'
```

Nenhuma outra mudança estrutural no editor — a linha aparece automaticamente.

---

## Fluxo Completo

1. Admin configura o prazo em `/admin/sla` (ex: 3 dias úteis)
2. Operador avança o item para `enviado_radiologista`
3. Trigger calcula `step_deadline = addBusinessDays(opened_at, business_days)` e grava
4. Painéis exibem `step_deadline` com cor de alerta enquanto o status for `enviado_radiologista`
5. Se o item avançar, `step_deadline` fica gravado como histórico, mas deixa de ser exibido

---

## Fora do Escopo

- Notificações push ou e-mail ao vencer o prazo
- Extensão para outras etapas além de `enviado_radiologista`
- Mudança na lógica de ordenação da fila (continua usando `sla_deadline`)
- Backfill de itens já em `enviado_radiologista` — o `step_deadline` ficará `null` para itens existentes

---

## Critérios de Sucesso

1. Ao avançar um item para `enviado_radiologista`, `step_deadline` é preenchido automaticamente
2. O deadline aparece nos dois painéis com a cor correta (verde/amarelo/vermelho)
3. O admin consegue configurar o prazo pelo painel existente em `/admin/sla`
4. Itens em outros status continuam exibindo `sla_deadline` normalmente
