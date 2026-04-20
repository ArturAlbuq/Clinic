# Pós-Atendimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `/pos-atendimento` module — an operational panel to view, filter, and advance pipeline items opened after clinic attendance.

**Architecture:** Server component page fetches initial data and passes it to a client component that manages realtime subscriptions, local filter state, and modal interactions. Follows the exact same pattern as `/admin` (server fetch → client dashboard). Two modals live in the same directory as the page for locality.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase (SSR + browser client), Supabase Realtime (postgres_changes on `pipeline_items`)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/(app)/pos-atendimento/page.tsx` | Create | Server component: auth check, initial data fetch |
| `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx` | Create | Client component: list, filters, realtime, modals |
| `src/app/(app)/pos-atendimento/advance-status-modal.tsx` | Create | Modal: show next valid statuses, submit new status |
| `src/app/(app)/pos-atendimento/history-modal.tsx` | Create | Modal: show pipeline_events for a pipeline item |
| `src/lib/pipeline-constants.ts` | Create | Labels, status progression maps, type badge colors |
| `src/lib/constants.ts` | Modify | Add `{ href: "/pos-atendimento", label: "Pós-atendimento" }` to recepcao, atendimento, admin entries in `ROLE_NAVIGATION` |

---

## Task 1: Pipeline constants

**Files:**
- Create: `src/lib/pipeline-constants.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { PipelineStatus, PipelineType } from "@/lib/database.types";

export const PIPELINE_TYPE_LABELS: Record<PipelineType, string> = {
  laudo: "Laudo",
  cefalometria: "Cefalometria",
  fotografia: "Fotografia",
  escaneamento: "Escaneamento",
};

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  nao_iniciado: "Não iniciado",
  pendente_envio: "Pendente envio",
  enviado_radiologista: "Enviado ao radiologista",
  recebido_radiologista: "Recebido pelo radiologista",
  devolvido_radiologista: "Devolvido pelo radiologista",
  recebido_corrigido: "Recebido corrigido",
  revisado_liberado: "Revisado e liberado",
  em_ajuste: "Em ajuste",
  publicado_idoc: "Publicado no iDoc",
  disponivel_impressao: "Disponível para impressão",
  enviado_impressao: "Enviado para impressão",
  recebido_laboratorio: "Recebido pelo laboratório",
  enviado_laboratorio_externo: "Enviado ao laboratório externo",
  retornado_laboratorio: "Retornado do laboratório",
  publicado_finalizado: "Publicado / Finalizado",
};

