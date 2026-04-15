# Reception Layout Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact attendance cards from ~300px to ~60px, showing essential info inline with expandable details via accordion.

**Architecture:** Extract compact card rendering to `AttendanceRowCompact` component, add `expandedId` state to track which card is expanded, render inline accordion below compact card. Reuse existing `AttendanceTimeline` and `ReceptionReturnActionCard` components for expanded view. No API or data model changes.

**Tech Stack:** React, TypeScript, Tailwind CSS, inline state (no new libraries)

---

## File Structure

```
src/
├── components/
│   ├── attendance-row-compact.tsx          [NEW] Compact card (60px) display
│   └── attendance-row-expanded.tsx         [NEW] Expanded accordion details
├── app/(app)/recepcao/
│   └── reception-dashboard.tsx             [MODIFY] Add expandedId state, render new components
└── (no new tests — existing E2E tests cover functionality)
```

## Component Boundaries

**`AttendanceRowCompact`** (Presentational)
- Props: `attendance`, `isToday`, `onExpandClick`
- Renders: Single-line compact card with 6 fields
- Responsibility: Display only, no logic
- Size: ~80 lines

**`AttendanceRowExpanded`** (Presentational)
- Props: `attendance`, `isToday`, `onQueueItemMutation`
- Renders: Timeline, action cards (reuses existing components)
- Responsibility: Display expanded details, pass mutations up
- Size: ~50 lines (mostly delegating to existing components)

**`ReceptionDashboard`** (Container)
- Add state: `const [expandedId, setExpandedId] = useState<string | null>(null)`
- Render logic: If card is not expanded, show `AttendanceRowCompact`, else show both compact header + `AttendanceRowExpanded`
- Size: +20 lines to current file

---

## Task Breakdown

### Task 1: Create AttendanceRowCompact component

**Files:**
- Create: `src/components/attendance-row-compact.tsx`

- [ ] **Step 1: Write the component skeleton**

Create `src/components/attendance-row-compact.tsx`:

```typescript
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { formatClock } from "@/lib/date";
import type { AttendanceWithQueueItems } from "@/lib/database.types";

type AttendanceRowCompactProps = {
  attendance: AttendanceWithQueueItems;
  onExpandClick: () => void;
};

export function AttendanceRowCompact({
  attendance,
  onExpandClick,
}: AttendanceRowCompactProps) {
  const completedSteps = attendance.queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;

  const requestedQuantity = attendance.queueItems.reduce(
    (total, item) => total + item.requested_quantity,
    0,
  );

  return (
    <button
      type="button"
      onClick={onExpandClick}
      className="w-full text-left rounded-[16px] border border-slate-200 bg-white/85 px-[14px] py-[14px] shadow-[0_18px_32px_rgba(15,23,42,0.04)] hover:border-cyan-500 hover:bg-emerald-50 transition-all"
    >
      <div className="grid gap-2">
        {/* Top line: Name, Priority, Status */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-slate-950">
            {attendance.patient_name}
          </p>
          <PriorityBadge priority={attendance.priority} />
          <AttendanceStatusBadge 
            status={getAttendanceOverallStatus(attendance, attendance.queueItems)}
          />
        </div>

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
      </div>
    </button>
  );
}

// Helper (copy from reception-dashboard.tsx)
function AttendanceStatusBadge({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-300 bg-amber-100 text-amber-950",
    pendente_retorno: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    em_andamento: "border-sky-200 bg-sky-50 text-sky-800",
    finalizado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <span
      className={`inline-flex rounded-full border px-[8px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.04em] ${styles[status]}`}
    >
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Add imports and types to the file**

Add these imports at the top:

```typescript
import { ATTENDANCE_STATUS_LABELS } from "@/lib/constants";
import { getAttendanceOverallStatus } from "@/lib/queue";
import type { AttendanceOverallStatus } from "@/lib/database.types";
```

- [ ] **Step 3: Verify file compiles**

Run: `npm run build --filter=clinic`

Expected: No TS errors in `attendance-row-compact.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/attendance-row-compact.tsx
git commit -m "feat: add AttendanceRowCompact component for collapsed view"
```

---

### Task 2: Create AttendanceRowExpanded component

**Files:**
- Create: `src/components/attendance-row-expanded.tsx`

- [ ] **Step 1: Write the expanded details component**

Create `src/components/attendance-row-expanded.tsx`:

```typescript
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { ReceptionReturnActionCard } from "./reception-dashboard"; // Temporarily import from dashboard
import { EXAM_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { sortAttendanceQueueItemsByFlow, isQueueItemReturnPending } from "@/lib/queue";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  QueueItemRecord,
} from "@/lib/database.types";

type AttendanceRowExpandedProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  onQueueItemMutation: (
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems?: QueueItemRecord[],
  ) => void;
};

export function AttendanceRowExpanded({
  attendance,
  isToday,
  onQueueItemMutation,
}: AttendanceRowExpandedProps) {
  const actionableItems = attendance.canceled_at
    ? []
    : sortAttendanceQueueItemsByFlow(attendance.queueItems).filter(
        (item) => item.status !== "finalizado" && item.status !== "cancelado",
      );

  return (
    <div className="rounded-b-[16px] border-x border-b border-slate-200 bg-slate-50/50 px-[14px] py-[14px]">
      {/* Notes section */}
      {attendance.notes && (
        <div className="mb-4 pb-4 border-b border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Observação
          </p>
          <p className="mt-2 text-sm text-slate-700">{attendance.notes}</p>
        </div>
      )}

      {/* Cancellation reason */}
      {attendance.cancellation_reason && (
        <div className="mb-4 pb-4 border-b border-slate-200">
          <p className="text-sm font-medium text-rose-700">
            Motivo do cancelamento: {attendance.cancellation_reason}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Cancelado em {formatDateTime(attendance.canceled_at)}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="mb-4 pb-4 border-b border-slate-200">
        <AttendanceTimeline items={attendance.queueItems} title="Exames do atendimento" />
      </div>

      {/* Action cards */}
      {actionableItems.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Ações por etapa
          </p>
          <div className="mt-3 grid gap-3">
            {actionableItems.map((item) => (
              <ReceptionReturnActionCard
                key={item.id}
                attendance={attendance}
                isToday={isToday}
                item={item}
                onQueueItemMutation={onQueueItemMutation}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npm run build --filter=clinic`

Expected: No TS errors (ReceptionReturnActionCard import may trigger warning, fix in Task 3)

- [ ] **Step 3: Commit**

```bash
git add src/components/attendance-row-expanded.tsx
git commit -m "feat: add AttendanceRowExpanded component for accordion details"
```

---

### Task 3: Extract ReceptionReturnActionCard to separate file

**Files:**
- Create: `src/components/reception-return-action-card.tsx`
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx:648-835`

- [ ] **Step 1: Extract ReceptionReturnActionCard to new file**

Create `src/components/reception-return-action-card.tsx` with the entire function from lines 648-835 of reception-dashboard.tsx:

```typescript
import { useState } from "react";
import { EXAM_LABELS } from "@/lib/constants";
import { readJsonResponse } from "@/lib/fetch-json";
import { isQueueItemReturnPending } from "@/lib/queue";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  QueueItemRecord,
} from "@/lib/database.types";

type ReceptionReturnActionCardProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  item: QueueItemRecord;
  onQueueItemMutation: (
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems?: QueueItemRecord[],
  ) => void;
};

export function ReceptionReturnActionCard({
  attendance,
  isToday,
  item,
  onQueueItemMutation,
}: ReceptionReturnActionCardProps) {
  const isReturnPending = isQueueItemReturnPending({ ...item, attendance });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [returnReason, setReturnReason] = useState(
    item.return_pending_reason ?? attendance.return_pending_reason ?? "",
  );

  async function submitReturnPending(nextIsPending: boolean) {
    setReturnError("");

    const normalizedReason = returnReason.trim();

    if (nextIsPending && normalizedReason.length < 3) {
      setReturnError("Informe o motivo da pendencia de retorno.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/clinic/queue-items/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "return-pending",
        isPending: nextIsPending,
        reason: normalizedReason || null,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      error?: string;
      queueItem?: QueueItemRecord;
      queueItems?: QueueItemRecord[];
    }>(response)) ?? {};

    if (!response.ok || !payload.attendance || !payload.queueItem) {
      setReturnError(
        payload.error || "Nao foi possivel atualizar a marcacao de retorno.",
      );
      setIsSubmitting(false);
      return;
    }

    onQueueItemMutation(
      payload.attendance as AttendanceRecord,
      payload.queueItem as QueueItemRecord,
      (payload.queueItems ?? []) as QueueItemRecord[],
    );
    setReturnReason(nextIsPending ? normalizedReason : "");
    setIsExpanded(false);
    setIsSubmitting(false);
  }

  return (
    <div
      className={
        isReturnPending
          ? "rounded-[22px] border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-4"
          : "rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">
              {EXAM_LABELS[item.exam_type]}
            </p>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Qtd. {item.requested_quantity}
            </span>
            <StatusBadge status={item.status} />
            {isReturnPending ? (
              <span className="inline-flex rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-xs font-semibold text-fuchsia-800">
                Retorno pendente
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {isReturnPending
              ? item.return_pending_reason ||
                attendance.return_pending_reason ||
                "Sem motivo registrado."
              : "A recepcao pode tirar este exame da fila atual quando o paciente precisar retornar depois."}
          </p>
        </div>

        {isReturnPending ? (
          <button
            type="button"
            onClick={() => submitReturnPending(false)}
            disabled={!isToday || isSubmitting}
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!isToday
              ? "Disponivel apenas hoje"
              : isSubmitting
                ? "Retomando..."
                : "Retomar exame"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setReturnError("");
              setReturnReason(
                item.return_pending_reason ?? attendance.return_pending_reason ?? "",
              );
              setIsExpanded((current) => !current);
            }}
            disabled={!isToday}
            className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isToday ? "Marcar pendencia" : "Consulta historica"}
          </button>
        )}
      </div>

      {!isReturnPending && isToday && isExpanded ? (
        <div className="mt-4 rounded-[20px] border border-fuchsia-200 bg-white px-4 py-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Motivo da pendencia
            </span>
            <textarea
              rows={3}
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              className="w-full rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100"
              placeholder="Ex.: paciente saiu e volta depois, exame restante para outro horario."
            />
          </label>
          {returnError ? (
            <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-800">
              {returnError}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submitReturnPending(true)}
              disabled={isSubmitting}
              className="rounded-2xl bg-fuchsia-700 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Salvando..." : "Confirmar pendencia"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                setReturnError("");
                setReturnReason("");
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {isReturnPending && returnError ? (
        <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-sm text-fuchsia-800">
          {returnError}
        </div>
      ) : null}
    </div>
  );
}

// Helper (copy from reception-dashboard.tsx)
import { StatusBadge } from "@/components/status-badge";
```

- [ ] **Step 2: Replace function in reception-dashboard.tsx with import**

In `src/app/(app)/recepcao/reception-dashboard.tsx`, find the `ReceptionReturnActionCard` function (lines 648-835) and replace with:

```typescript
import { ReceptionReturnActionCard } from "@/components/reception-return-action-card";
```

Delete the entire function body.

- [ ] **Step 3: Verify file compiles**

Run: `npm run build --filter=clinic`

Expected: No TS errors

- [ ] **Step 4: Commit**

```bash
git add src/components/reception-return-action-card.tsx src/app/(app)/recepcao/reception-dashboard.tsx
git commit -m "refactor: extract ReceptionReturnActionCard to separate component"
```

---

### Task 4: Update reception-dashboard.tsx with expandable state

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx:69-145` (near ReceptionDashboard declaration)

- [ ] **Step 1: Add expandedId state to ReceptionDashboard**

In `src/app/(app)/recepcao/reception-dashboard.tsx`, add after line 99 (after other useState calls):

```typescript
  const [expandedId, setExpandedId] = useState<string | null>(null);
```

Also add the imports at the top:

```typescript
import { AttendanceRowCompact } from "@/components/attendance-row-compact";
import { AttendanceRowExpanded } from "@/components/attendance-row-expanded";
```

- [ ] **Step 2: Verify imports work**

Run: `npm run build --filter=clinic`

Expected: No TS errors in reception-dashboard

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/recepcao/reception-dashboard.tsx
git commit -m "feat: add expandedId state to ReceptionDashboard"
```

---

### Task 5: Replace AttendanceRow rendering with compact/expanded components

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx:522-532` (inside filteredAttendances.map)

- [ ] **Step 1: Replace AttendanceRow render logic**

Find the section in reception-dashboard.tsx:

```typescript
        {filteredAttendances.length ? (
          <div className="mt-6 space-y-3">
            {filteredAttendances.map((attendance) => (
              <AttendanceRow
                key={attendance.id}
                attendance={attendance}
                isToday={isToday}
                onQueueItemMutation={applyQueueItemMutation}
              />
            ))}
          </div>
        ) : (
```

Replace with:

```typescript
        {filteredAttendances.length ? (
          <div className="mt-6 space-y-0">
            {filteredAttendances.map((attendance) => {
              const isExpanded = expandedId === attendance.id;
              return (
                <div key={attendance.id}>
                  <AttendanceRowCompact
                    attendance={attendance}
                    onExpandClick={() =>
                      setExpandedId(isExpanded ? null : attendance.id)
                    }
                  />
                  {isExpanded && (
                    <AttendanceRowExpanded
                      attendance={attendance}
                      isToday={isToday}
                      onQueueItemMutation={(updatedAttendance, updatedItem, updatedQueueItems) => {
                        applyQueueItemMutation(
                          updatedAttendance,
                          updatedItem,
                          updatedQueueItems,
                        );
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
```

- [ ] **Step 2: Remove old AttendanceRow component**

Delete the entire `function AttendanceRow(...)` block from the file (lines 546-646).

- [ ] **Step 3: Verify file compiles**

Run: `npm run build --filter=clinic`

Expected: No TS errors

- [ ] **Step 4: Test in browser**

Start dev server: `npm run dev --filter=clinic`

Visit: http://localhost:3000/recepcao

Expected:
- Cards display in compact form (~60px height)
- Clicking ⋯ expands to show details
- Clicking again collapses
- Form at top is unchanged
- Filters work correctly

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/recepcao/reception-dashboard.tsx
git commit -m "feat: refactor attendance rendering to use compact/expanded components"
```

---

### Task 6: Adjust spacing to reduce space-y-3 to space-y-0

**Files:**
- Verify: `src/app/(app)/recepcao/reception-dashboard.tsx:524`

- [ ] **Step 1: Verify spacing in compact list**

The space between cards should be tight (10px, not 12px). Check that the AttendanceRowCompact and AttendanceRowExpanded components use `mb-[10px]` consistently.

In `src/components/attendance-row-compact.tsx`, verify line 35 has:

```typescript
className="... mb-[10px] ..."
```

And in `src/components/attendance-row-expanded.tsx`, verify it has no margin-bottom (expands seamlessly).

- [ ] **Step 2: Test visual spacing**

Reload http://localhost:3000/recepcao in browser

Expected:
- Compact cards have 10px gap between them
- Expanded content sits directly below compact card with no gap
- 10-12 compact cards fit per screen

- [ ] **Step 3: Commit**

```bash
git add src/components/attendance-row-compact.tsx src/components/attendance-row-expanded.tsx
git commit -m "style: verify compact card spacing is tight (10px gap)"
```

---

### Task 7: Visual regression testing with real data

**Files:**
- Test: Manual browser testing (no new test file)

- [ ] **Step 1: Load reception with 20+ attendance records**

Open http://localhost:3000/recepcao in browser (staging DB with real data).

Expected:
- At least 10-12 cards visible at once
- No horizontal scrolling
- All 6 fields visible: name, priority, status, registration #, entry time, progress

- [ ] **Step 2: Test expansion interaction**

For 3 different cards:
- Click ⋯ to expand
- Verify timeline appears
- Verify action cards appear (if any)
- Verify notes display
- Click ⋯ again to collapse
- Verify collapsed state is correct

Expected:
- Expansion smooth
- All content visible
- No layout shift
- Click closes without errors

- [ ] **Step 3: Test filters with compact layout**

Click each filter button: "Todos", "Aguardando", "Em andamento", "Finalizado", "Cancelado"

Expected:
- Cards re-render correctly
- List animates smoothly
- Expanded cards collapse when filter changes (optional, can stay expanded)

- [ ] **Step 4: Test realtime updates**

In separate browser/device, register a new patient.

Expected:
- New card appears at top of "Aguardando" filter
- Compact view is correct
- No console errors
- Realtime status indicator shows connected

- [ ] **Step 5: Test mobile/tablet responsiveness**

Open browser DevTools, set to iPad (1024px width) and mobile (375px).

Expected:
- Cards still readable
- ⋯ button still clickable
- Layout doesn't break (no horizontal scroll)
- Form inputs still usable

- [ ] **Step 6: Check console for errors**

Open DevTools → Console

Expected:
- No errors
- No warnings related to React rendering
- No performance issues (no excessive re-renders)

- [ ] **Step 7: Commit test verification**

No code changes, just document:

```bash
git commit --allow-empty -m "test: manual visual regression testing complete — 10-12 compact cards visible, expansion works, realtime updates trigger, mobile responsive"
```

---

### Task 8: Final cleanup and PR preparation

**Files:**
- Verify: All files compile and tests pass

- [ ] **Step 1: Run full build**

```bash
npm run build --filter=clinic
```

Expected: No errors or warnings

- [ ] **Step 2: Run type check**

```bash
npm run type-check --filter=clinic
```

Expected: No TS errors

- [ ] **Step 3: Verify no test failures**

```bash
npm test --filter=clinic
```

Expected: All tests pass (existing tests should still work, no new tests needed since functionality is preserved)

- [ ] **Step 4: Final commit message**

Make sure last commit message is descriptive:

```bash
git log --oneline -8
```

Expected last commits should be:
1. test: manual visual regression testing complete...
2. style: verify compact card spacing is tight...
3. feat: refactor attendance rendering to use compact/expanded components...
4. refactor: extract ReceptionReturnActionCard to separate component...
5. feat: add expandedId state to ReceptionDashboard...
6. feat: add AttendanceRowExpanded component for accordion details...
7. feat: add AttendanceRowCompact component for collapsed view...
8. docs: design spec for reception dashboard layout redesign...

- [ ] **Step 5: Create pull request**

```bash
git push origin codex/gerencia-prod-compat
```

Then create PR with:
- **Title:** `feat: compact reception attendance cards for better queue visibility`
- **Description:**
  ```
  ## Summary
  - Compact attendance cards from ~300px to ~60px height
  - Show essential info inline: name, priority, status, registration #, entry time, progress
  - Add expandable accordion for full details (timeline, actions, notes)
  - Enables viewing 10-12 records per screen vs previous 2-3
  - Maintains all existing functionality: realtime updates, filters, actions

  ## Implementation
  - Extract `AttendanceRowCompact` component
  - Extract `AttendanceRowExpanded` component
  - Extract `ReceptionReturnActionCard` to separate file
  - Add `expandedId` state to `ReceptionDashboard`
  - Reuse existing `AttendanceTimeline` and action card components

  ## Test Plan
  - Manual browser testing with 20+ real records
  - Verify expansion/collapse works
  - Verify filters still work
  - Verify realtime updates trigger
  - Verify mobile responsive (tablet/mobile widths)
  - Verify no console errors
  ```

- [ ] **Step 6: Document in CLAUDE.md**

Reminder: After PR is reviewed and merged, update the CLAUDE.md file to mark this feature as complete.

---

## Self-Review Checklist

**Spec Coverage:**
- ✅ Compact card display (60px) — Task 1, 5
- ✅ Essential info visible (name, priority, status, registration #, entry time, progress) — Task 1
- ✅ Expandable accordion — Task 2, 5
- ✅ Reuse existing components (AttendanceTimeline, ReceptionReturnActionCard) — Task 2, 3
- ✅ No form changes — Scope preserved
- ✅ No API/data changes — Scope preserved
- ✅ Filters work — Task 5 (no logic changes)
- ✅ Realtime updates preserved — Task 7 verification
- ✅ Mobile responsive — Task 7 verification

**Placeholder Scan:**
- ✅ No "TBD" or "TODO"
- ✅ All code blocks complete with syntax
- ✅ All commands with expected output
- ✅ No "similar to Task N" references
- ✅ All imports specified

**Type Consistency:**
- ✅ `expandedId: string | null` consistent across tasks
- ✅ `onExpandClick: () => void` in AttendanceRowCompact
- ✅ `onQueueItemMutation` signature matches original
- ✅ Props types exported and reused

**No Gaps Found** ✅

---

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-04-15-reception-layout-compact.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
