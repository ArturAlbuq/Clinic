# Remover etapa "chamado" do fluxo de atendimento — Implementation Plan (Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar a etapa intermediária `chamado` do fluxo operacional, fazendo o paciente transitar direto de `aguardando` para `em_atendimento` ao clicar "Iniciar exame".

**Architecture:** Mudanças apenas no lado frontend/API da aplicação. A migration de banco (triggers `enforce_queue_status_flow` e `stamp_queue_status`) é responsabilidade do Codex e deve estar aplicada antes da execução deste plano. As mudanças aqui são: lógica de fluxo em `queue.ts`, labels em `constants.ts`, e remoção de `chamado` de `ALLOWED_STATUSES` na API.

**Tech Stack:** Next.js 14, TypeScript, Node.js test runner (`tsx --test`)

---

## Arquivos modificados

- `src/lib/queue.ts` — lógica de próximo status e labels
- `src/lib/constants.ts` — label de exibição do status `aguardando`
- `src/app/api/clinic/queue-items/[id]/route.ts` — set de statuses permitidos via PATCH
- `src/lib/queue.test.ts` — testes das funções alteradas

---

### Task 1: Atualizar testes de `getNextStatus` e `getNextStatusLabel`

**Files:**
- Modify: `src/lib/queue.test.ts`

- [ ] **Step 1: Localizar o teste existente**

O teste está em `src/lib/queue.test.ts`, função `"getNextStatus respeita o fluxo operacional"` (linha ~84).

- [ ] **Step 2: Atualizar o teste para o novo fluxo**

Substituir o bloco do teste existente:

```ts
test("getNextStatus respeita o fluxo operacional", () => {
  assert.equal(getNextStatus("aguardando"), "em_atendimento");
  assert.equal(getNextStatus("chamado"), null);
  assert.equal(getNextStatus("em_atendimento"), "finalizado");
  assert.equal(getNextStatus("finalizado"), null);
  assert.equal(getNextStatus("cancelado"), null);
});
```

- [ ] **Step 3: Adicionar teste de `getNextStatusLabel` logo após o teste acima**

```ts
test("getNextStatusLabel retorna o label correto para cada status", () => {
  assert.equal(getNextStatusLabel("aguardando"), "Iniciar exame");
  assert.equal(getNextStatusLabel("chamado"), null);
  assert.equal(getNextStatusLabel("em_atendimento"), "Concluir exame");
  assert.equal(getNextStatusLabel("finalizado"), null);
});
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

```bash
npm test
```

Esperado: falha em `"getNextStatus respeita o fluxo operacional"` — `getNextStatus("aguardando")` retorna `"chamado"` mas esperava `"em_atendimento"`. Falha em `"getNextStatusLabel retorna o label correto..."` — `getNextStatusLabel("aguardando")` retorna `"Chamar paciente"` mas esperava `"Iniciar exame"`.

---

### Task 2: Atualizar `getNextStatus` e `getNextStatusLabel` em `queue.ts`

**Files:**
- Modify: `src/lib/queue.ts`

- [ ] **Step 1: Localizar e substituir `getNextStatus`**

Encontrar a função `getNextStatus` (linha ~786) e substituir pelo seguinte:

```ts
export function getNextStatus(status: QueueStatus): QueueStatus | null {
  switch (status) {
    case "aguardando":
      return "em_atendimento";
    case "em_atendimento":
      return "finalizado";
    default:
      return null;
  }
}
```

- [ ] **Step 2: Localizar e substituir `getNextStatusLabel`**

Encontrar a função `getNextStatusLabel` (linha ~799) e substituir pelo seguinte:

```ts
export function getNextStatusLabel(status: QueueStatus) {
  switch (status) {
    case "aguardando":
      return "Iniciar exame";
    case "em_atendimento":
      return "Concluir exame";
    default:
      return null;
  }
}
```

- [ ] **Step 3: Rodar os testes e confirmar que passam**

```bash
npm test
```

Esperado: todos os testes passam, incluindo os dois novos/atualizados da Task 1.

- [ ] **Step 4: Rodar typecheck**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat: pular etapa chamado — aguardando vai direto para em_atendimento"
```

---

### Task 3: Atualizar label de `aguardando` em `constants.ts`

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Localizar as ocorrências**

Em `src/lib/constants.ts` há dois objetos com `aguardando: "Aguardando ser chamado"` — um na linha ~130 e outro em `ROOM_STATUS_LABELS` na linha ~138. Há também uma ocorrência de `aguardando: "Aguardando"` (linha ~155) que já está correta.

- [ ] **Step 2: Atualizar ambas as ocorrências**

Substituir todas as linhas:
```ts
aguardando: "Aguardando ser chamado",
```
por:
```ts
aguardando: "Aguardando",
```

Há exatamente duas ocorrências — ambas devem ser atualizadas.

- [ ] **Step 3: Rodar typecheck e testes**

```bash
npm run typecheck && npm test
```

Esperado: sem erros, todos os testes passam.

- [ ] **Step 4: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: atualizar label de aguardando para remover referencia a chamado"
```

---

### Task 4: Remover `"chamado"` de `ALLOWED_STATUSES` na API

**Files:**
- Modify: `src/app/api/clinic/queue-items/[id]/route.ts`

- [ ] **Step 1: Localizar `ALLOWED_STATUSES`**

Em `src/app/api/clinic/queue-items/[id]/route.ts`, linha ~30:

```ts
const ALLOWED_STATUSES = new Set<QueueStatus>([
  "aguardando",
  "chamado",
  "em_atendimento",
  "finalizado",
]);
```

- [ ] **Step 2: Remover `"chamado"` do set**

```ts
const ALLOWED_STATUSES = new Set<QueueStatus>([
  "aguardando",
  "em_atendimento",
  "finalizado",
]);
```

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clinic/queue-items/[id]/route.ts
git commit -m "feat: remover chamado de ALLOWED_STATUSES na API de queue items"
```
