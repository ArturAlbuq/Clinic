# Exam Repetitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar automaticamente repetições de exames via trigger no banco e exibi-las como sub-tab "Repetições" dentro de Admin > Relatórios.

**Architecture:** Trigger `AFTER UPDATE ON queue_items` detecta quando um exame é finalizado pela segunda vez (mesmo `attendance_id + exam_type`) e insere automaticamente em `exam_repetitions`. O frontend consome via hook com Supabase browser client e exibe em `RepetitionsTab` como sub-tab de "Indicadores" dentro da aba Relatórios existente.

**Tech Stack:** PostgreSQL triggers, Supabase RLS, Next.js App Router, React hooks, Tailwind CSS, TypeScript.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `supabase/migrations/20260412010000_exam_repetitions.sql` | Criar | Tabela + trigger + RLS |
| `src/lib/database.types.ts` | Modificar | Adicionar `ExamRepetitionRecord` |
| `src/lib/exam-repetitions.ts` | Criar | Hook `useExamRepetitions` + tipos + lógica de agrupamento |
| `src/components/repetitions-tab.tsx` | Criar | Componente `RepetitionsTab` com 3 painéis + filtros |
| `src/components/admin-dashboard.tsx` | Modificar | Sub-tab `ReportSubTab` dentro de `activeTab === "relatorios"` |

---

## Task 1: Migration — tabela, trigger e RLS

**Files:**
- Create: `supabase/migrations/20260412010000_exam_repetitions.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Crie o arquivo `supabase/migrations/20260412010000_exam_repetitions.sql` com o seguinte conteúdo:

```sql
-- tabela exam_repetitions
create table if not exists public.exam_repetitions (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid not null unique references public.queue_items (id) on delete cascade,
  attendance_id uuid not null references public.attendances (id) on delete cascade,
  exam_type public.exam_type not null,
  room_slug text references public.exam_rooms (slug) on update cascade,
  technician_id uuid references public.profiles (id) on delete set null,
  repeated_at timestamptz not null default (now() at time zone 'America/Manaus'),
  repetition_index integer not null check (repetition_index > 0)
);

create index if not exists exam_repetitions_repeated_at_idx
  on public.exam_repetitions (repeated_at desc);

create index if not exists exam_repetitions_exam_type_repeated_at_idx
  on public.exam_repetitions (exam_type, repeated_at desc);

create index if not exists exam_repetitions_technician_repeated_at_idx
  on public.exam_repetitions (technician_id, repeated_at desc);

create index if not exists exam_repetitions_room_slug_repeated_at_idx
  on public.exam_repetitions (room_slug, repeated_at desc);

-- RLS
alter table public.exam_repetitions enable row level security;

create policy "exam_repetitions_select_admin"
on public.exam_repetitions
for select
to authenticated
using (public.current_app_role() = 'admin');

