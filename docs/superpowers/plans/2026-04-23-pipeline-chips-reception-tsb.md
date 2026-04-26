# Pipeline Chips — Recepção + TSB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar chips visuais de esteiras de pós-atendimento na lista da recepção e um toast de confirmação na tela do TSB ao concluir um exame.

**Architecture:** (1) Buscar `pipeline_items` no server component `recepcao/page.tsx` agrupados por `attendance_id`, passar ao `ReceptionDashboard` → `AttendanceRowCompact`. (2) No `room-queue-board.tsx`, após `advanceStatus()` retornar `status: "finalizado"`, fazer fetch a `/api/clinic/pipeline-items?attendanceId=...` e exibir toast com as esteiras criadas. Nenhuma lógica de negócio é alterada — apenas leitura e exibição.

**Tech Stack:** Next.js 14 App Router, TypeScript estrito, Supabase JS v2, Tailwind CSS, sem novas bibliotecas.

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `src/components/pipeline-chips.tsx` | Componente puro de chips (L/C/F/S) + ponto de status |
| Criar | `src/components/pipeline-toast.tsx` | Toast de esteiras abertas após conclusão |
| Criar | `src/app/api/clinic/pipeline-items/route.ts` | GET endpoint: pipeline_items por attendanceId |
| Modificar | `src/lib/database.types.ts` | Exportar alias `PipelineItemRecord` |
| Modificar | `src/app/(app)/recepcao/page.tsx` | Buscar pipeline_items agrupados, passar ao dashboard |
| Modificar | `src/app/(app)/recepcao/reception-dashboard.tsx` | Aceitar + repassar `pipelineItemsByAttendanceId` |
| Modificar | `src/components/attendance-row-compact.tsx` | Renderizar `<PipelineChips>` na segunda linha |
| Modificar | `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx` | Após finalizar, fetch pipeline → mostrar `<PipelineToast>` |

---

## Task 1: Exportar `PipelineItemRecord` nos tipos

**Files:**
- Modify: `src/lib/database.types.ts` (final do arquivo, junto aos outros aliases)

- [ ] **Step 1: Adicionar alias**

Abrir `src/lib/database.types.ts`. No final do arquivo, após a linha:
```typescript
export type QueueItemWithAttendance = QueueItemRecord & {
  attendance: AttendanceRecord | null;
};
```
Adicionar:
```typescript
export type PipelineItemRecord = Tables<"pipeline_items">;
```

- [ ] **Step 2: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: export PipelineItemRecord type alias"
```

---

## Task 2: Criar componente `PipelineChips`

**Files:**
- Create: `src/components/pipeline-chips.tsx`

Este componente recebe uma lista de `PipelineItemRecord[]` (já filtrados para um `attendance_id`) e renderiza os chips compactos com ponto de status colorido e tooltip nativo.

**Lógica do ponto de status:**
- Verde (`bg-emerald-500`): `status === "publicado_finalizado"`
- Vermelho (`bg-red-500`): `sla_deadline !== null && new Date(sla_deadline) < now && status !== "publicado_finalizado"`
- Amarelo (`bg-yellow-400`): qualquer outro status

**Abreviação + cor por tipo:**
```
laudo        → "L", border-blue-200 bg-blue-50 text-blue-700
cefalometria → "C", border-violet-200 bg-violet-50 text-violet-700
fotografia   → "F", border-pink-200 bg-pink-50 text-pink-700
escaneamento → "S", border-emerald-200 bg-emerald-50 text-emerald-700
```

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/components/pipeline-chips.tsx
import type { PipelineItemRecord, PipelineType } from "@/lib/database.types";
import { PIPELINE_TYPE_LABELS, PIPELINE_STATUS_LABELS } from "@/lib/pipeline-constants";

type PipelineChipsProps = {
  items: PipelineItemRecord[];
  now?: Date;
};

const TYPE_STYLES: Record<PipelineType, { border: string; bg: string; text: string; abbr: string }> = {
  laudo:        { border: "border-blue-200",   bg: "bg-blue-50",   text: "text-blue-700",   abbr: "L" },
  cefalometria: { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", abbr: "C" },
  fotografia:   { border: "border-pink-200",   bg: "bg-pink-50",   text: "text-pink-700",   abbr: "F" },
  escaneamento: { border: "border-emerald-200",bg: "bg-emerald-50",text: "text-emerald-700",abbr: "S" },
};

function getStatusDotClass(item: PipelineItemRecord, now: Date): string {
  if (item.status === "publicado_finalizado") return "bg-emerald-500";
  if (item.sla_deadline && new Date(item.sla_deadline) < now) return "bg-red-500";
  return "bg-yellow-400";
}

function buildTooltip(item: PipelineItemRecord, now: Date): string {
  const type = PIPELINE_TYPE_LABELS[item.pipeline_type];
  const status = PIPELINE_STATUS_LABELS[item.status];
  if (item.sla_deadline && new Date(item.sla_deadline) < now && item.status !== "publicado_finalizado") {
    return `${type}\n${status}\n⚠ SLA vencido`;
  }
  return `${type}\n${status}`;
}

export function PipelineChips({ items, now = new Date() }: PipelineChipsProps) {
  if (!items.length) return null;

  return (
    <div className="flex items-center gap-1">
      {items.map((item) => {
        const style = TYPE_STYLES[item.pipeline_type];
        const dotClass = getStatusDotClass(item, now);
        const tooltip = buildTooltip(item, now);

        return (
          <span
            key={item.id}
            title={tooltip}
            className={`inline-flex items-center gap-1 rounded-full border ${style.border} ${style.bg} px-2 py-[3px] text-[11px] font-bold ${style.text} cursor-default select-none`}
          >
            {style.abbr}
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-chips.tsx
git commit -m "feat: add PipelineChips component"
```