// Returns the badge color classes for a given status
export function getPipelineStatusBadgeClass(status: PipelineStatus): string {
  const map: Partial<Record<PipelineStatus, string>> = {
    nao_iniciado: "bg-slate-100 text-slate-600",
    pendente_envio: "bg-yellow-100 text-yellow-700",
    enviado_radiologista: "bg-blue-100 text-blue-700",
    recebido_radiologista: "bg-blue-200 text-blue-800",
    devolvido_radiologista: "bg-orange-100 text-orange-700",
    recebido_corrigido: "bg-orange-200 text-orange-800",
    revisado_liberado: "bg-green-100 text-green-700",
    em_ajuste: "bg-purple-100 text-purple-700",
    publicado_idoc: "bg-teal-100 text-teal-700",
    disponivel_impressao: "bg-teal-200 text-teal-800",
    enviado_impressao: "bg-indigo-100 text-indigo-700",
    recebido_laboratorio: "bg-indigo-200 text-indigo-800",
    enviado_laboratorio_externo: "bg-violet-100 text-violet-700",
    retornado_laboratorio: "bg-violet-200 text-violet-800",
    publicado_finalizado: "bg-green-200 text-green-800",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

export const PIPELINE_TYPE_BADGE_CLASS: Record<PipelineType, string> = {
  laudo: "bg-blue-50 text-blue-700",
  cefalometria: "bg-violet-50 text-violet-700",
  fotografia: "bg-pink-50 text-pink-700",
  escaneamento: "bg-emerald-50 text-emerald-700",
};

// Returns the valid next statuses for a pipeline item given its type, current
// status, and metadata flags.
export function getNextStatuses(
  type: PipelineType,
  currentStatus: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  if (type === "laudo" || type === "cefalometria") {
    return getLaudoNextStatuses(currentStatus);
  }
  if (type === "fotografia") {
    return getFotografiaNextStatuses(currentStatus, metadata);
  }
  if (type === "escaneamento") {
    return getEscaneamentoNextStatuses(currentStatus, metadata);
  }
  return [];
}

function getLaudoNextStatuses(current: PipelineStatus): PipelineStatus[] {
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["pendente_envio"],
    pendente_envio: ["enviado_radiologista"],
    enviado_radiologista: ["recebido_radiologista"],
    recebido_radiologista: ["revisado_liberado", "devolvido_radiologista"],
    devolvido_radiologista: ["recebido_corrigido"],
    recebido_corrigido: ["revisado_liberado"],
    revisado_liberado: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}

function getFotografiaNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const comImpressao = Boolean(metadata.com_impressao);
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["em_ajuste"],
    em_ajuste: ["publicado_idoc"],
    publicado_idoc: comImpressao ? ["disponivel_impressao"] : ["publicado_finalizado"],
    disponivel_impressao: ["enviado_impressao"],
    enviado_impressao: ["recebido_laboratorio"],
    recebido_laboratorio: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}

function getEscaneamentoNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const laboratorioExterno = Boolean(metadata.laboratorio_externo);
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["em_ajuste"],
    em_ajuste: laboratorioExterno
      ? ["enviado_laboratorio_externo"]
      : ["publicado_finalizado"],
    enviado_laboratorio_externo: ["retornado_laboratorio"],
    retornado_laboratorio: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pipeline-constants.ts
git commit -m "feat: add pipeline-constants with labels, badge colors, and status progression maps"
```

---

## Task 2: Server page — initial data fetch

**Files:**
- Create: `src/app/(app)/pos-atendimento/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PosAtendimentoPage() {
  const { supabase, profile } = await requireRole([
    "recepcao",
    "atendimento",
    "admin",
  ]);

  const { data: pipelineItems } = await supabase
    .from("pipeline_items")
    .select(
      `
      id,
      attendance_id,
      queue_item_id,
      pipeline_type,
      status,
      responsible_id,
      sla_deadline,
      metadata,
      opened_at,
      updated_at,
      attendances ( patient_name ),
      queue_items ( exam_type ),
      profiles:responsible_id ( full_name )
      `
    )
    .neq("status", "publicado_finalizado")
    .order("opened_at", { ascending: true });

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name", { ascending: true });

  const { PosAtendimentoDashboard } = await import(
    "./pos-atendimento-dashboard"
  );

  return (
    <PosAtendimentoDashboard
      initialItems={pipelineItems ?? []}
      profiles={allProfiles ?? []}
      currentProfile={profile}
    />
  );
}
```

> Note: `requireRole` here accepts an array — check how the existing `requireRole` signature works. If it only accepts a single role, call `requireAuthenticatedUser()` and check role manually, or pass `"admin"` and add a secondary client-side guard. Look at `src/lib/auth.ts` before committing this step.

- [ ] **Step 2: Check `requireRole` signature in `src/lib/auth.ts`**

Open `src/lib/auth.ts` and verify whether `requireRole` accepts an array or a single role. If it accepts only one role, replace the call with:

```typescript
import { requireAuthenticatedUser } from "@/lib/auth";

const { supabase, profile } = await requireAuthenticatedUser();
const allowedRoles = ["recepcao", "atendimento", "admin"] as const;
if (!allowedRoles.includes(profile.role as typeof allowedRoles[number])) {
  redirect("/");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/pos-atendimento/page.tsx
git commit -m "feat: add /pos-atendimento server page with initial pipeline_items fetch"
```

---

## Task 3: History modal

**Files:**
- Create: `src/app/(app)/pos-atendimento/history-modal.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { formatDateTime } from "@/lib/date";
import { PIPELINE_STATUS_LABELS } from "@/lib/pipeline-constants";
import type { PipelineStatus } from "@/lib/database.types";

type PipelineEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  profiles: { full_name: string } | null;
};

type HistoryModalProps = {
  patientName: string;
  events: PipelineEvent[];
  onClose: () => void;
};

export function HistoryModal({
  patientName,
  events,
  onClose,
}: HistoryModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Histórico — {patientName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Nenhum evento registrado.
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 shrink-0 text-xs text-slate-400">
                  {formatDateTime(ev.occurred_at)}
                </span>
                <div>
                  <span className="font-medium text-slate-700">
                    {ev.previous_status
                      ? `${PIPELINE_STATUS_LABELS[ev.previous_status]} → `
                      : ""}
                    {PIPELINE_STATUS_LABELS[ev.new_status]}
                  </span>
                  {ev.profiles?.full_name && (
                    <span className="ml-2 text-slate-400">
                      por {ev.profiles.full_name}
                    </span>
                  )}
                  {ev.notes && (
                    <p className="mt-0.5 text-slate-500">{ev.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/pos-atendimento/history-modal.tsx
git commit -m "feat: add HistoryModal for pipeline_events display"
```

---

## Task 4: Advance-status modal

**Files:**
- Create: `src/app/(app)/pos-atendimento/advance-status-modal.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import {
  PIPELINE_STATUS_LABELS,
  getNextStatuses,
} from "@/lib/pipeline-constants";
import type { PipelineStatus, PipelineType } from "@/lib/database.types";

type AdvanceStatusModalProps = {
  pipelineItemId: string;
  patientName: string;
  currentStatus: PipelineStatus;
  pipelineType: PipelineType;
  metadata: Record<string, unknown>;
  onConfirm: (newStatus: PipelineStatus, notes: string) => Promise<void>;
  onClose: () => void;
};

export function AdvanceStatusModal({
  patientName,
  currentStatus,
  pipelineType,
  metadata,
  onConfirm,
  onClose,
}: AdvanceStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<PipelineStatus | null>(
    null
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const nextStatuses = getNextStatuses(pipelineType, currentStatus, metadata);

  async function handleConfirm() {
    if (!selectedStatus) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedStatus, notes.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Avançar status — {patientName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          Status atual:{" "}
          <span className="font-medium text-slate-700">
            {PIPELINE_STATUS_LABELS[currentStatus]}
          </span>
        </p>

        {nextStatuses.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Nenhum próximo status disponível para esta esteira.
          </p>
        ) : (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Próximos status possíveis:
            </p>
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStatus(s)}
                className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                  selectedStatus === s
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {PIPELINE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Observação (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="Observação sobre este avanço..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedStatus || submitting}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-slate-700"
          >
            {submitting ? "Confirmando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/pos-atendimento/advance-status-modal.tsx
git commit -m "feat: add AdvanceStatusModal with next-status selection and notes field"
```

---

## Task 5: Main dashboard client component

**Files:**
- Create: `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx`

This is the largest file. It contains: filter state, realtime subscription, advance-status handler (UPDATE pipeline_items + INSERT pipeline_events), history fetch, SLA alert logic, and rendering.

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/date";
import {
  PIPELINE_TYPE_LABELS,
  PIPELINE_STATUS_LABELS,
  getPipelineStatusBadgeClass,
  PIPELINE_TYPE_BADGE_CLASS,
} from "@/lib/pipeline-constants";
import { AdvanceStatusModal } from "./advance-status-modal";
import { HistoryModal } from "./history-modal";
import type { PipelineStatus, PipelineType, Json } from "@/lib/database.types";
import type { ProfileRecord } from "@/lib/database.types";

type PipelineItemRow = {
  id: string;
  attendance_id: string;
  queue_item_id: string | null;
  pipeline_type: PipelineType;
  status: PipelineStatus;
  responsible_id: string | null;
  sla_deadline: string | null;
  metadata: Json;
  opened_at: string;
  updated_at: string;
  attendances: { patient_name: string } | null;
  queue_items: { exam_type: string } | null;
  profiles: { full_name: string } | null;
};

type PipelineEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  profiles: { full_name: string } | null;
};

type Props = {
  initialItems: PipelineItemRow[];
  profiles: Pick<ProfileRecord, "id" | "full_name">[];
  currentProfile: ProfileRecord;
};

type FilterType = PipelineType | "todos";
type FilterStatus = PipelineStatus | "todos";

type AdvanceTarget = {
  item: PipelineItemRow;
};

type HistoryTarget = {
  item: PipelineItemRow;
  events: PipelineEvent[];
};

export function PosAtendimentoDashboard({
  initialItems,
  currentProfile,
}: Props) {
  const [items, setItems] = useState<PipelineItemRow[]>(initialItems);
  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [advanceTarget, setAdvanceTarget] = useState<AdvanceTarget | null>(null);
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);

  // Realtime subscription
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel("pipeline-items-all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipeline_items" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((i) => i.id !== String(payload.old.id)));
            return;
          }
          const raw = payload.new as Record<string, unknown>;
          // Re-fetch the single item with joins so we have patient_name etc.
          supabase
            .from("pipeline_items")
            .select(
              `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at,
               attendances ( patient_name ), queue_items ( exam_type ), profiles:responsible_id ( full_name )`
            )
            .eq("id", String(raw.id))
            .neq("status", "publicado_finalizado")
            .single()
            .then(({ data }) => {
              if (!data) {
                // Item became publicado_finalizado — remove from list
                setItems((prev) => prev.filter((i) => i.id !== String(raw.id)));
                return;
              }
              setItems((prev) => {
                const idx = prev.findIndex((i) => i.id === data.id);
                if (idx === -1) return [...prev, data as PipelineItemRow];
                const next = [...prev];
                next[idx] = data as PipelineItemRow;
                return next;
              });
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sort: overdue first, then by opened_at asc
  const sorted = [...items].sort((a, b) => {
    const nowMs = Date.now();
    const aOverdue = a.sla_deadline ? new Date(a.sla_deadline).getTime() < nowMs : false;
    const bOverdue = b.sla_deadline ? new Date(b.sla_deadline).getTime() < nowMs : false;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
  });

  // Filters
  const filtered = sorted.filter((item) => {
    if (filterType !== "todos" && item.pipeline_type !== filterType) return false;
    if (filterStatus !== "todos" && item.status !== filterStatus) return false;
    if (filterOverdue) {
      if (!item.sla_deadline) return false;
      if (new Date(item.sla_deadline).getTime() >= Date.now()) return false;
    }
    if (filterSearch.trim()) {
      const needle = filterSearch.trim().toLowerCase();
      const name = item.attendances?.patient_name?.toLowerCase() ?? "";
      if (!name.includes(needle)) return false;
    }
    return true;
  });

  const handleAdvanceConfirm = useCallback(
    async (newStatus: PipelineStatus, notes: string) => {
      if (!advanceTarget) return;
      const supabase = getBrowserSupabaseClient();
      const item = advanceTarget.item;

      const [{ error: updateError }, { error: insertError }] = await Promise.all([
        supabase
          .from("pipeline_items")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", item.id),
        supabase.from("pipeline_events").insert({
          pipeline_item_id: item.id,
          previous_status: item.status,
          new_status: newStatus,
          performed_by: currentProfile.id,
          occurred_at: new Date().toISOString(),
          notes: notes || null,
        }),
      ]);

      if (updateError) throw updateError;
      if (insertError) throw insertError;
    },
    [advanceTarget, currentProfile.id]
  );

  const openHistory = useCallback(async (item: PipelineItemRow) => {
    const supabase = getBrowserSupabaseClient();
    const { data } = await supabase
      .from("pipeline_events")
      .select(
        `id, previous_status, new_status, performed_by, occurred_at, notes, profiles:performed_by ( full_name )`
      )
      .eq("pipeline_item_id", item.id)
      .order("occurred_at", { ascending: true });

    setHistoryTarget({ item, events: (data as PipelineEvent[]) ?? [] });
  }, []);

  function getSlaAlertClass(slaDeadline: string | null): string {
    if (!slaDeadline) return "";
    const ms = new Date(slaDeadline).getTime() - Date.now();
    if (ms < 0) return "text-red-600 font-semibold";
    if (ms < 2 * 60 * 60 * 1000) return "text-yellow-600 font-semibold";
    return "text-green-600";
  }

  const pipelineTypes: PipelineType[] = ["laudo", "cefalometria", "fotografia", "escaneamento"];
  const pipelineStatuses: PipelineStatus[] = [
    "nao_iniciado", "pendente_envio", "enviado_radiologista", "recebido_radiologista",
    "devolvido_radiologista", "recebido_corrigido", "revisado_liberado", "em_ajuste",
    "publicado_idoc", "disponivel_impressao", "enviado_impressao", "recebido_laboratorio",
    "enviado_laboratorio_externo", "retornado_laboratorio",
  ];

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pós-atendimento</h1>
        <p className="text-sm text-slate-500">
          Esteiras abertas aguardando conclusão
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos os tipos</option>
          {pipelineTypes.map((t) => (
            <option key={t} value={t}>
              {PIPELINE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos os status</option>
          {pipelineStatuses.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {/* Overdue toggle */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(e) => setFilterOverdue(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Apenas com atraso
        </label>

        {/* Patient search */}
        <input
          type="text"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Buscar paciente..."
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />

        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} esteira{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
          Nenhuma esteira encontrada com os filtros selecionados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Exame</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
                <th className="px-4 py-3 font-medium">Abertura</th>
                <th className="px-4 py-3 font-medium">Prazo</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.attendances?.patient_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.queue_items?.exam_type ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PIPELINE_TYPE_BADGE_CLASS[item.pipeline_type]}`}
                    >
                      {PIPELINE_TYPE_LABELS[item.pipeline_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getPipelineStatusBadgeClass(item.status)}`}
                    >
                      {PIPELINE_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.profiles?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(item.opened_at)}
                  </td>
                  <td className={`px-4 py-3 ${getSlaAlertClass(item.sla_deadline)}`}>
                    {item.sla_deadline
                      ? formatDateTime(item.sla_deadline)
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAdvanceTarget({ item })}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        Avançar
                      </button>
                      <button
                        onClick={() => openHistory(item)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Histórico
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Advance Status Modal */}
      {advanceTarget && (
        <AdvanceStatusModal
          pipelineItemId={advanceTarget.item.id}
          patientName={advanceTarget.item.attendances?.patient_name ?? "Paciente"}
          currentStatus={advanceTarget.item.status}
          pipelineType={advanceTarget.item.pipeline_type}
          metadata={
            (advanceTarget.item.metadata as Record<string, unknown>) ?? {}
          }
          onConfirm={handleAdvanceConfirm}
          onClose={() => setAdvanceTarget(null)}
        />
      )}

      {/* History Modal */}
      {historyTarget && (
        <HistoryModal
          patientName={historyTarget.item.attendances?.patient_name ?? "Paciente"}
          events={historyTarget.events}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx
git commit -m "feat: add PosAtendimentoDashboard with filters, realtime, advance status and history"
```

---

## Task 6: Add navigation link

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Add the navigation entries**

In `src/lib/constants.ts`, find `ROLE_NAVIGATION` and update the `recepcao`, `atendimento`, and `admin` entries to include the new route:

```typescript
export const ROLE_NAVIGATION: Record<
  AppRole,
  Array<{
    href: string;
    label: string;
  }>
> = {
  recepcao: [
    { href: "/recepcao", label: "Recepcao" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
  ],
  atendimento: [
    { href: "/atendimento", label: "Salas" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
  ],
  admin: [
    { href: "/admin", label: "Resumo do dia" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
  ],
  gerencia: [{ href: "/gerencia", label: "Operação" }],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: add Pós-atendimento nav link for recepcao, atendimento and admin roles"
```

---

## Task 7: Verify TypeScript and fix any type errors

- [ ] **Step 1: Run type check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit
```

Expected: zero errors. If there are errors, fix them before proceeding.

Common issues to expect and fix:
- `requireRole` may not accept an array — see Task 2 Step 2 for the fallback.
- The joined type from Supabase (e.g., `attendances`, `profiles`) may need explicit casting since the generated types may not infer nested selects. Use `as` casts or inline type assertions as needed.
- `Json` type from `database.types.ts` may need to be cast to `Record<string, unknown>` when accessing metadata fields.

- [ ] **Step 2: Commit fixes (if any)**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors in pos-atendimento module"
```

---

## Task 8: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npm run dev
```

- [ ] **Step 2: Test the golden path**

1. Log in as `admin` (or `recepcao`/`atendimento`)
2. Navigate to `/pos-atendimento`
3. Confirm the list renders pipeline items (if any exist in staging) with correct columns
4. Try the type and status filters — confirm they narrow the list
5. Click "Avançar" on any item — confirm the modal shows current status and valid next statuses for the item's type
6. Select a next status, optionally add a note, click "Confirmar"
7. Confirm the row updates in the list (realtime should re-fetch and update)
8. Click "Histórico" — confirm the modal shows the event just created
9. Confirm "Pós-atendimento" nav link appears for recepcao, atendimento, and admin roles
10. Log in as `gerencia` — confirm the nav link does NOT appear

---

## Self-review: spec coverage check

| Spec requirement | Task |
|---|---|
| Route /pos-atendimento, all 3 roles | Task 2 |
| List: patient, exam, type, status badge, responsible, opened_at, sla_deadline | Task 5 |
| SLA alert: green/yellow/red | Task 5 (`getSlaAlertClass`) |
| Sort: overdue first → opened_at asc | Task 5 |
| Filter: type, status, overdue, patient search | Task 5 |
| Advance status modal with next-status map | Tasks 1 + 4 |
| UPDATE pipeline_items + INSERT pipeline_events | Task 5 (`handleAdvanceConfirm`) |
| History modal with events ordered ASC | Task 3 |
| Nav link for recepcao, atendimento, admin | Task 6 |
| Realtime subscription on pipeline_items | Task 5 |
| America/Manaus timestamps (`formatDateTime`) | Tasks 3 + 5 |
| No publicado_finalizado in list | Task 2 (query filter) |
| Metadata-aware progression (fotografia com_impressao, escaneamento laboratorio_externo) | Task 1 |
