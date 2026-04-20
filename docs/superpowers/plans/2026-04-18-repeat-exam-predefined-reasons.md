# Repeat Exam Predefined Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text textarea in the repeat-exam modal with predefined reason options, add a free-text field only for "OUTROS", and show all repetition reasons (expandable) in the admin report table.

**Architecture:** Frontend-only change for the modal (hardcoded options, no migration). API change to include all repetitions per exam in the response (not just latest). Table component updated to show expandable history.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/repeat-exam-modal.tsx` | Replace textarea with predefined option buttons + conditional free-text field |
| `src/app/api/clinic/repetitions/route.ts` | Add `repetitions` array to each result row |
| `src/components/repetitions-report-table.tsx` | Update `RepetitionRecord` type, render expandable motivo column |

---

### Task 1: Update modal — predefined reason buttons

**Files:**
- Modify: `src/components/repeat-exam-modal.tsx`

- [ ] **Step 1: Replace textarea with predefined options**

Replace the entire content of `src/components/repeat-exam-modal.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";

const PRESET_REASONS = [
  "ERRO NO POSICIONAMENTO",
  "ERRO NO PROTOCOLO DE AQUISIÇÃO",
  "PACIENTE MOVIMENTOU",
  "FALHA NO EQUIPAMENTO",
  "OUTROS",
] as const;

type PresetReason = (typeof PRESET_REASONS)[number];

type Props = {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  error?: string;
};

