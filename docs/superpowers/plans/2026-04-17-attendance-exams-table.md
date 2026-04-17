# AttendanceExamsTable Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a responsive component that displays exam details (attendant and execution time) in the admin patient details modal, replacing the current timeline view.

**Architecture:** New component `AttendanceExamsTable` that adapts between desktop (table) and mobile (cards) layouts. It resolves attendant names via a `profileMap` and calculates execution time from queue item timestamps. Integrates into `admin-dashboard.tsx` by replacing `AttendanceTimeline`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Next.js App Router

---

## File Structure

### Files to Create
- `src/components/attendance-exams-table.tsx` — Main component with desktop/mobile rendering

### Files to Modify
- `src/components/admin-dashboard.tsx` — Replace `AttendanceTimeline` import and usage

---

## Implementation Tasks

### Task 1: Create AttendanceExamsTable Component

**Files:**
- Create: `src/components/attendance-exams-table.tsx`

#### Step 1: Create component file with TypeScript interface

Create file `src/components/attendance-exams-table.tsx`:

```typescript
"use client";

import { EXAM_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ProfileRecord, QueueItemRecord } from "@/lib/database.types";
import { sortAttendanceQueueItemsByFlow } from "@/lib/queue";

interface AttendanceExamsTableProps {
  items: QueueItemRecord[];
  profileMap: Map<string, ProfileRecord>;
}

export function AttendanceExamsTable({
  items,
  profileMap,
}: AttendanceExamsTableProps) {
  const orderedItems = sortAttendanceQueueItemsByFlow(items);

  if (!orderedItems.length) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">
        Exames vinculados
      </p>

      {/* Desktop/Tablet: Table */}
      <div className="hidden md:block">
        <DesktopTable items={orderedItems} profileMap={profileMap} />
      </div>

      {/* Mobile: Cards */}
      <div className="block md:hidden">
        <MobileCards items={orderedItems} profileMap={profileMap} />
      </div>
    </div>
  );
}

interface TableProps {
  items: QueueItemRecord[];
  profileMap: Map<string, ProfileRecord>;
}

function DesktopTable({ items, profileMap }: TableProps) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Exame
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Status
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Atendente
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Tempo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <TableRow key={item.id} item={item} profileMap={profileMap} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  item,
  profileMap,
}: {
  item: QueueItemRecord;
  profileMap: Map<string, ProfileRecord>;
}) {
  const attendantName = getAttendantName(item.started_by, profileMap);
  const executionTime = getExecutionTimeLabel(item.started_at, item.finished_at);
  const statusLabel = STATUS_LABELS[item.status];

  return (
    <tr className="hover:bg-slate-50 transition">
      <td className="px-4 py-3 font-medium text-slate-950">
        {EXAM_LABELS[item.exam_type]}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={item.status} label={statusLabel} />
      </td>
      <td className="px-4 py-3 text-slate-950">{attendantName}</td>
      <td className="px-4 py-3 text-slate-950">{executionTime}</td>
    </tr>
  );
}

function MobileCards({ items, profileMap }: TableProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MobileCard key={item.id} item={item} profileMap={profileMap} />
      ))}
    </div>
  );
}

function MobileCard({
  item,
  profileMap,
}: {
  item: QueueItemRecord;
  profileMap: Map<string, ProfileRecord>;
}) {
  const attendantName = getAttendantName(item.started_by, profileMap);
  const executionTime = getExecutionTimeLabel(item.started_at, item.finished_at);
  const statusLabel = STATUS_LABELS[item.status];
  const cardBgClass = getCardBackgroundClass(item.status);
  const borderClass = getCardBorderClass(item.status);

  return (
    <div className={`${borderClass} ${cardBgClass} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-slate-950">
          {EXAM_LABELS[item.exam_type]}
        </p>
        <StatusBadge status={item.status} label={statusLabel} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Atendente
          </p>
          <p className={`text-sm font-semibold mt-1 ${getTextColorClass(attendantName)}`}>
            {attendantName}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Tempo
          </p>
          <p className={`text-sm font-semibold mt-1 ${getTextColorClass(executionTime)}`}>
            {executionTime}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: QueueItemRecord["status"];
  label: string;
}) {
  const styles = {
    aguardando: "border-amber-200 bg-amber-50 text-amber-800",
    chamado: "border-sky-200 bg-sky-50 text-sky-800",
    em_atendimento: "border-emerald-200 bg-emerald-100 text-emerald-900",
    finalizado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {label}
    </span>
  );
}