---

## Task 3: Criar endpoint GET `/api/clinic/pipeline-items`

Este endpoint retorna todos os `pipeline_items` cujo `attendance_id` esteja na lista fornecida via query string `?attendanceIds=id1,id2,...`. Será usado pelo toast do TSB.

**Files:**
- Create: `src/app/api/clinic/pipeline-items/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/clinic/pipeline-items/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

export async function GET(request: Request) {
  const { supabase } = await requireRole(["recepcao", "atendimento", "admin", "gerencia"]);

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("attendanceIds") ?? "";
  const attendanceIds = raw.split(",").map((s) => s.trim()).filter(Boolean);

  if (!attendanceIds.length) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await supabase
    .from("pipeline_items")
    .select("id, attendance_id, pipeline_type, status, sla_deadline, opened_at")
    .in("attendance_id", attendanceIds)
    .order("opened_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clinic/pipeline-items/route.ts
git commit -m "feat: add GET /api/clinic/pipeline-items endpoint"
```

---

## Task 4: Criar componente `PipelineToast`

**Files:**
- Create: `src/components/pipeline-toast.tsx`

O toast aparece no canto inferior direito, some após 6 segundos, tem barra de progresso e botão de fechar. Recebe os `pipeline_items` já buscados e exibe em linguagem natural.

**Mapa de label em linguagem natural por tipo:**
```
laudo        → "Laudo"
cefalometria → "Cefalometria"
fotografia   → "Fotografia com impressão" (se metadata.com_impressao) ou "Fotografia"
escaneamento → "Escaneamento com laboratório externo" (se metadata.laboratorio_externo) ou "Escaneamento"
```

> Nota: `metadata` é `Json` (objeto). Faça cast seguro: `(item.metadata as Record<string, unknown>)`.

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/components/pipeline-toast.tsx
"use client";

import { useEffect, useRef } from "react";
import type { PipelineItemRecord, PipelineType } from "@/lib/database.types";
import { PIPELINE_TYPE_LABELS } from "@/lib/pipeline-constants";

type PipelineToastProps = {
  items: PipelineItemRecord[];
  onClose: () => void;
};

function getPipelineLabel(item: PipelineItemRecord): string {
  const meta = item.metadata as Record<string, unknown>;

  if (item.pipeline_type === "fotografia" && meta.com_impressao) {
    return "Fotografia com impressão";
  }
  if (item.pipeline_type === "escaneamento" && meta.laboratorio_externo) {
    return "Escaneamento com laboratório externo";
  }
  return PIPELINE_TYPE_LABELS[item.pipeline_type];
}