export function RepeatExamModal({ isOpen, isLoading, onClose, onSubmit, error }: Props) {
  const [selected, setSelected] = useState<PresetReason | null>(null);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setDetail("");
    }
  }, [isOpen]);

  function handleClose() {
    onClose();
  }

  function buildReason(): string | null {
    if (!selected) return null;
    if (selected === "OUTROS") {
      const trimmed = detail.trim();
      if (trimmed.length < 3) return null;
      return `OUTROS: ${trimmed}`;
    }
    return selected;
  }

  async function handleSubmit() {
    const reason = buildReason();
    if (!reason) return;
    await onSubmit(reason);
    setSelected(null);
    setDetail("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") handleClose();
  }

  const reason = buildReason();
  const canSubmit = reason !== null && !isLoading;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="px-8 py-8">
          <h2 className="text-xl font-bold text-slate-900">Repetir Exame?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Selecione o motivo da repetição para registrar no histórico.
          </p>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {PRESET_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSelected(option)}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  selected === option
                    ? "border-orange-400 bg-orange-50 text-orange-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option === "OUTROS" ? "OUTROS: ESPECIFICAR" : option}
              </button>
            ))}
          </div>

          {selected === "OUTROS" && (
            <div className="mt-4">
              <textarea
                autoFocus
                rows={3}
                maxLength={480}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Descreva o motivo..."
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
              />
              <p className="mt-1 text-xs text-slate-400">{detail.length}/480 caracteres</p>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Salvando..." : "Confirmar Repetição"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `repeat-exam-modal.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/repeat-exam-modal.tsx
git commit -m "feat: replace repeat-exam textarea with predefined reason buttons"
```

---

### Task 2: Update API to return all repetitions per exam

**Files:**
- Modify: `src/app/api/clinic/repetitions/route.ts`

The current response groups rows by `queue_item_id` and returns only the latest row per exam. We need to expose all repetitions per exam so the table can show the expandable history.

- [ ] **Step 1: Add `RepetitionEntry` type and update `data` mapping**

In `src/app/api/clinic/repetitions/route.ts`, find the block that builds `data` (around line 233). Replace it with:

```ts
type RepetitionEntry = {
  id: string;
  repeated_at: string;
  repetition_reason: string | null;
  technician_id: string | null;
};

// Group by queue_item_id - each queue_item is a specific exam that can be repeated
const groupByQueueItem = new Map<string, ExamRepetitionRow[]>();
for (const row of repetitionRows) {
  const list = groupByQueueItem.get(row.queue_item_id) ?? [];
  list.push(row);
  groupByQueueItem.set(row.queue_item_id, list);
}

// Show only exams that were actually repeated (>= 1 registered repetition)
// Each exam_repetitions row is one repetition event
const data = Array.from(groupByQueueItem.entries())
  .map(([queueItemId, rows]) => {
    const latestRow = rows[0]; // sorted desc by repeated_at
    const queueItem = queueItemMap.get(queueItemId);
    const attendance = queueItem
      ? attendanceMap.get(queueItem.attendance_id)
      : undefined;

    const repetitions: RepetitionEntry[] = [...rows]
      .sort((a, b) => new Date(a.repeated_at).getTime() - new Date(b.repeated_at).getTime())
      .map((r) => ({
        id: r.id,
        repeated_at: r.repeated_at,
        repetition_reason: r.repetition_reason,
        technician_id: r.technician_id,
      }));

    return {
      exam_type: latestRow.exam_type,
      id: latestRow.id,
      patient_name: attendance?.patient_name ?? queueItem?.patient_name ?? null,
      patient_registration_number:
        attendance?.patient_registration_number ?? null,
      queue_item_id: queueItemId,
      repeated_at: latestRow.repeated_at,
      repetition_reason: latestRow.repetition_reason,
      repetition_count: rows.length,
      room_slug: latestRow.room_slug,
      technician_id: latestRow.technician_id,
      repetitions,
    };
  })
  .sort((a, b) => new Date(b.repeated_at).getTime() - new Date(a.repeated_at).getTime());
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `repetitions/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clinic/repetitions/route.ts
git commit -m "feat: include all repetitions array in repetitions API response"
```

---

### Task 3: Update admin table — expandable motivo column

**Files:**
- Modify: `src/components/repetitions-report-table.tsx`

- [ ] **Step 1: Add `RepetitionEntry` type and update `RepetitionRecord`**

At the top of `src/components/repetitions-report-table.tsx`, find the `RepetitionRecord` type (around line 12) and add the new sub-type and field:

```ts
type RepetitionEntry = {
  id: string;
  repeated_at: string;
  repetition_reason: string | null;
  technician_id: string | null;
};

type RepetitionRecord = {
  id: string;
  queue_item_id: string;
  exam_type: ExamType;
  room_slug: string | null;
  technician_id: string | null;
  repeated_at: string;
  repetition_reason?: string | null;
  repetition_count?: number;
  repetitions?: RepetitionEntry[];
  patient_name?: string | null;
  patient_registration_number?: string | null;
};
```

- [ ] **Step 2: Add `ExpandableMotivo` component**

Before the `RepetitionsReportTable` function, add:

```tsx
function ExpandableMotivo({ repetitions }: { repetitions?: RepetitionEntry[] }) {
  const [open, setOpen] = useState(false);

  if (!repetitions || repetitions.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  const latest = repetitions[repetitions.length - 1];
  const prior = repetitions.length - 1;

  if (prior === 0) {
    return (
      <span className="text-slate-700">
        {latest.repetition_reason ?? <span className="text-slate-400">-</span>}
      </span>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-start gap-1.5 text-left text-sm text-slate-700 hover:text-slate-900"
      >
        <span
          className="mt-0.5 shrink-0 text-[10px] text-slate-400 transition-transform"
          style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9654;
        </span>
        <span>
          {latest.repetition_reason ?? "-"}{" "}
          <span className="text-xs text-slate-400">(+{prior} anterior{prior > 1 ? "es" : ""})</span>
        </span>
      </button>
      {open && (
        <div className="mt-2 border-l-2 border-slate-200 pl-3">
          {repetitions.map((r, i) => (
            <div key={r.id} className="flex gap-2 py-1 text-xs text-slate-500">
              <span className="shrink-0 font-bold text-slate-400">{i + 1}ª</span>
              <span>{r.repetition_reason ?? "-"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Use `ExpandableMotivo` in the table row**

Find the `<td>` that renders the motivo (around line 279) and replace it:

```tsx
<td className="max-w-xs px-3 py-3">
  <ExpandableMotivo repetitions={rep.repetitions} />
</td>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `repetitions-report-table.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/repetitions-report-table.tsx
git commit -m "feat: show expandable repetition reason history in admin table"
```

---

## How to Test

### Modal (atendimento)
1. Abra uma sala no `/atendimento/[sala]`
2. Coloque um exame em atendimento e clique em "Repetir exame"
3. Verifique que aparecem 5 botões de opção (sem textarea livre)
4. Selecione qualquer opção exceto OUTROS — confirmar deve ficar habilitado
5. Selecione OUTROS — um campo de texto deve aparecer; confirmar só habilita com 3+ chars
6. Confirme a repetição; verifique que o registro foi salvo (verificar no Supabase ou repetindo o fluxo no admin)

### Tabela do admin
1. Acesse `/admin` > aba de repetições
2. Selecione o período onde o exame foi repetido
3. Para exame com 1 repetição: motivo aparece direto, sem seta
4. Para exame com 2+ repetições: aparece o motivo mais recente + "(+N anteriores)" com seta
5. Clique na seta — lista expandida mostra todas as repetições em ordem cronológica com numeração (1ª, 2ª...)
