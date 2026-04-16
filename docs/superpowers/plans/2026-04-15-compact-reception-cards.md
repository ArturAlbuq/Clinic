# Compact Reception Metric Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the visual footprint of metric cards in the reception dashboard by implementing a compact variant, allowing the form to expand while maintaining consistency with the gerência dashboard.

**Architecture:** Extend the existing `MetricCard` component with an optional `compact` prop that reduces padding, font sizes, and spacing while preserving color scheme and hierarchy. Update `ReceptionDashboard` to pass this prop and adjust grid layout from `sm:grid-cols-2` to `sm:grid-cols-3 lg:grid-cols-5`.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

### Task 1: Extend MetricCard component with compact variant

**Files:**
- Modify: `src/components/metric-card.tsx`

- [ ] **Step 1: Read the current MetricCard component**

Run: Open `src/components/metric-card.tsx` and review the current structure.

Current component exports a `MetricCardProps` with `label`, `value`, `helper`, and optional `accent`. Each accent has corresponding style objects.

- [ ] **Step 2: Add compact prop to MetricCardProps type**

Update the type definition:

```typescript
type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  accent?: "teal" | "amber" | "rose" | "slate";
  compact?: boolean;
};
```

- [ ] **Step 3: Create compact style mappings**

After the existing `ACCENTS`, `LABEL_ACCENTS`, and `HELPER_ACCENTS` objects, add compact versions. Insert after line 33:

```typescript
const COMPACT_ACCENTS = {
  amber:
    "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100",
  rose:
    "border-rose-300 bg-gradient-to-br from-rose-100 via-rose-50 to-pink-100",
  slate:
    "border-slate-300 bg-gradient-to-br from-slate-100 via-white to-slate-50",
  teal:
    "border-cyan-300 bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-100",
} as const;

const COMPACT_LABEL_ACCENTS = {
  amber: "text-amber-800",
  rose: "text-rose-800",
  slate: "text-slate-700",
  teal: "text-cyan-800",
} as const;

const COMPACT_HELPER_ACCENTS = {
  amber: "text-amber-900/85",
  rose: "text-rose-900/85",
  slate: "text-slate-700",
  teal: "text-cyan-950/80",
} as const;
```

- [ ] **Step 4: Update MetricCard function to use compact variants**

Replace the entire function body (starting at line 35) with:

```typescript
export function MetricCard({
  label,
  value,
  helper,
  accent = "slate",
  compact = false,
}: MetricCardProps) {
  const accentMap = compact ? COMPACT_ACCENTS : ACCENTS;
  const labelAccentMap = compact ? COMPACT_LABEL_ACCENTS : LABEL_ACCENTS;
  const helperAccentMap = compact ? COMPACT_HELPER_ACCENTS : HELPER_ACCENTS;

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-[20px] border px-3 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.06)]",
          accentMap[accent],
        )}
      >
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.16em]",
            labelAccentMap[accent],
          )}
        >
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
        <p className={cn("mt-1 text-xs", helperAccentMap[accent])}>{helper}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[26px] border px-5 py-5 shadow-[0_22px_45px_rgba(15,23,42,0.08)]",
        accentMap[accent],
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.18em]",
          labelAccentMap[accent],
        )}
      >
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className={cn("mt-2 text-sm", helperAccentMap[accent])}>{helper}</p>
    </div>
  );
}
```

- [ ] **Step 5: Test the component loads without errors**

Run: `npm run build` in the terminal.

Expected: Build completes without errors related to `metric-card.tsx`.

- [ ] **Step 6: Commit the MetricCard changes**

```bash
git add src/components/metric-card.tsx
git commit -m "feat: add compact variant to MetricCard component"
```

---

### Task 2: Update ReceptionDashboard to use compact metric cards in a single row

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx:464-487`

- [ ] **Step 1: Locate the metric card grid section**

In `reception-dashboard.tsx`, find the grid containing the 4 MetricCards (around line 464). Current code:

```tsx
<div className="grid gap-4 sm:grid-cols-2">
  <MetricCard
    label="Aguardando"
    value={String(totalWaiting)}
    helper="Atendimentos sem exame iniciado."
    accent="amber"
  />
  <MetricCard
    label="Em andamento"
    value={String(totalInProgress)}
    helper="Atendimentos com algum exame em fluxo."
    accent="teal"
  />
  <MetricCard
    label="Finalizados"
    value={String(totalFinished)}
    helper="Atendimentos com todos os exames concluidos."
  />
  <MetricCard
    label="Cancelados"
    value={String(totalCanceled)}
    helper="Atendimentos encerrados com motivo registrado."
  />
