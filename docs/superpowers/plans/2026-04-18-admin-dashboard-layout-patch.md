# Admin Dashboard Layout Patch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o bloco "Resumo Operacional", substituir o card "80+ esperando" por "Espera média", limpar variáveis mortas e centralizar a seção de navegação no painel admin.

**Architecture:** Todas as mudanças estão em um único arquivo (`src/components/admin-dashboard.tsx`). São remoções e substituições cirúrgicas — sem novos componentes, sem refatoração de lógica, sem mudança de tipagem.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS

---

## Arquivo afetado

| Arquivo | Operação |
|---|---|
| `src/components/admin-dashboard.tsx` | Modificar (4 alterações independentes, listadas como tarefas) |

---

## Task 1: Substituir card "80+ esperando" por "Espera média"

**Files:**
- Modify: `src/components/admin-dashboard.tsx:501`

- [ ] **Step 1: Localizar o card a substituir**

Abra `src/components/admin-dashboard.tsx`. Procure pela linha 501:

```tsx
<MetricCard label="80+ esperando" value={String(topPriorityWaiting)} helper="Maior prioridade ainda na fila." accent="amber" />
```

- [ ] **Step 2: Substituir o card**

Troque essa linha por:

```tsx
<MetricCard label="Espera media" value={formatMinuteLabel(getAverageWaitMinutes(queueItems.filter((item) => item.status !== "cancelado")))} helper="Tempo medio de espera na fila ativa." accent="cyan" />
```

> Nota: `getAverageWaitMinutes` e `formatMinuteLabel` já estão importados. A expressão `queueItems.filter((item) => item.status !== "cancelado")` é idêntica à usada no bloco Resumo Operacional (linha 514), que será removido na Task 2.

- [ ] **Step 3: Verificar que o arquivo compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit
```

Esperado: sem erros relacionados ao MetricCard ou ao valor passado.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin-dashboard.tsx
git commit -m "feat: replace 80+ waiting card with average wait time metric"
```

---

## Task 2: Remover o bloco "Resumo Operacional"

**Files:**
- Modify: `src/components/admin-dashboard.tsx:506-529`

- [ ] **Step 1: Localizar o bloco a remover**

Procure pela linha 506:

```tsx
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
```

O bloco vai da linha 506 até a linha 529 (fechamento `</section>`):

```tsx
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Resumo operacional</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">O que pede atencao agora</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
              Espera media {formatMinuteLabel(getAverageWaitMinutes(queueItems.filter((item) => item.status !== "cancelado")))}
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Pill label="Em andamento" value={`${activeAttendances} atendimento${activeAttendances === 1 ? "" : "s"}`} tone="teal" />
            <Pill label="Aguardando" value={`${waitingAttendances} paciente${waitingAttendances === 1 ? "" : "s"}`} tone="amber" />
            <Pill label="Finalizados" value={`${finishedAttendances} concluido${finishedAttendances === 1 ? "" : "s"}`} tone="slate" />
            <Pill label="Maior espera" value={longestWaitDisplay} tone="amber" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <MetricCard label="Normal" value={String(reportAttendances.filter((a) => a.priority === "normal").length)} helper="Prioridade base." />
          <MetricCard label="60+ e outras" value={String(reportAttendances.filter((a) => a.priority === "sessenta_mais_outras").length)} helper="Prioridade intermediaria." accent="teal" />
          <MetricCard label="80+" value={String(reportAttendances.filter((a) => a.priority === "oitenta_mais").length)} helper="Maior prioridade operacional." accent="amber" />
        </div>
      </section>
```

- [ ] **Step 2: Deletar o bloco inteiro (linhas 506–529)**

Remova as 24 linhas acima por completo. A linha 530 (linha em branco) antes da seção de tabs pode ser mantida ou removida — não importa.

- [ ] **Step 3: Verificar que o arquivo compila**

```bash
npx tsc --noEmit
```

Esperado: erros de "variável declarada mas não usada" para `longestWaitDisplay` (e possivelmente `topPriorityWaiting`, `longestWaitingItem`, `longestWaitMinutes`) — isso é esperado e será resolvido na Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin-dashboard.tsx
git commit -m "feat: remove resumo operacional section from admin dashboard"
```

---

## Task 3: Remover variáveis mortas

**Files:**
- Modify: `src/components/admin-dashboard.tsx:345-361`

- [ ] **Step 1: Localizar e remover `topPriorityWaiting` (linhas 345–349)**

Remova o bloco:

```tsx
  const topPriorityWaiting = operationalAttendances.filter(
    (attendance) =>
      attendance.priority === "oitenta_mais" &&
      getAttendanceOverallStatus(attendance, attendance.queueItems) === "aguardando",
  ).length;