const TYPE_ABBR: Record<PipelineType, { abbr: string; border: string; bg: string; text: string }> = {
  laudo:        { abbr: "L", border: "border-blue-200",   bg: "bg-blue-50",   text: "text-blue-700" },
  cefalometria: { abbr: "C", border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700" },
  fotografia:   { abbr: "F", border: "border-pink-200",   bg: "bg-pink-50",   text: "text-pink-700" },
  escaneamento: { abbr: "S", border: "border-emerald-200",bg: "bg-emerald-50",text: "text-emerald-700" },
};

const DURATION_MS = 6000;

export function PipelineToast({ items, onClose }: PipelineToastProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "100%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.transition = `width ${DURATION_MS}ms linear`;
          bar.style.width = "0%";
        });
      });
    }
    const timer = setTimeout(onClose, DURATION_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-in slide-in-from-right-full duration-300">
      <div className="rounded-[20px] border border-emerald-300 bg-white shadow-[0_24px_60px_rgba(16,185,129,0.18)] px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Exame concluído</p>
            <p className="mt-0.5 text-xs text-slate-500">Esteiras abertas:</p>
            <ul className="mt-2 space-y-1">
              {items.map((item) => {
                const s = TYPE_ABBR[item.pipeline_type];
                return (
                  <li key={item.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${s.border} ${s.bg} text-[10px] font-bold ${s.text} shrink-0`}>
                      {s.abbr}
                    </span>
                    {getPipelineLabel(item)}
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none mt-0.5"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="mt-4 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
          <div ref={barRef} className="h-full bg-emerald-400 rounded-full" style={{ width: "100%" }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-toast.tsx
git commit -m "feat: add PipelineToast component"
```

---

## Task 5: Buscar pipeline_items no server component da recepção

**Files:**
- Modify: `src/app/(app)/recepcao/page.tsx`
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

### 5a — `recepcao/page.tsx`

Adicionar fetch de pipeline_items agrupados por `attendance_id` e passar ao `ReceptionDashboard`.

- [ ] **Step 1: Modificar `page.tsx`**

Substituir o bloco:
```typescript
  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
    fetchExamRooms(supabase),
  ]);

  return (
    <ReceptionDashboard
      initialAttendances={attendances}
      initialItems={queueItems}
      range={range}
      rooms={rooms}
      selectedDate={formatDateInputValue(selectedDate)}
    />
  );
```

Por:
```typescript
  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
    fetchExamRooms(supabase),
  ]);

  const attendanceIds = attendances.map((a) => a.id);
  const pipelineItemsByAttendanceId = new Map<string, import("@/lib/database.types").PipelineItemRecord[]>();

  if (attendanceIds.length) {
    const { data: pipelineItems } = await supabase
      .from("pipeline_items")
      .select("id, attendance_id, pipeline_type, status, sla_deadline, opened_at, metadata")
      .in("attendance_id", attendanceIds)
      .order("opened_at", { ascending: true });

    for (const item of pipelineItems ?? []) {
      const current = pipelineItemsByAttendanceId.get(item.attendance_id) ?? [];
      current.push(item as import("@/lib/database.types").PipelineItemRecord);
      pipelineItemsByAttendanceId.set(item.attendance_id, current);
    }
  }

  return (
    <ReceptionDashboard
      initialAttendances={attendances}
      initialItems={queueItems}
      initialPipelineItemsByAttendanceId={pipelineItemsByAttendanceId}
      range={range}
      rooms={rooms}
      selectedDate={formatDateInputValue(selectedDate)}
    />
  );
```

- [ ] **Step 2: Modificar `reception-dashboard.tsx`**

Localizar o tipo `ReceptionDashboardProps` e adicionar o novo campo:
```typescript
type ReceptionDashboardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  initialPipelineItemsByAttendanceId: Map<string, PipelineItemRecord[]>;
  range: QueueDateRange;
  rooms: ExamRoomRecord[];
  selectedDate: string;
};
```

Adicionar o import do tipo no topo (junto aos outros de `@/lib/database.types`):
```typescript
import type {
  AttendanceOverallStatus,
  AttendancePriority,
  AttendanceRecord,
  AttendanceWithQueueItems,
  ExamRoomRecord,
  ExamType,
  PipelineFlags,
  PipelineItemRecord,
  QueueItemRecord,
} from "@/lib/database.types";
```

Na assinatura da função `ReceptionDashboard`, adicionar o parâmetro:
```typescript
export function ReceptionDashboard({
  initialAttendances,
  initialItems,
  initialPipelineItemsByAttendanceId,
  range,
  rooms,
  selectedDate,
}: ReceptionDashboardProps) {
```

Adicionar `pipelineItemsByAttendanceId` como constante logo após as declarações de `useMemo` existentes (não precisa de estado reativo — os dados são estáticos no server fetch):
```typescript
  const pipelineItemsByAttendanceId = initialPipelineItemsByAttendanceId;
```

- [ ] **Step 3: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/recepcao/page.tsx src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: fetch pipeline_items in reception server component"
```

---

## Task 6: Exibir chips em `AttendanceRowCompact`

**Files:**
- Modify: `src/components/attendance-row-compact.tsx`

O componente precisa receber os `pipeline_items` do atendimento e renderizar `<PipelineChips>` na segunda linha, entre o progresso de exames e o `⋯`.

- [ ] **Step 1: Atualizar props e imports**

Substituir o início do arquivo até antes da função:
```typescript
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { PipelineChips } from "@/components/pipeline-chips";
import { formatClock } from "@/lib/date";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/constants";
import { getAttendanceOverallStatus } from "@/lib/queue";
import type { AttendanceOverallStatus, AttendanceWithQueueItems, PipelineItemRecord } from "@/lib/database.types";

type AttendanceRowCompactProps = {
  attendance: AttendanceWithQueueItems;
  onExpandClick: () => void;
  pipelineItems: PipelineItemRecord[];
};
```

- [ ] **Step 2: Usar o novo prop na assinatura**

```typescript
export function AttendanceRowCompact({
  attendance,
  onExpandClick,
  pipelineItems,
}: AttendanceRowCompactProps) {
```

- [ ] **Step 3: Adicionar chips na segunda linha**

Localizar o trecho da linha 2 (bottom line) no JSX:
```tsx
        {/* Bottom line: Registration, Entry time, Progress */}
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          {attendance.patient_registration_number && (
            <>
              <span className="font-medium text-cyan-800">
                Cad. {attendance.patient_registration_number}
              </span>
              <span className="text-slate-300">•</span>
            </>
          )}
          <span className="text-slate-600">
            Entrada {formatClock(attendance.created_at)}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-600">
            {completedSteps} de {attendance.queueItems.length} exames
          </span>
          <span className="ml-auto text-slate-600">⋯</span>
        </div>
```

Substituir por:
```tsx
        {/* Bottom line: Registration, Entry time, Progress, Pipeline chips */}
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          {attendance.patient_registration_number && (
            <>
              <span className="font-medium text-cyan-800">
                Cad. {attendance.patient_registration_number}
              </span>
              <span className="text-slate-300">•</span>
            </>
          )}
          <span className="text-slate-600">
            Entrada {formatClock(attendance.created_at)}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-600">
            {completedSteps} de {attendance.queueItems.length} exames
          </span>
          {pipelineItems.length > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <PipelineChips items={pipelineItems} />
            </>
          )}
          <span className="ml-auto text-slate-600">⋯</span>
        </div>
```

- [ ] **Step 4: Passar `pipelineItems` no `reception-dashboard.tsx`**

No `reception-dashboard.tsx`, localizar onde `AttendanceRowCompact` é renderizado:
```tsx
                  <AttendanceRowCompact
                    attendance={attendance}
                    onExpandClick={() =>
                      setExpandedId(isExpanded ? null : attendance.id)
                    }
                  />
```

Substituir por:
```tsx
                  <AttendanceRowCompact
                    attendance={attendance}
                    onExpandClick={() =>
                      setExpandedId(isExpanded ? null : attendance.id)
                    }
                    pipelineItems={pipelineItemsByAttendanceId.get(attendance.id) ?? []}
                  />
```

- [ ] **Step 5: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/attendance-row-compact.tsx src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: show pipeline chips in reception attendance row"
```

---

## Task 7: Toast de esteiras após concluir exame no TSB

**Files:**
- Modify: `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx`

Após `advanceStatus()` retornar um item com `status === "finalizado"`, fazer GET `/api/clinic/pipeline-items?attendanceIds=<id>` e exibir `<PipelineToast>`.

- [ ] **Step 1: Adicionar imports no topo do arquivo**

Adicionar ao bloco de imports existente:
```typescript
import { PipelineToast } from "@/components/pipeline-toast";
import type { PipelineItemRecord } from "@/lib/database.types";
```

- [ ] **Step 2: Adicionar estado para o toast**

Logo após as declarações de estado existentes (após `repeatExamError`), adicionar:
```typescript
  const [toastPipelineItems, setToastPipelineItems] = useState<PipelineItemRecord[]>([]);
```

- [ ] **Step 3: Modificar `advanceStatus` para buscar e exibir o toast**

Localizar o trecho no final de `advanceStatus`, após a chamada de `applyQueueItemMutation`:
```typescript
    if (payload.attendance) {
      applyQueueItemMutation(
        payload.attendance,
        payload.queueItem,
        payload.queueItems ?? [],
      );
    } else {
      setQueueItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? (payload.queueItem as QueueItemRecord) : currentItem,
        ),
      );
    }
    setPendingItemId(null);
```

Substituir por:
```typescript
    if (payload.attendance) {
      applyQueueItemMutation(
        payload.attendance,
        payload.queueItem,
        payload.queueItems ?? [],
      );
    } else {
      setQueueItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? (payload.queueItem as QueueItemRecord) : currentItem,
        ),
      );
    }
    setPendingItemId(null);

    if (payload.queueItem.status === "finalizado" && payload.queueItem.attendance_id) {
      const pipelineResponse = await fetch(
        `/api/clinic/pipeline-items?attendanceIds=${payload.queueItem.attendance_id}`,
        { credentials: "same-origin" },
      );
      if (pipelineResponse.ok) {
        const pipelinePayload = (await pipelineResponse.json()) as { items?: PipelineItemRecord[] };
        setToastPipelineItems(pipelinePayload.items ?? []);
      }
    }
```

- [ ] **Step 4: Renderizar o toast no JSX**

Localizar o final do JSX retornado, antes do `</div>` de fechamento (depois do `<RepeatExamModal ...>`):
```tsx
      <RepeatExamModal
        isOpen={repeatExamItemId !== null}
        ...
      />
```

Adicionar logo após o `<RepeatExamModal>`:
```tsx
      {toastPipelineItems.length > 0 && (
        <PipelineToast
          items={toastPipelineItems}
          onClose={() => setToastPipelineItems([])}
        />
      )}
```

- [ ] **Step 5: Verificar que compila**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/atendimento/\[roomSlug\]/room-queue-board.tsx
git commit -m "feat: show pipeline toast after exam conclusion in TSB"
```

---

## Task 8: Verificação final

- [ ] **Step 1: Build completo**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npm run build 2>&1 | tail -30
```
Esperado: build sem erros.

- [ ] **Step 2: Checklist manual**

Abrir a recepção em dev (`npm run dev`) e verificar:
1. Paciente com esteiras → chips L/C/F/S aparecem na segunda linha do cartão
2. Chip verde → `publicado_finalizado`
3. Chip amarelo → qualquer outro status dentro do SLA
4. Chip vermelho → `sla_deadline` no passado
5. Tooltip nativo (title) aparece ao passar o mouse
6. Paciente sem esteiras → nenhum chip (sem elemento vazio)

Abrir tela de sala do TSB e verificar:
1. Clicar "Concluir exame" em item `em_atendimento`
2. Toast aparece no canto inferior direito listando as esteiras
3. Toast some após ~6 segundos
4. Botão × fecha o toast

- [ ] **Step 3: Commit final se necessário**

```bash
git add -p
git commit -m "chore: final adjustments for pipeline chips feature"
```

---

## Self-Review

**Spec coverage:**
- [x] Chips L/C/F/S na lista da recepção → Tasks 1, 2, 5, 6
- [x] Cores por tipo → Task 2 (`TYPE_STYLES`)
- [x] Ponto de status verde/amarelo/vermelho → Task 2 (`getStatusDotClass`)
- [x] Tooltip → Task 2 (`title` nativo, `buildTooltip`)
- [x] Toast/banner ao finalizar TSB → Tasks 3, 4, 7
- [x] Linguagem natural nas esteiras (impressão, lab externo) → Task 4 (`getPipelineLabel`)
- [x] Sem regressão na lista existente → chips condicionais, props adicionais opcionais
- [x] Sem alteração em lógica de negócio → apenas leitura

**Sem placeholders:** verificado — todos os passos têm código completo.

**Consistência de tipos:** `PipelineItemRecord` definido em Task 1, usado nas Tasks 2, 3, 4, 5, 6, 7 com o mesmo nome.
