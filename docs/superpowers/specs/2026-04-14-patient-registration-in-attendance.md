---
name: Add patient registration number to attendance screen
description: Display patient_registration_number in all queue sections of the attendance room view
type: specification
---

# Add Patient Registration Number to Attendance Screen

## Overview
The patient registration number (`patient_registration_number`) is currently displayed in reception and management dashboards but is missing from the attendance (atendimento) screen. This spec adds the registration number to all sections of the room queue board, using the same visual pattern as reception for consistency.

## Motivation
- Operationally, staff in the attendance room need quick access to patient identification numbers
- The registration number is already available in the data via `QueueItemWithAttendance`
- Reception and management dashboards already display it in a consistent format
- This creates visual and functional consistency across the application

## Scope
Add `patient_registration_number` display to all 3 patient sections in `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx`:
1. Main queue cards (visibleItems)
2. Pending return section (returnPendingItems)
3. Canceled/history section (canceledItems)

## Design

### Visual Format
- **Text**: "Cadastro {number}"
- **Color**: `text-cyan-800` (matches reception)
- **Size**: `text-sm font-medium` (matches reception)
- **Spacing**: `mt-2` for main cards, `mt-1` for compact sections
- **Conditional rendering**: Only display if `patient_registration_number` is present

### Data Precedence
```
Use: item.attendance?.patient_registration_number || item.patient_registration_number
```
Prioritize attendance record, fall back to queue item record.

### Implementation Locations

#### 1. Main Queue Cards (lines ~365-526)
**Location**: After patient observations, in the info section (line ~399)

```tsx
{item.attendance?.patient_registration_number || item.patient_registration_number ? (
  <p className="mt-2 text-sm font-medium text-cyan-800">
    Cadastro {item.attendance?.patient_registration_number || item.patient_registration_number}
  </p>
) : null}
```

#### 2. Pending Returns Section (lines ~551-595)
**Location**: After patient name/badges row, before notes (after line ~570)

```tsx
{item.attendance?.patient_registration_number || item.patient_registration_number ? (
  <p className="mt-1 text-sm font-medium text-cyan-800">
    Cadastro {item.attendance?.patient_registration_number || item.patient_registration_number}
  </p>
) : null}
```

#### 3. Canceled Section (lines ~615-644)
**Location**: After patient name/badges row, before cancellation reason (after line ~628)

```tsx
{item.attendance?.patient_registration_number || item.patient_registration_number ? (
  <p className="mt-1 text-sm font-medium text-cyan-800">
    Cadastro {item.attendance?.patient_registration_number || item.patient_registration_number}
  </p>
) : null}
```

## Data Flow
- Data already available via `QueueItemWithAttendance` (combined at line 96)
- No new API calls or database queries needed
- Realtime updates work automatically via existing subscription mechanism

## Testing
### Test Cases

1. **Patient with registration number**
   - Navigate to room queue board
   - Verify registration number displays in all 3 sections
   - Verify format matches reception exactly

2. **Patient without registration number**
   - Create/select a patient with null registration number
   - Verify the line does NOT display (conditional rendering works)
   - Verify no empty space or layout shift

3. **Realtime update**
   - Edit a patient registration number in admin
   - Verify it updates in real-time on the room queue board

4. **Visual consistency**
   - Compare color, size, spacing with reception dashboard
   - Verify no visual regressions in other sections

## Acceptance Criteria
- ✅ Registration number displays in main queue cards
- ✅ Registration number displays in pending returns section
- ✅ Registration number displays in canceled section
- ✅ Format matches reception ("Cadastro {number}")
- ✅ Color matches reception (text-cyan-800)
- ✅ Only displays when patient_registration_number is present
- ✅ No layout shifts or visual regressions
- ✅ Realtime updates work correctly

## Files Modified
- `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx`

## No Breaking Changes
- No API changes
- No database schema changes
- No type changes
- Backward compatible (renders nothing if data is null)