-- trigger
create or replace function public.handle_exam_repetition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_count integer;
begin
  select count(*)
  into prior_count
  from public.queue_items
  where attendance_id = new.attendance_id
    and exam_type = new.exam_type
    and status = 'finalizado'
    and id <> new.id;

  if prior_count >= 1 then
    insert into public.exam_repetitions (
      queue_item_id,
      attendance_id,
      exam_type,
      room_slug,
      technician_id,
      repeated_at,
      repetition_index
    )
    values (
      new.id,
      new.attendance_id,
      new.exam_type,
      new.room_slug,
      new.finished_by,
      now() at time zone 'America/Manaus',
      prior_count
    )
    on conflict (queue_item_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_queue_item_finalized on public.queue_items;
create trigger on_queue_item_finalized
after update on public.queue_items
for each row
when (old.status <> 'finalizado' and new.status = 'finalizado')
execute procedure public.handle_exam_repetition();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260412010000_exam_repetitions.sql
git commit -m "feat: add exam_repetitions table, trigger and RLS"
```

---

## Task 2: Tipo `ExamRepetitionRecord` em `database.types.ts`

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Adicionar o tipo**

Abra `src/lib/database.types.ts`. Logo após o bloco `queue_items` (que termina com `Relationships: []`), adicione o seguinte bloco dentro de `Tables`:

```typescript
      exam_repetitions: {
        Row: {
          id: string;
          queue_item_id: string;
          attendance_id: string;
          exam_type: ExamType;
          room_slug: string | null;
          technician_id: string | null;
          repeated_at: string;
          repetition_index: number;
        };
        Insert: {
          id?: string;
          queue_item_id: string;
          attendance_id: string;
          exam_type: ExamType;
          room_slug?: string | null;
          technician_id?: string | null;
          repeated_at?: string;
          repetition_index: number;
        };
        Update: {
          id?: string;
          queue_item_id?: string;
          attendance_id?: string;
          exam_type?: ExamType;
          room_slug?: string | null;
          technician_id?: string | null;
          repeated_at?: string;
          repetition_index?: number;
        };
        Relationships: [];
      };
```

Depois, adicione o tipo de conveniência no final do arquivo (após os outros tipos como `QueueItemRecord`):

```typescript
export type ExamRepetitionRecord =
  Database["public"]["Tables"]["exam_repetitions"]["Row"];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: add ExamRepetitionRecord type"
```

---

## Task 3: Hook `useExamRepetitions`

**Files:**
- Create: `src/lib/exam-repetitions.ts`

- [ ] **Step 1: Criar o arquivo**

Crie `src/lib/exam-repetitions.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import { CLINIC_TIMEZONE, clinicLocalDateToUtcDate, getClinicDateParts } from "@/lib/date";
import { EXAM_ORDER } from "@/lib/constants";
import type { ExamType } from "@/lib/database.types";
import type { ExamRepetitionRecord } from "@/lib/database.types";

export type ExamRepetitionsFilters = {
  startDate: string; // "YYYY-MM-DD" no fuso America/Manaus
  endDate: string;   // "YYYY-MM-DD" no fuso America/Manaus
  examType?: ExamType | "todos";
  technicianId?: string | "todos";
  roomSlug?: string | "todos";
};

export type ExamRepetitionsByExamType = {
  examType: ExamType;
  total: number;
  pct: number;
};

export type ExamRepetitionsByTechnician = {
  technicianId: string;
  total: number;
  topExamType: ExamType;
};

export type ExamRepetitionsByRoom = {
  roomSlug: string;
  total: number;
  topExamType: ExamType;
};

export type ExamRepetitionsData = {
  rows: ExamRepetitionRecord[];
  byExamType: ExamRepetitionsByExamType[];
  byTechnician: ExamRepetitionsByTechnician[];
  byRoom: ExamRepetitionsByRoom[];
  isLoading: boolean;
  error: string | null;
};

function toUtcRangeStart(dateStr: string): string {
  // "YYYY-MM-DD" em Manaus → início do dia em UTC
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return dateStr;
  const utcDate = clinicLocalDateToUtcDate({
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3]),
    hour: 0,
    minute: 0,
    second: 0,
  });
  return utcDate.toISOString();
}

function toUtcRangeEnd(dateStr: string): string {
  // "YYYY-MM-DD" em Manaus → fim do dia (23:59:59) em UTC
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return dateStr;
  const utcDate = clinicLocalDateToUtcDate({
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3]),
    hour: 23,
    minute: 59,
    second: 59,
  });
  return utcDate.toISOString();
}

function topExamType(rows: ExamRepetitionRecord[]): ExamType {
  const counts = new Map<ExamType, number>();
  for (const row of rows) {
    counts.set(row.exam_type, (counts.get(row.exam_type) ?? 0) + 1);
  }
  let top: ExamType = rows[0]?.exam_type ?? "fotografia";
  let topCount = 0;
  for (const [exam, count] of counts) {
    if (count > topCount) {
      top = exam;
      topCount = count;
    }
  }
  return top;
}