</div>
```

- [ ] **Step 2: Update grid layout and add compact prop to each card**

Replace the grid and all 4 MetricCard calls with:

```tsx
<div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
  <MetricCard
    label="Aguardando"
    value={String(totalWaiting)}
    helper="Atendimentos sem exame iniciado."
    accent="amber"
    compact
  />
  <MetricCard
    label="Em andamento"
    value={String(totalInProgress)}
    helper="Atendimentos com algum exame em fluxo."
    accent="teal"
    compact
  />
  <MetricCard
    label="Finalizados"
    value={String(totalFinished)}
    helper="Atendimentos com todos os exames concluidos."
    compact
  />
  <MetricCard
    label="Cancelados"
    value={String(totalCanceled)}
    helper="Atendimentos encerrados com motivo registrado."
    compact
  />
</div>
```

- [ ] **Step 3: Test that the component renders**

Run: `npm run dev` and navigate to `http://localhost:3000/recepcao`.

Expected: Page loads, 4 compact metric cards visible in a responsive grid (3 columns on tablets, 5 columns on desktop). Form visible and expanded.

- [ ] **Step 4: Verify visual alignment**

Open the page in a browser at desktop width. Visually confirm:
- Cards are noticeably smaller than before
- Cards are in a single logical row (wrapping to 2 rows on tablet)
- Form section has more breathing room
- Color accents and text hierarchy are preserved

- [ ] **Step 5: Commit the ReceptionDashboard changes**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: use compact metric cards in single row on reception dashboard"
```

---

### Task 3: Verify responsive behavior across breakpoints

**Files:**
- Test: Manual verification (no code changes)

- [ ] **Step 1: Test at mobile breakpoint (sm: 640px)**

Open DevTools (F12), resize browser to 640px width.

Expected: Cards display in 3-column grid, readable but tightly spaced.

- [ ] **Step 2: Test at tablet breakpoint (lg: 1024px)**

Resize browser to 1024px width.

Expected: Cards display in 5-column grid, well-spaced, form takes up left column area.

- [ ] **Step 3: Test at desktop (1440px+)**

Resize browser to full width (1440px or wider).

Expected: Grid maintains 5 columns, all cards visible without wrapping, form and cards balanced.

- [ ] **Step 4: Verify no layout shifts**

Interact with form (type in inputs, toggle checkboxes). Verify cards stay in place and don't shift.

Expected: No jank, smooth interactions.

- [ ] **Step 5: Document verification**

No commit needed for this task — visual verification is complete.

---

### Task 4: Test GerenciaDashboard still works with unchanged MetricCards

**Files:**
- Test: `src/components/gerencia-dashboard.tsx` (verify, no changes)

- [ ] **Step 1: Navigate to gerência dashboard**

Run: In browser, navigate to `http://localhost:3000/gerencia`.

Expected: Page loads and displays metric cards as before.

- [ ] **Step 2: Verify metric cards are still large**

Visually confirm:
- Cards are the original large size (not compact)
- 5 cards displayed in original layout
- No style regressions

- [ ] **Step 3: Verify realtime updates still work**

If possible, trigger a queue item update in another window/session.

Expected: Metric card values update in real-time without visual glitches.

- [ ] **Step 4: No code changes needed**

This task confirms backward compatibility. Close browser tab.

---

### Task 5: Final verification and manual testing

**Files:**
- Test: Full application flow

- [ ] **Step 1: Test reception form submission**

On `/recepcao`:
1. Fill patient name
2. Select exams
3. Set priority
4. Submit form

Expected: Form submits successfully, patient appears in the list below, metric cards update (Aguardando count increases).

- [ ] **Step 2: Verify metric card updates reflect new attendance**

After submitting, check card values:
- Aguardando should increment
- Cards should update in real-time (if realtime is connected)

Expected: Values reflect current queue state.

- [ ] **Step 3: Test on tablet (DevTools device emulation)**

Emulate iPad or tablet device.

Expected: 3-column card layout, form and cards both legible, no overflow.

- [ ] **Step 4: Test filter interactions**

Click status filter buttons (Todos, Aguardando, etc.).

Expected: Attendance list filters, card values may change, layout remains stable.

- [ ] **Step 5: Build for production**

Run: `npm run build`

Expected: Build succeeds with no errors or TypeScript issues.

- [ ] **Step 6: Commit any remaining changes (if any)**

```bash
git add .
git commit -m "test: verify compact metric cards work across all flows"
```

---

## Plan Summary

| Task | Changes | Outcome |
|------|---------|---------|
| 1 | MetricCard.tsx | Add `compact` prop with reduced padding/fonts |
| 2 | reception-dashboard.tsx | Apply `compact` prop, adjust grid to 3/5 columns |
| 3 | Manual testing | Verify responsive behavior across breakpoints |
| 4 | Manual testing | Confirm GerenciaDashboard backward compatibility |
| 5 | Manual testing | End-to-end verification and production build |