// Helper functions

function getAttendantName(
  startedById: string | null,
  profileMap: Map<string, ProfileRecord>
): string {
  if (!startedById) return "Pendente";
  const profile = profileMap.get(startedById);
  return profile?.full_name ?? "Pendente";
}

function getExecutionTimeLabel(
  startedAt: string | null,
  finishedAt: string | null
): string {
  if (!startedAt || !finishedAt) return "Pendente";

  const startTime = new Date(startedAt).getTime();
  const endTime = new Date(finishedAt).getTime();
  const durationMs = endTime - startTime;
  const durationMinutes = Math.floor(durationMs / 60000);

  return `${durationMinutes} min`;
}

function getCardBorderClass(status: QueueItemRecord["status"]): string {
  const styles = {
    aguardando: "border-amber-200",
    chamado: "border-sky-200",
    em_atendimento: "border-emerald-200",
    finalizado: "border-emerald-200",
    cancelado: "border-rose-200",
  } as const;
  return `border ${styles[status]}`;
}

function getCardBackgroundClass(status: QueueItemRecord["status"]): string {
  const styles = {
    aguardando: "bg-amber-50/40",
    chamado: "bg-sky-50/40",
    em_atendimento: "bg-emerald-50/40",
    finalizado: "bg-emerald-50/40",
    cancelado: "bg-rose-50/40",
  } as const;
  return styles[status];
}

function getTextColorClass(value: string): string {
  return value === "Pendente" ? "text-slate-500" : "text-slate-950";
}
```

#### Step 2: Verify component file is created

Run: `ls -la src/components/attendance-exams-table.tsx`

Expected: File exists and is readable.

---

### Task 2: Update Admin Dashboard to Use New Component

**Files:**
- Modify: `src/components/admin-dashboard.tsx` (around line 1803)

#### Step 1: Update imports in admin-dashboard.tsx

Find line 8 where imports are:

Current:
```typescript
import { AttendanceTimeline } from "@/components/attendance-timeline";
```

Change to:
```typescript
import { AttendanceExamsTable } from "@/components/attendance-exams-table";
import { AttendanceTimeline } from "@/components/attendance-timeline";
```

(Keep both imports — `AttendanceTimeline` is used elsewhere)

#### Step 2: Replace AttendanceTimeline usage in SearchResultCard

Find the `SearchResultCard` function (around line 1750-1810). Locate line 1803:

Current code:
```typescript
{orderedItems.length ? (
  <AttendanceTimeline items={orderedItems} title="Exames vinculados" />
) : (
  <p className="text-sm text-slate-600">Sem exames vinculados neste atendimento.</p>
)}
```

Replace with:
```typescript
{orderedItems.length ? (
  <AttendanceExamsTable items={orderedItems} profileMap={profileMap} />
) : (
  <p className="text-sm text-slate-600">Sem exames vinculados neste atendimento.</p>
)}
```

#### Step 3: Verify syntax is correct

Run: `npm run type-check`

Expected: No TypeScript errors in `admin-dashboard.tsx`

#### Step 4: Commit changes

```bash
git add src/components/attendance-exams-table.tsx src/components/admin-dashboard.tsx
git commit -m "feat: add AttendanceExamsTable component for admin patient details

- Create new responsive component for displaying exam details with attendant and execution time
- Support desktop (table) and mobile (cards) layouts
- Resolve attendant names via profileMap
- Calculate execution time in minutes from queue item timestamps
- Replace AttendanceTimeline in admin dashboard patient details modal
- Show 'Pendente' for unavailable data"
```

---

### Task 3: Test Component in Admin Dashboard

**Test Environment:** Local development

#### Step 1: Start development server

Run: `npm run dev`

Expected: Server starts on `http://localhost:3000`

#### Step 2: Login as admin

1. Navigate to `http://localhost:3000/login`
2. Login with admin credentials
3. Verify you're redirected to `/admin`

#### Step 3: Navigate to search tab

1. In admin dashboard, click on "Busca" tab
2. You should see search interface for patients

#### Step 4: Search for a patient with completed exams