function groupData(rows: ExamRepetitionRecord[]): Pick<ExamRepetitionsData, "byExamType" | "byTechnician" | "byRoom"> {
  const total = rows.length;

  // por tipo de exame
  const examCounts = new Map<ExamType, number>();
  for (const row of rows) {
    examCounts.set(row.exam_type, (examCounts.get(row.exam_type) ?? 0) + 1);
  }
  const byExamType: ExamRepetitionsByExamType[] = EXAM_ORDER
    .filter((exam) => examCounts.has(exam))
    .map((exam) => ({
      examType: exam,
      total: examCounts.get(exam)!,
      pct: total > 0 ? Math.round((examCounts.get(exam)! / total) * 100) : 0,
    }));

  // por técnico
  const techMap = new Map<string, ExamRepetitionRecord[]>();
  for (const row of rows) {
    if (!row.technician_id) continue;
    const list = techMap.get(row.technician_id) ?? [];
    list.push(row);
    techMap.set(row.technician_id, list);
  }
  const byTechnician: ExamRepetitionsByTechnician[] = Array.from(techMap.entries())
    .map(([technicianId, techRows]) => ({
      technicianId,
      total: techRows.length,
      topExamType: topExamType(techRows),
    }))
    .sort((a, b) => b.total - a.total);

  // por sala
  const roomMap = new Map<string, ExamRepetitionRecord[]>();
  for (const row of rows) {
    if (!row.room_slug) continue;
    const list = roomMap.get(row.room_slug) ?? [];
    list.push(row);
    roomMap.set(row.room_slug, list);
  }
  const byRoom: ExamRepetitionsByRoom[] = Array.from(roomMap.entries())
    .map(([roomSlug, roomRows]) => ({
      roomSlug,
      total: roomRows.length,
      topExamType: topExamType(roomRows),
    }))
    .sort((a, b) => b.total - a.total);

  return { byExamType, byTechnician, byRoom };
}

export function useExamRepetitions(filters: ExamRepetitionsFilters): ExamRepetitionsData {
  const [rows, setRows] = useState<ExamRepetitionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function fetch() {
      const supabase = createBrowserClient();

      let query = supabase
        .from("exam_repetitions")
        .select("*")
        .gte("repeated_at", toUtcRangeStart(filters.startDate))
        .lte("repeated_at", toUtcRangeEnd(filters.endDate))
        .order("repeated_at", { ascending: false });

      if (filters.examType && filters.examType !== "todos") {
        query = query.eq("exam_type", filters.examType);
      }
      if (filters.technicianId && filters.technicianId !== "todos") {
        query = query.eq("technician_id", filters.technicianId);
      }
      if (filters.roomSlug && filters.roomSlug !== "todos") {
        query = query.eq("room_slug", filters.roomSlug);
      }

      const { data, error: supabaseError } = await query;

      if (cancelled) return;

      if (supabaseError) {
        setError(supabaseError.message);
        setIsLoading(false);
        return;
      }

      setRows((data ?? []) as ExamRepetitionRecord[]);
      setIsLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, [filters.startDate, filters.endDate, filters.examType, filters.technicianId, filters.roomSlug]);

  const grouped = groupData(rows);

  return {
    rows,
    ...grouped,
    isLoading,
    error,
  };
}

export function getDefaultRepetitionsDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  const year = get("year");
  const month = get("month");

  // último dia do mês
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const pad = (n: string | number) => String(n).padStart(2, "0");

  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${pad(lastDay)}`,
  };
}
```

- [ ] **Step 2: Verificar que o Supabase browser client segue o padrão do projeto**

Confirme que `src/lib/supabase/browser.ts` exporta uma função `createBrowserClient` (não um singleton):

```bash
grep -n "export" "src/lib/supabase/browser.ts"
```

Se exportar um singleton (ex: `export const supabase = ...`), ajuste o import no hook para usar esse padrão.

- [ ] **Step 3: Commit**

```bash
git add src/lib/exam-repetitions.ts src/lib/database.types.ts
git commit -m "feat: add useExamRepetitions hook and ExamRepetitionRecord type"
```

---

## Task 4: Componente `RepetitionsTab`

**Files:**
- Create: `src/components/repetitions-tab.tsx`

- [ ] **Step 1: Criar o componente**