```

- [ ] **Step 2: Localizar e remover `longestWaitingItem`, `longestWaitMinutes` e `longestWaitDisplay` (linhas 350–361)**

Remova o bloco inteiro (incluindo o comentário):

```tsx
  const longestWaitingItem =
    reportQueueItems
      .filter((item) => item.status === "aguardando")
      .sort((a, b) => getQueueWaitMinutes(b) - getQueueWaitMinutes(a))[0] ?? null;
  const longestWaitMinutes = longestWaitingItem
    ? getQueueWaitMinutes(longestWaitingItem)
    : null;
  // Valores acima de 480 min indicam dado incorreto (ex.: registros de outro dia) — exibe "--"
  const longestWaitDisplay =
    longestWaitMinutes !== null && longestWaitMinutes <= 480
      ? formatMinuteLabel(longestWaitMinutes)
      : "--";
```

- [ ] **Step 3: Confirmar que `getQueueWaitMinutes` ainda é usado em outro lugar**

```bash
grep -n "getQueueWaitMinutes" src/components/admin-dashboard.tsx
```

Esperado: zero resultados (a função era usada apenas nessas variáveis). Se ainda aparecer em alguma linha, NÃO remova o import — verifique onde está sendo usado antes de continuar.

- [ ] **Step 4: Verificar imports — `getQueueWaitMinutes` pode virar import não usado**

```bash
grep -n "getQueueWaitMinutes" src/components/admin-dashboard.tsx
```

Se o resultado for zero, remova `getQueueWaitMinutes` da linha de import (linha ~53):

```tsx
import {
  getAttendanceOverallStatus,
  getAttendanceTotalMinutes,
  getAverageWaitMinutes,
  getQueueStageExecutionMinutes,
  getQueueStageTotalMinutes,
  getQueueStageWaitMinutes,
  getQueueWaitMinutes,   // <-- remover esta linha se não houver mais usos
  groupAttendancesWithQueueItems,
  isQueueItemReturnPending,
  sortAttendanceQueueItemsByFlow,
  sortAttendancesByPriorityAndCreatedAt,
  type QueueDateRange,
  type QueuePeriod,
} from "@/lib/queue";
```

- [ ] **Step 5: Verificar que o arquivo compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem nenhum erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-dashboard.tsx
git commit -m "chore: remove dead variables after resumo operacional removal"
```

---

## Task 4: Centralizar a seção de navegação

**Files:**
- Modify: `src/components/admin-dashboard.tsx:531-544`

- [ ] **Step 1: Localizar a seção de navegação**

Procure pela linha 531 (número pode ter mudado após as remoções das tasks anteriores — use a busca pelo conteúdo):

```tsx
      <section className="app-panel rounded-[30px] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Navegacao</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Operacao, busca, relatorios e exclusoes</h3>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <TabButton active={activeTab === "operacao"} label="Operacao" onClick={() => setActiveTab("operacao")} />
            <TabButton active={activeTab === "busca"} label="Busca de pacientes" onClick={() => setActiveTab("busca")} />
            <TabButton active={activeTab === "relatorios"} label="Relatorios" onClick={() => setActiveTab("relatorios")} />
            <TabButton active={activeTab === "exclusoes"} label="Registro de exclusoes" onClick={() => setActiveTab("exclusoes")} />
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Substituir pelo layout centralizado**

Substitua o bloco acima por:

```tsx
      <section className="flex justify-center">
        <div className="app-panel inline-flex flex-col items-center gap-4 rounded-[30px] px-8 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Navegacao</p>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1.5">
            <TabButton active={activeTab === "operacao"} label="Operacao" onClick={() => setActiveTab("operacao")} />
            <TabButton active={activeTab === "busca"} label="Busca de pacientes" onClick={() => setActiveTab("busca")} />
            <TabButton active={activeTab === "relatorios"} label="Relatorios" onClick={() => setActiveTab("relatorios")} />
            <TabButton active={activeTab === "exclusoes"} label="Registro de exclusoes" onClick={() => setActiveTab("exclusoes")} />
          </div>
        </div>
      </section>
```

> O `TabButton` tem `px-4 py-2` internamente — suficiente com o `p-1.5` do container. O `section` com `flex justify-center` garante que o card branco encolha para abraçar o conteúdo em vez de esticar 100%.

- [ ] **Step 3: Verificar que o arquivo compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Verificar visualmente no browser**

```bash
npm run dev
```

Abra `http://localhost:3000/admin`. Verifique:
- [ ] Card "80+ esperando" não existe mais no topo
- [ ] Card "Espera média" aparece no topo com valor em minutos
- [ ] Bloco "Resumo Operacional" não existe mais
- [ ] Seção de navegação está centralizada, card branco proporcional às tabs
- [ ] As tabs continuam funcionando (clicar em cada uma troca o conteúdo)

- [ ] **Step 5: Commit final**

```bash
git add src/components/admin-dashboard.tsx
git commit -m "feat: center navigation tabs section in admin dashboard"
```
