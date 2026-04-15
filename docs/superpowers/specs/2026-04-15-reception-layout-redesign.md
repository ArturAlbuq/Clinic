# Reception Dashboard Layout Redesign

**Date:** 2026-04-15  
**Status:** Design Approved  
**Scope:** Reception attendance list compaction with expandable details

## Overview

The reception dashboard currently displays attendance records in large cards (~300px height), limiting visibility to 2-3 records per screen. This redesign compacts the attendance list to ~60px per card while keeping the "Cadastro rápido por exame" (quick registration form) untouched, enabling receptionist to see 10-12 records at once and access details via expansion.

## User Goals

- **Primary role:** Receptionist doing quick patient registration
- **Primary task:** Register new patients while viewing current queue status
- **Current friction:** Scroll-heavy to see queue context
- **Target:** See most of today's queue at a glance, expand only when needed for details

## Design Goals

1. Keep the "Cadastro rápido por exame" form fully visible and unchanged
2. Compact the attendance list from ~300px to ~60px per card
3. Show essential information per record: name, priority, status, registration number, entry time, exam progress
4. Enable expansion to see full details (exams timeline, pending returns, cancellation reasons)
5. Maintain all existing functionality and filters

## Layout Structure

### Layout Sections (unchanged)

```
┌─ Section 1: Quick Registration Form ──────────────────────┐
│  - Patient name, registration number, exams selector      │
│  - Priority, notes, submit button                         │
│  - NO CHANGES to this section                             │
└──────────────────────────────────────────────────────────┘

┌─ Section 2: Operational List (REDESIGNED) ───────────────┐
│  [List filters: Todos | Aguardando | Em andamento | ...]  │
│  ┌─ Compact Card (60px) ─────────────────────────────────┐│
│  │ Maria Aparecida | P1 +60 | Aguardando                 ││
│  │ Cad. #548921 • Entrada 09:15 • 2/2 exames      [⋯]    ││
│  └────────────────────────────────────────────────────────┘│
│  ┌─ Compact Card (60px) ─────────────────────────────────┐│
│  │ João Silva | Normal | Em andamento                     ││
│  │ Cad. #234567 • Entrada 09:32 • 1/3 exames      [⋯]    ││
│  └────────────────────────────────────────────────────────┘│
│  [... more cards, ~10-12 visible per screen ...]         │
└──────────────────────────────────────────────────────────┘
```

## Compact Card Specification

### Always Visible (60px height)

**Top line:**
- Patient name (14px, semibold)
- Priority badge (11px, uppercase): P1 +60 | P2 +80 | Normal
- Status badge (11px, uppercase): Aguardando | Em andamento | Finalizado | Cancelado

**Bottom line:**
- Registration number: "Cad. #548921" (12px, cyan color)
- Entry time: "Entrada 09:15" (12px)
- Exam progress: "2/2 exames" (12px)
- Expand button: "⋯" (right-aligned)

### Colors & Styling

**Priority badges:**
- P1 (+60): Yellow background (#fef08a), dark text
- P2 (+80): Pink background (#ffe4e6), dark text
- Normal: Gray background (#e5e7eb), dark text

**Status badges:**
- Aguardando: Amber (#fef3c7)
- Em andamento: Cyan (#cffafe)
- Finalizado: Emerald (#dcfce7)
- Cancelado: Rose (to be styled)

**Card styling:**
- Border: 1px #e2e8f0
- Border-radius: 16px
- Padding: 14px
- Margin-bottom: 10px
- Hover state: border → #0891b2, background → #f0fdf4
- Expand button: 28x28px, hover state → cyan background

### Expanded State (on click "⋯")

When a card is expanded, it shows:
- Full attendance info below the compact line
- Timeline of queue items (exams)
- Action cards (return pending, cancellation reason, etc.)
- Full notes text

This becomes a modal or accordion expansion — **implementation detail TBD during plan phase**.

## Data Displayed per Card

| Field | Size | Color | Example |
|-------|------|-------|---------|
| Patient name | 14px, semibold | #0f172a | Maria Aparecida |
| Priority badge | 11px, uppercase | Contextual | P1 +60 |
| Status badge | 11px, uppercase | Contextual | Aguardando |
| Registration number | 12px, semibold | #0891b2 | Cad. #548921 |
| Entry time | 12px | #64748b | Entrada 09:15 |
| Exam progress | 12px | #64748b | 2/2 exames |
| Expand button | 18px, icon | #64748b on hover #fff | ⋯ |

## Expected Benefits

| Metric | Before | After |
|--------|--------|-------|
| Cards per screen (1080p) | 2-3 | 10-12 |
| Scroll distance for daily queue | High | Low |
| Time to find patient in queue | ~10s | ~3s |
| Space for forms above list | ~400px | ~100px saved |
| Visual clutter | High | Reduced |

## Scope: What Changes, What Stays the Same

### Changes
- Attendance card layout: large → compact
- Card height: ~300px → ~60px
- Expansion mechanism: inline → TBD (modal/accordion)
- Visual hierarchy: secondary info → hidden until expanded

### No Changes
- Quick registration form (entire section untouched)
- Filter buttons (location, functionality unchanged)
- Realtime status indicator
- Attendance overall badge logic
- Queue item status logic
- All API endpoints and data structures
- Navigation and routing
- Color palette (minor badge color refinements only)

## Implementation Plan (High-Level)

1. **Component structure:** Extract `AttendanceCard` (compact) and `AttendanceCardExpanded` components
2. **State management:** Track expanded card ID in parent component state
3. **Styling:** Refactor Tailwind classes for compact layout
4. **Expansion UI:** Decide between modal or inline accordion (plan phase)
5. **Testing:** Verify realtime updates, filter interactions, expand/collapse behavior
6. **Visual regression:** Compare before/after on actual data with 20+ records

## Open Questions for Plan Phase

1. **Expansion UI:** Should expansion be inline (accordion-style below card) or modal popup?
2. **Multi-expand:** Can user expand multiple cards at once, or only one?
3. **Keyboard navigation:** Should Tab/Enter open expansion?
4. **Mobile behavior:** How does compact layout adapt to tablet/mobile?
5. **Empty notes handling:** Show "Sem observação" or just omit?
6. **Canceled cards styling:** Distinct visual treatment?

## Definition of Done

- [ ] Compact card displays all 6 fields correctly
- [ ] Expand mechanism works (no data loss)
- [ ] Realtime updates trigger card re-renders without breaking state
- [ ] Filters work correctly with new layout
- [ ] 10+ cards fit per screen without overflow
- [ ] Mobile responsive (tablet-friendly)
- [ ] Existing functionality preserved (cancel, return pending, etc.)
- [ ] Visual tested with production data
- [ ] No console errors or performance regressions

## Files to Modify

- `src/app/(app)/recepcao/reception-dashboard.tsx` — main component refactor
- `src/components/attendance-card.tsx` — new compact card component (create or refactor)
- `src/components/attendance-card-expanded.tsx` — expanded details component (create if needed)
- `src/app/(app)/recepcao/page.tsx` — layout structure if needed
- Tailwind config — if new responsive breakpoints needed