Crie `src/components/repetitions-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import {
  EXAM_LABELS,
  ROOM_BY_SLUG,
  type RoomSlug,
} from "@/lib/constants";
import type { ExamType, ExamRoomRecord, ProfileRecord } from "@/lib/database.types";
import { formatDateInputValue } from "@/lib/date";
import {
  getDefaultRepetitionsDateRange,
  useExamRepetitions,
  type ExamRepetitionsFilters,
} from "@/lib/exam-repetitions";

type Option = readonly [label: string, value: string];

type Props = {
  profiles: ProfileRecord[];
  rooms: ExamRoomRecord[];
};

export function RepetitionsTab({ profiles, rooms }: Props) {
  const defaultRange = getDefaultRepetitionsDateRange();

  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [examType, setExamType] = useState<ExamType | "todos">("todos");
  const [technicianId, setTechnicianId] = useState<string | "todos">("todos");

  const filters: ExamRepetitionsFilters = { startDate, endDate, examType, technicianId };
  const { byExamType, byTechnician, byRoom, isLoading, error } = useExamRepetitions(filters);

  const technicianOptions: readonly Option[] = [
    ["Todos os técnicos", "todos"] as const,
    ...profiles
      .filter((p) => p.role === "atendimento")
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))
      .map((p) => [p.full_name, p.id] as const),
  ];

  const examOptions: readonly Option[] = [
    ["Todos os exames", "todos"] as const,
    ...Object.entries(EXAM_LABELS).map(([value, label]) => [label, value] as const),
  ];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const roomMap = new Map(rooms.map((r) => [r.slug, r]));

  const isEmpty = !isLoading && !error && byExamType.length === 0;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">De</span>
            <input
              type="date"
              className="bg-transparent text-sm font-medium text-slate-900 outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Até</span>
            <input
              type="date"
              className="bg-transparent text-sm font-medium text-slate-900 outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <SelectField label="Técnico" value={technicianId} onChange={(v) => setTechnicianId(v)} options={technicianOptions} />
          <SelectField label="Exame" value={examType} onChange={(v) => setExamType(v as ExamType | "todos")} options={examOptions} />
        </div>
      </section>

      {/* Estado de erro */}
      {error ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-sm text-red-600">{error}</p>
        </section>
      ) : isLoading ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-sm text-slate-500">Carregando...</p>
        </section>
      ) : isEmpty ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <EmptyState message="Nenhuma repetição registrada no período." />
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-3">
          {/* Painel 1: Por tipo de exame */}
          <div className="app-panel rounded-[30px] px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Por tipo de exame</p>
            <div className="mt-6 space-y-3">
              {byExamType.map((entry) => (
                <div key={entry.examType} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                  <p className="text-lg font-semibold text-slate-950">{EXAM_LABELS[entry.examType]}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {entry.total} repetição{entry.total !== 1 ? "ões" : ""} · {entry.pct}% do total
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Painel 2: Por técnico */}
          <div className="app-panel rounded-[30px] px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Por técnico</p>
            <div className="mt-6 space-y-3">
              {byTechnician.length === 0 ? (
                <p className="text-sm text-slate-400">Sem dados de técnico.</p>
              ) : byTechnician.map((entry) => {
                const profile = profileMap.get(entry.technicianId);
                return (
                  <div key={entry.technicianId} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-lg font-semibold text-slate-950">{profile?.full_name ?? "Desconhecido"}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {entry.total} repetição{entry.total !== 1 ? "ões" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Exame mais repetido: {EXAM_LABELS[entry.topExamType]}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Painel 3: Por sala */}
          <div className="app-panel rounded-[30px] px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Por sala</p>
            <div className="mt-6 space-y-3">
              {byRoom.length === 0 ? (
                <p className="text-sm text-slate-400">Sem dados de sala.</p>
              ) : byRoom.map((entry) => {
                const room = roomMap.get(entry.roomSlug);
                const roomName = room?.name ?? (ROOM_BY_SLUG[entry.roomSlug as RoomSlug]?.roomName ?? entry.roomSlug);
                return (
                  <div key={entry.roomSlug} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-lg font-semibold text-slate-950">{roomName}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {entry.total} repetição{entry.total !== 1 ? "ões" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Exame mais repetido: {EXAM_LABELS[entry.topExamType]}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  value: string;
}) {
  return (
    <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        className="bg-transparent text-sm font-medium text-slate-900 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Verificar que `EmptyState` aceita `message` como prop**

```bash
grep -n "message\|props\|Props" src/components/empty-state.tsx | head -20
```

Se a prop se chamar diferente (ex: `label`, `text`), ajuste no componente `RepetitionsTab`.

- [ ] **Step 3: Commit**

```bash
git add src/components/repetitions-tab.tsx
git commit -m "feat: add RepetitionsTab component"
```

---

## Task 5: Integração em `admin-dashboard.tsx`

**Files:**
- Modify: `src/components/admin-dashboard.tsx`

- [ ] **Step 1: Adicionar import do `RepetitionsTab`**

No topo de `src/components/admin-dashboard.tsx`, após os imports existentes, adicione:

```typescript
import { RepetitionsTab } from "@/components/repetitions-tab";
```

- [ ] **Step 2: Adicionar tipo `ReportSubTab` e estado**

Após a linha `type AdminTab = "operacao" | "busca" | "relatorios" | "exclusoes";` (linha ~76), adicione:

```typescript
type ReportSubTab = "indicadores" | "repeticoes";
```

Após o `useState` de `activeTab` no corpo do componente (linha ~98), adicione:

```typescript
const [reportSubTab, setReportSubTab] = useState<ReportSubTab>("indicadores");
```

- [ ] **Step 3: Adicionar sub-navegação no bloco de relatórios**

Localize o bloco `activeTab === "relatorios"` em `admin-dashboard.tsx`. Ele começa com:

```tsx
) : activeTab === "relatorios" ? (
  <section className="space-y-4">
    <section className="app-panel rounded-[30px] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatorios</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">Indicadores do periodo</h3>
```

Substitua o bloco inteiro `activeTab === "relatorios"` para adicionar sub-tabs. O novo bloco começa assim:

```tsx
) : activeTab === "relatorios" ? (
  <section className="space-y-4">
    <section className="app-panel rounded-[30px] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatorios</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
            {reportSubTab === "indicadores" ? "Indicadores do periodo" : "Repeticoes de exames"}
          </h3>
          {reportSubTab === "indicadores" && (
            <p className="mt-2 text-sm text-slate-600">Recorte atual: {periodLabel}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <TabButton active={reportSubTab === "indicadores"} label="Indicadores" onClick={() => setReportSubTab("indicadores")} />
            <TabButton active={reportSubTab === "repeticoes"} label="Repeticoes" onClick={() => setReportSubTab("repeticoes")} />
          </div>
          {reportSubTab === "indicadores" && (
            <>
              <SelectField label="Sala" value={reportRoomFilter} onChange={(value) => setReportRoomFilter(value as RoomSlug | "todas")} options={roomOptions} />
              <label className="flex min-w-[220px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Paciente</span>
                <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="search" value={reportPatientSearch} onChange={(event) => setReportPatientSearch(event.target.value)} placeholder="Buscar por nome" />
              </label>
              <a href={reportPdfUrl} target="_blank" rel="noreferrer" className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50">Baixar PDF</a>
            </>
          )}
        </div>
      </div>
    </section>

    {reportSubTab === "indicadores" ? (
      <>
        {/* CONTEÚDO EXISTENTE DE RELATÓRIOS — não mover, só envolver no fragmento */}
```

Depois do conteúdo existente dos indicadores (o que já estava no bloco), feche com:

```tsx
      </>
    ) : (
      <RepetitionsTab profiles={profiles} rooms={rooms} />
    )}
  </section>
```

**Importante:** O objetivo é envolver todo o conteúdo atual dos indicadores em `{reportSubTab === "indicadores" ? (<>...conteúdo atual...</>) : (<RepetitionsTab ... />)}`. Não apague nem mova nenhuma linha do conteúdo de indicadores.

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Corrija quaisquer erros de tipo antes de continuar.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin-dashboard.tsx
git commit -m "feat: integrate RepetitionsTab as sub-tab in Relatorios"
```

---

## Task 6: Verificação final

- [ ] **Step 1: Checar o padrão de export do browser client**

```bash
cat src/lib/supabase/browser.ts
```

Confirme que `useExamRepetitions` usa o mesmo padrão de criação do client que os outros hooks do projeto (ex: `useRealtimeClinicData`).

- [ ] **Step 2: Checar o padrão de `EmptyState`**

```bash
cat src/components/empty-state.tsx
```

Confirme que a prop passada em `RepetitionsTab` (`message`) está correta.

- [ ] **Step 3: Build**

```bash
npx next build 2>&1 | tail -20
```

Expected: sem erros de build.

- [ ] **Step 4: Commit final se necessário**

Se houve ajustes nas steps anteriores:

```bash
git add -p
git commit -m "fix: adjust exam-repetitions integration to match project patterns"
```

---

## Como testar manualmente

1. Abrir o painel Admin > aba Relatórios
2. Verificar que aparecem dois botões de sub-tab: "Indicadores" e "Repeticoes"
3. Clicar em "Repeticoes" — deve exibir filtros + três painéis (ou `EmptyState` se não houver dados)
4. Para testar o trigger: no banco (via Supabase Studio), criar dois `queue_items` com mesmo `attendance_id + exam_type`, finalizar ambos — verificar linha em `exam_repetitions`
5. Finalizar o mesmo `queue_item_id` mais de uma vez via trigger manual — verificar que não duplica (idempotência)
6. Testar RLS: via cliente `atendimento`, tentar `SELECT * FROM exam_repetitions` — deve retornar `[]` sem dados