1. Use patient name or registration number
2. Find a patient with multiple exams, some completed, some pending
3. Click "Ver detalhes" to expand

#### Step 5: Verify table renders on desktop

Expected output (desktop/tablet view):
- Table with 4 columns: Exame | Status | Atendente | Tempo
- Each row shows exam data
- Completed exams show attendant name and time (e.g., "12 min")
- Pending exams show "Pendente" in attendant/time columns
- Status badges with correct colors (emerald for finished, amber for waiting, etc.)

#### Step 6: Test mobile view

1. Open browser DevTools (F12)
2. Toggle device toolbar (mobile view)
3. Reduce viewport to <768px width

Expected output (mobile view):
- Cards replace table
- Each card shows: Exam name + Status badge at top
- Grid 2x2 with Atendente and Tempo below
- Same data as desktop table

#### Step 7: Test edge cases

**Case 1: Pacient with no exams**
- Search for patient with no exams
- Expand details
- Expected: No table/cards displayed, default message shown

**Case 2: Exam without attendant assigned (started_by is null)**
- Expand patient with such exam
- Expected: "Pendente" shown in Atendente column

**Case 3: Exam started but not finished**
- Expand patient with in-progress exam
- Expected: Attendant name shown, "Pendente" in Tempo column

**Case 4: Exam with execution time**
- Expand patient with completed exam
- Expected: Time formatted as "X min" (e.g., "12 min")

#### Step 8: Check for console errors

1. Open browser DevTools Console (F12 → Console tab)
2. Perform actions above
3. Expected: No errors or warnings related to component

#### Step 9: Responsive breakpoint test

1. Slowly resize browser from 1200px → 600px
2. Around 768px, table should convert to cards
3. Expected: Smooth transition, no layout shifts or errors

---

### Task 4: Verify No Breaking Changes

**Scope:** Ensure other parts of app still work

#### Step 1: Check AttendanceTimeline still exists

Verify component is not deleted and still used elsewhere:

Run: `grep -r "AttendanceTimeline" src/ --include="*.tsx"`

Expected output shows:
- `attendance-timeline.tsx` definition
- `admin-dashboard.tsx` import (still there)
- Any other uses in codebase

#### Step 2: Test reception page

1. Navigate to `/recepcao`
2. Create a new patient and add exams
3. Expected: Page works normally (uses AttendanceTimeline elsewhere, not affected)

#### Step 3: Test attendance page

1. Navigate to `/atendimento`
2. Click on a room with active exams
3. Expected: Page works normally

#### Step 4: Run type checking

Run: `npm run type-check`

Expected: All TypeScript checks pass, no errors

---

### Task 5: Clean Up Temporary Files

**Files:**
- Delete: `brainstorm-layout-options.html`
- Delete: `design-preview.html`
- Delete: `CODEX_PROMPT.md`

#### Step 1: Remove temporary files

Run: `rm brainstorm-layout-options.html design-preview.html CODEX_PROMPT.md`

#### Step 2: Commit cleanup

```bash
git add -A
git commit -m "chore: remove temporary brainstorm and prompt files"
```

---

## Testing Checklist

- [ ] Component renders table on desktop (≥768px)
- [ ] Component renders cards on mobile (<768px)
- [ ] Attendant name resolves correctly via profileMap
- [ ] Execution time calculates and formats correctly in minutes
- [ ] "Pendente" shows for missing data
- [ ] Status badges display with correct colors
- [ ] TypeScript type checking passes
- [ ] No console errors or warnings
- [ ] Other pages (recepcao, atendimento) still work
- [ ] Responsive breakpoint transition is smooth
- [ ] Edge cases handled (no exams, no attendant, in-progress exams)

---

## Summary

This plan implements a responsive component to display exam details in the admin patient modal. The component:

1. Replaces `AttendanceTimeline` in the admin search modal
2. Shows a data-rich table on desktop with: Exame, Status, Atendente, Tempo
3. Adapts to cards on mobile for better UX
4. Resolves attendant names and calculates execution times
5. Displays "Pendente" for incomplete/unavailable data
6. Uses consistent styling with the existing project palette
7. Requires minimal changes to existing code (1 file modified, 1 new file)

Total files modified: 2
Total files created: 1
Estimated implementation time: 30-45 minutes
