# Pós-Atendimento Fase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a management view to `/pos-atendimento` with executive summary cards, a full pipeline grid with admin-only actions (reopen/correct status), and SLA configuration in `/admin` with automatic SLA deadline calculation on pipeline opening.

**Architecture:** Three independent layers: (1) DB migration adds `sla_config` table and updates the pipeline-opening trigger to calculate `sla_deadline`; (2) a new `/pos-atendimento/gerencial` sub-route renders a server-fetched client dashboard with summary cards + paginated grid + admin modals; (3) a new `/admin/sla` sub-route renders a server-fetched SLA config editor. The gerencial view re-uses `PipelineItemRow`, badge helpers, and `formatDateTime` from existing code.

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind CSS, Supabase (SSR + browser + Realtime postgres_changes), `mcp__claude_ai_Supabase__apply_migration` for migrations.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260419100000_sla_config.sql` | Create | `sla_config` table, seed rows, `add_business_days` PG function, updated `create_pipeline_item_if_missing` that reads SLA config |
| `supabase/migrations/20260419100001_update_typescript_types.sql` | — | No file — regenerate types via Supabase MCP after migration |
| `src/lib/business-days.ts` | Create | `addBusinessDays(date, days): Date` utility (Mon–Fri, no holidays) |
| `src/lib/pipeline-constants.ts` | Modify | Add `ALL_PIPELINE_STATUSES_FOR_TYPE` map (admin correction) and `getStatusesForType` |
| `src/app/(app)/pos-atendimento/gerencial/page.tsx` | Create | Server component: admin/gerencia only, fetches summary counts + first page of items |
| `src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx` | Create | Client component: summary cards, paginated grid, filters, realtime, admin modals |
| `src/app/(app)/pos-atendimento/gerencial/reopen-modal.tsx` | Create | Admin-only modal: reopen finished pipeline item |
| `src/app/(app)/pos-atendimento/gerencial/correct-status-modal.tsx` | Create | Admin-only modal: set any valid status with mandatory reason |
| `src/app/(app)/pos-atendimento/gerencial/audit-modal.tsx` | Create | Modal: full pipeline_events list with role shown |
| `src/app/api/clinic/pipeline-items/[id]/admin-action/route.ts` | Create | POST: reopen or correct-status, writes pipeline_items + pipeline_events |
| `src/app/(app)/admin/sla/page.tsx` | Create | Server component: admin only, fetches sla_config rows |
| `src/app/(app)/admin/sla/sla-config-editor.tsx` | Create | Client component: edit business_days per subtype, save via API |
| `src/app/api/clinic/sla-config/route.ts` | Create | GET + PATCH: read and update sla_config, recalculate open items' deadlines |
| `src/lib/constants.ts` | Modify | Add gerencial nav link for admin/gerencia; add SLA link in admin nav |

---

## Task 1: DB migration — sla_config table + add_business_days + updated trigger

**Files:**
- Create: `supabase/migrations/20260419100000_sla_config.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: sla_config table, business-days helper, SLA-aware pipeline opening

-- 1. Table
create table if not exists public.sla_config (
  id            uuid primary key default gen_random_uuid(),
  pipeline_subtype text not null unique,
  business_days integer not null check (business_days > 0),
  updated_at    timestamptz not null default timezone('utc', now()),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.sla_config enable row level security;

create policy "sla_config_read_all"
  on public.sla_config for select
  to authenticated using (true);

create policy "sla_config_write_admin"
  on public.sla_config for all
  to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- 2. Seed default values
insert into public.sla_config (pipeline_subtype, business_days) values
  ('laudo_2d',                    3),
  ('laudo_tomografia',            5),
  ('cefalometria',                3),
  ('fotografia_idoc',             2),
  ('fotografia_impressao',        3),
  ('escaneamento_digital',        2),
  ('escaneamento_laboratorio',    3)
on conflict (pipeline_subtype) do nothing;

-- 3. add_business_days(start_ts, days): adds N business days (Mon–Fri) to a timestamp
create or replace function public.add_business_days(
  p_start timestamptz,
  p_days  integer
)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_date date := p_start::date;
  v_remaining integer := p_days;
begin
  while v_remaining > 0 loop
    v_date := v_date + interval '1 day';
    -- 0=Sun 6=Sat in extract(dow)
    if extract(dow from v_date) not in (0, 6) then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  -- preserve time-of-day from p_start but on the new date in UTC
  return (v_date + (p_start - p_start::date))::timestamptz;
end;
$$;

-- 4. Helper: resolve which sla_config subtype applies to a pipeline_type + metadata
create or replace function public.resolve_sla_subtype(
  p_pipeline_type public.pipeline_type,
  p_metadata      jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_pipeline_type = 'laudo' then
    if coalesce(p_metadata->>'source_exam_type', '') = 'tomografia' then
      return 'laudo_tomografia';
    else
      return 'laudo_2d';
    end if;
  end if;

  if p_pipeline_type = 'cefalometria' then
    return 'cefalometria';
  end if;

  if p_pipeline_type = 'fotografia' then
    if coalesce((p_metadata->>'com_impressao')::boolean, false) then
      return 'fotografia_impressao';
    else
      return 'fotografia_idoc';
    end if;
  end if;

  if p_pipeline_type = 'escaneamento' then
    if coalesce((p_metadata->>'laboratorio_externo')::boolean, false) then
      return 'escaneamento_laboratorio';
    else
      return 'escaneamento_digital';
    end if;
  end if;

  return null;
end;
$$;

-- 5. Update create_pipeline_item_if_missing to set sla_deadline from sla_config
create or replace function public.create_pipeline_item_if_missing(
  p_attendance_id uuid,
  p_queue_item_id uuid,
  p_pipeline_type public.pipeline_type,
  p_metadata jsonb default '{}'::jsonb,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_pipeline_item_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
begin
  select pipeline_item.id
  into created_pipeline_item_id
  from public.pipeline_items pipeline_item
  where pipeline_item.attendance_id = p_attendance_id
    and pipeline_item.pipeline_type = p_pipeline_type
    and pipeline_item.finished_at is null
  order by pipeline_item.opened_at desc
  limit 1;

  if created_pipeline_item_id is not null then
    return created_pipeline_item_id;
  end if;

  -- Resolve SLA deadline
  v_sla_subtype := public.resolve_sla_subtype(p_pipeline_type, coalesce(p_metadata, '{}'::jsonb));
  if v_sla_subtype is not null then
    select business_days into v_business_days
    from public.sla_config
    where pipeline_subtype = v_sla_subtype;
  end if;

  if v_business_days is not null then
    v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
  end if;

  insert into public.pipeline_items (
    attendance_id,
    queue_item_id,
    pipeline_type,
    metadata,
    notes,
    created_by,
    sla_deadline
  )
  values (
    p_attendance_id,
    p_queue_item_id,
    p_pipeline_type,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_created_by,
    v_sla_deadline
  )
  returning id
  into created_pipeline_item_id;

  return created_pipeline_item_id;
exception
  when unique_violation then
    select pipeline_item.id
    into created_pipeline_item_id
    from public.pipeline_items pipeline_item
    where pipeline_item.attendance_id = p_attendance_id
      and pipeline_item.pipeline_type = p_pipeline_type
      and pipeline_item.finished_at is null
    order by pipeline_item.opened_at desc
    limit 1;

    return created_pipeline_item_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with:
- `project_id`: `zyzlrilkqukcgyjztbmb`
- `name`: `sla_config`
- `query`: the full SQL above

- [ ] **Step 3: Regenerate TypeScript types**

Use `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: zyzlrilkqukcgyjztbmb` and write the output to `src/lib/database.types.ts`.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add supabase/migrations/20260419100000_sla_config.sql src/lib/database.types.ts && git commit -m "feat: add sla_config table, add_business_days function, SLA-aware pipeline opening"
```

---

## Task 2: addBusinessDays TypeScript utility

**Files:**
- Create: `src/lib/business-days.ts`

- [ ] **Step 1: Create the utility**

```typescript
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return result;
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/lib/business-days.ts && git commit -m "feat: add addBusinessDays utility (Mon-Fri, no holidays)"
```

---

## Task 3: Pipeline constants — add getStatusesForType for admin correction

**Files:**
- Modify: `src/lib/pipeline-constants.ts`

- [ ] **Step 1: Add the function at the end of the file**

```typescript
// Returns all valid statuses for a given pipeline type (for admin correction, not just next step).
export function getStatusesForType(type: PipelineType): PipelineStatus[] {
  const map: Record<PipelineType, PipelineStatus[]> = {
    laudo: [
      "nao_iniciado",
      "pendente_envio",
      "enviado_radiologista",
      "recebido_radiologista",
      "devolvido_radiologista",
      "recebido_corrigido",
      "revisado_liberado",
      "publicado_finalizado",
    ],
    cefalometria: [
      "nao_iniciado",
      "pendente_envio",
      "enviado_radiologista",
      "recebido_radiologista",
      "devolvido_radiologista",
      "recebido_corrigido",
      "revisado_liberado",
      "publicado_finalizado",
    ],
    fotografia: [
      "nao_iniciado",
      "em_ajuste",
      "publicado_idoc",
      "disponivel_impressao",
      "enviado_impressao",
      "recebido_laboratorio",
      "publicado_finalizado",
    ],
    escaneamento: [
      "nao_iniciado",
      "em_ajuste",
      "enviado_laboratorio_externo",
      "retornado_laboratorio",
      "publicado_finalizado",
    ],
  };
  return map[type];
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/lib/pipeline-constants.ts && git commit -m "feat: add getStatusesForType for admin status correction"
```

---

## Task 4: Admin action API route

**Files:**
- Create: `src/app/api/clinic/pipeline-items/[id]/admin-action/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import type { PipelineStatus } from "@/lib/database.types";

type AdminActionBody = {
  action: "reopen" | "correct-status";
  newStatus: PipelineStatus;
  reason: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validateSameOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase, profile } = await requireRole("admin");
  const { id } = await params;

  let body: AdminActionBody | null = null;
  try {
    body = (await request.json()) as AdminActionBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body || !body.action || !body.newStatus || !body.reason?.trim()) {
    return jsonError("Acao, novo status e motivo sao obrigatorios.", 400);
  }

  const reason = body.reason.trim();
  if (reason.length < 3) {
    return jsonError("Motivo deve ter pelo menos 3 caracteres.", 400);
  }

  // Fetch the current item to validate
  const { data: item, error: fetchError } = await supabase
    .from("pipeline_items")
    .select("id, status, pipeline_type, finished_at")
    .eq("id", id)
    .single();

  if (fetchError || !item) {
    return jsonError("Esteira nao encontrada.", 404);
  }

  if (body.action === "reopen" && item.status !== "publicado_finalizado") {
    return jsonError("Apenas esteiras finalizadas podem ser reabertas.", 409);
  }

  // Perform the UPDATE — the log_pipeline_item_event trigger writes the event automatically.
  // We pass the reason as notes so the trigger captures it.
  const { error: updateError } = await supabase
    .from("pipeline_items")
    .update({
      status: body.newStatus,
      notes: reason,
    })
    .eq("id", id);

  if (updateError) {
    logServerError("admin_action.pipeline_items.update", updateError);
    return jsonError("Nao foi possivel executar a acao.", 400);
  }

  // Insert an extra event tagging the action type for audit visibility
  const eventMetadata =
    body.action === "reopen"
      ? { event_type: "reopened", performed_by_role: profile.role }
      : { event_type: "admin_correction", performed_by_role: profile.role };

  await supabase.from("pipeline_events").insert({
    pipeline_item_id: id,
    previous_status: item.status as PipelineStatus,
    new_status: body.newStatus,
    performed_by: profile.id,
    notes: reason,
    metadata: eventMetadata,
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors. Common: `params` is a Promise in Next.js 15 — the `await params` pattern handles it.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/app/api/clinic/pipeline-items && git commit -m "feat: add admin-action API route for reopen and correct-status pipeline actions"
```

---

## Task 5: SLA config API route

**Files:**
- Create: `src/app/api/clinic/sla-config/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";

type SlaConfigRow = {
  id: string;
  pipeline_subtype: string;
  business_days: number;
  updated_at: string;
};

type PatchBody = {
  updates: Array<{ pipeline_subtype: string; business_days: number }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validateSameOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }
  return null;
}

export async function GET() {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase
    .from("sla_config")
    .select("id, pipeline_subtype, business_days, updated_at")
    .order("pipeline_subtype");

  if (error) {
    logServerError("sla_config.get", error);
    return jsonError("Nao foi possivel carregar configuracao de SLA.", 500);
  }

  return NextResponse.json({ rows: data as SlaConfigRow[] });
}

export async function PATCH(request: Request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase, profile } = await requireRole("admin");

  let body: PatchBody | null = null;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body?.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
    return jsonError("Lista de atualizacoes invalida.", 400);
  }

  for (const update of body.updates) {
    if (!update.pipeline_subtype || typeof update.business_days !== "number") {
      return jsonError("Cada item deve ter pipeline_subtype e business_days.", 400);
    }
    if (!Number.isInteger(update.business_days) || update.business_days < 1 || update.business_days > 30) {
      return jsonError("business_days deve ser um inteiro entre 1 e 30.", 400);
    }
  }

  for (const update of body.updates) {
    const { error } = await supabase
      .from("sla_config")
      .update({
        business_days: update.business_days,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("pipeline_subtype", update.pipeline_subtype);

    if (error) {
      logServerError("sla_config.patch", error);
      return jsonError("Nao foi possivel salvar a configuracao.", 500);
    }
  }

  // Backfill sla_deadline for open pipeline_items that currently have null sla_deadline.
  // We call the DB function directly via RPC for each subtype.
  // For simplicity, do a single SQL UPDATE per subtype using the add_business_days function.
  for (const update of body.updates) {
    await supabase.rpc("backfill_sla_deadline_for_subtype", {
      p_pipeline_subtype: update.pipeline_subtype,
      p_business_days: update.business_days,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Add the backfill RPC to the migration file (new migration)**

Create `supabase/migrations/20260419100001_sla_backfill_rpc.sql`:

```sql
-- RPC to backfill sla_deadline for open pipeline_items with null sla_deadline
-- for a given pipeline_subtype configuration.
create or replace function public.backfill_sla_deadline_for_subtype(
  p_pipeline_subtype text,
  p_business_days integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pipeline_items pi
  set sla_deadline = public.add_business_days(pi.opened_at, p_business_days)
  where pi.finished_at is null
    and pi.sla_deadline is null
    and public.resolve_sla_subtype(pi.pipeline_type, pi.metadata) = p_pipeline_subtype;
end;
$$;
```

Apply this migration via `mcp__claude_ai_Supabase__apply_migration` with name `sla_backfill_rpc`.

- [ ] **Step 3: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add supabase/migrations/20260419100001_sla_backfill_rpc.sql src/app/api/clinic/sla-config && git commit -m "feat: add SLA config API route and backfill RPC"
```

---

## Task 6: Admin modals (reopen, correct-status, audit)

**Files:**
- Create: `src/app/(app)/pos-atendimento/gerencial/reopen-modal.tsx`
- Create: `src/app/(app)/pos-atendimento/gerencial/correct-status-modal.tsx`
- Create: `src/app/(app)/pos-atendimento/gerencial/audit-modal.tsx`

- [ ] **Step 1: Create reopen-modal.tsx**

```typescript
"use client";

import { useState } from "react";

type ReopenModalProps = {
  pipelineItemId: string;
  patientName: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
};

export function ReopenModal({
  patientName,
  onConfirm,
  onClose,
}: ReopenModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (reason.trim().length < 3) {
      setError("Informe o motivo com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      setError("Erro ao reabrir esteira. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Reabrir esteira — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Esta ação reabre uma esteira finalizada e será registrada em auditoria.
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Motivo <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="Descreva o motivo da reabertura..."
          />
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-amber-700"
          >
            {submitting ? "Reabrindo..." : "Confirmar reabertura"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create correct-status-modal.tsx**

```typescript
"use client";

import { useState } from "react";
import { PIPELINE_STATUS_LABELS, getStatusesForType } from "@/lib/pipeline-constants";
import type { PipelineStatus, PipelineType } from "@/lib/database.types";

type CorrectStatusModalProps = {
  pipelineItemId: string;
  patientName: string;
  currentStatus: PipelineStatus;
  pipelineType: PipelineType;
  onConfirm: (newStatus: PipelineStatus, reason: string) => Promise<void>;
  onClose: () => void;
};

export function CorrectStatusModal({
  patientName,
  currentStatus,
  pipelineType,
  onConfirm,
  onClose,
}: CorrectStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<PipelineStatus | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allStatuses = getStatusesForType(pipelineType).filter((s) => s !== currentStatus);

  async function handleConfirm() {
    if (!selectedStatus) { setError("Selecione o novo status."); return; }
    if (reason.trim().length < 3) { setError("Informe o motivo com pelo menos 3 caracteres."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedStatus, reason.trim());
      onClose();
    } catch {
      setError("Erro ao corrigir status. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Corrigir status — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Ação de correção — será registrada em auditoria. Status atual:{" "}
          <span className="font-semibold">{PIPELINE_STATUS_LABELS[currentStatus]}</span>
        </p>

        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-slate-700">Novo status:</p>
          {allStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStatus(s)}
              className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                selectedStatus === s
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {PIPELINE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Motivo <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="Descreva o motivo da correção..."
          />
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedStatus || submitting}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-rose-700"
          >
            {submitting ? "Corrigindo..." : "Confirmar correção"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create audit-modal.tsx**

```typescript
"use client";

import { formatDateTime } from "@/lib/date";
import { PIPELINE_STATUS_LABELS } from "@/lib/pipeline-constants";
import type { PipelineStatus } from "@/lib/database.types";

type AuditEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  profiles: { full_name: string; role: string } | null;
};

type AuditModalProps = {
  patientName: string;
  events: AuditEvent[];
  onClose: () => void;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  created: "Criação",
  status_changed: "Avanço",
  reopened: "Reabertura",
  admin_correction: "Correção admin",
};

export function AuditModal({ patientName, events, onClose }: AuditModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Auditoria completa — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhum evento registrado.</p>
        ) : (
          <ol className="max-h-[60vh] space-y-3 overflow-y-auto">
            {events.map((ev) => {
              const eventType = (ev.metadata as Record<string, unknown> | null)?.event_type as string | undefined;
              const label = eventType ? (EVENT_TYPE_LABELS[eventType] ?? eventType) : "Evento";
              const isAdmin = eventType === "reopened" || eventType === "admin_correction";

              return (
                <li key={ev.id} className={`flex gap-3 rounded-lg px-3 py-2 text-sm ${isAdmin ? "bg-rose-50" : "bg-slate-50"}`}>
                  <span className="mt-0.5 shrink-0 text-xs text-slate-400">
                    {formatDateTime(ev.occurred_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isAdmin ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
                        {label}
                      </span>
                      <span className="font-medium text-slate-700">
                        {ev.previous_status ? `${PIPELINE_STATUS_LABELS[ev.previous_status]} → ` : ""}
                        {PIPELINE_STATUS_LABELS[ev.new_status]}
                      </span>
                    </div>
                    {ev.profiles && (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {ev.profiles.full_name}
                        {ev.profiles.role ? ` (${ev.profiles.role})` : ""}
                      </span>
                    )}
                    {ev.notes && <p className="mt-0.5 text-slate-500">{ev.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/app/(app)/pos-atendimento/gerencial && git commit -m "feat: add admin modals for reopen, correct-status and audit"
```

---

## Task 7: Gerencial dashboard client component

**Files:**
- Create: `src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx`

This is the largest file. It has: summary cards, paginated grid, all filters, realtime subscription, admin action handlers, and three modal triggers.

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/date";
import {
  PIPELINE_TYPE_LABELS,
  PIPELINE_STATUS_LABELS,
  getPipelineStatusBadgeClass,
  PIPELINE_TYPE_BADGE_CLASS,
} from "@/lib/pipeline-constants";
import { MetricCard } from "@/components/metric-card";
import { ReopenModal } from "./reopen-modal";
import { CorrectStatusModal } from "./correct-status-modal";
import { AuditModal } from "./audit-modal";
import type { PipelineStatus, PipelineType, Json } from "@/lib/database.types";
import type { ProfileRecord } from "@/lib/database.types";

const PAGE_SIZE = 20;

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
  finished_at: string | null;
  attendances: { patient_name: string } | null;
  queue_items: { exam_type: string } | null;
  profiles: { full_name: string } | null;
};

type AuditEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  profiles: { full_name: string; role: string } | null;
};

type SummaryData = {
  // Laudos
  laudo_pendente_envio: number;
  laudo_enviado_radiologista: number;
  laudo_recebido_radiologista: number;
  laudo_atrasado: number;
  // Cefalometria
  cefalo_pendente_envio: number;
  cefalo_enviado_radiologista: number;
  cefalo_atrasado: number;
  // Fotografia
  foto_em_ajuste: number;
  foto_disponivel_impressao: number;
  foto_em_laboratorio: number;
  foto_atrasado: number;
  // Escaneamento
  scan_em_ajuste: number;
  scan_laboratorio_externo: number;
  scan_atrasado: number;
  // Geral
  total_aberto: number;
  total_finalizado_hoje: number;
};

type Props = {
  initialItems: PipelineItemRow[];
  initialTotal: number;
  currentProfile: ProfileRecord;
};

type FilterStatus = PipelineStatus | "todos";
type FilterType = PipelineType | "todos";

export function GerencialDashboard({ initialItems, initialTotal, currentProfile }: Props) {
  const isAdmin = currentProfile.role === "admin";

  const [items, setItems] = useState<PipelineItemRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterFinished, setFilterFinished] = useState<"todos" | "aberto" | "finalizado">("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterOpenedFrom, setFilterOpenedFrom] = useState("");
  const [filterOpenedTo, setFilterOpenedTo] = useState("");

  // Summary
  const [summary, setSummary] = useState<SummaryData | null>(null);

  // Modals
  const [reopenTarget, setReopenTarget] = useState<PipelineItemRow | null>(null);
  const [correctTarget, setCorrectTarget] = useState<PipelineItemRow | null>(null);
  const [auditTarget, setAuditTarget] = useState<{ item: PipelineItemRow; events: AuditEvent[] } | null>(null);

  const fetchPage = useCallback(async (pageIndex: number) => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;
    setLoading(true);

    let query = supabase
      .from("pipeline_items")
      .select(
        `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at, finished_at,
         attendances ( patient_name ), queue_items ( exam_type ), profiles:responsible_id ( full_name )`,
        { count: "exact" }
      );

    if (filterType !== "todos") query = query.eq("pipeline_type", filterType);
    if (filterStatus !== "todos") query = query.eq("status", filterStatus);
    if (filterOverdue) query = query.lt("sla_deadline", new Date().toISOString()).neq("status", "publicado_finalizado");
    if (filterFinished === "aberto") query = query.neq("status", "publicado_finalizado");
    if (filterFinished === "finalizado") query = query.eq("status", "publicado_finalizado");
    if (filterSearch.trim()) query = query.ilike("attendances.patient_name", `%${filterSearch.trim()}%`);
    if (filterOpenedFrom) query = query.gte("opened_at", filterOpenedFrom);
    if (filterOpenedTo) query = query.lte("opened_at", filterOpenedTo + "T23:59:59Z");

    query = query
      .order("opened_at", { ascending: false })
      .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (!error && data) {
      setItems(data as PipelineItemRow[]);
      setTotal(count ?? 0);
      setPage(pageIndex);
    }
    setLoading(false);
  }, [filterType, filterStatus, filterOverdue, filterFinished, filterSearch, filterOpenedFrom, filterOpenedTo]);

  const fetchSummary = useCallback(async () => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const now = today.toISOString();

    const { data } = await supabase.from("pipeline_items").select("pipeline_type, status, sla_deadline, finished_at");
    if (!data) return;

    const s: SummaryData = {
      laudo_pendente_envio: 0, laudo_enviado_radiologista: 0, laudo_recebido_radiologista: 0, laudo_atrasado: 0,
      cefalo_pendente_envio: 0, cefalo_enviado_radiologista: 0, cefalo_atrasado: 0,
      foto_em_ajuste: 0, foto_disponivel_impressao: 0, foto_em_laboratorio: 0, foto_atrasado: 0,
      scan_em_ajuste: 0, scan_laboratorio_externo: 0, scan_atrasado: 0,
      total_aberto: 0, total_finalizado_hoje: 0,
    };

    for (const item of data) {
      const overdue = item.sla_deadline ? item.sla_deadline < now : false;
      const open = item.status !== "publicado_finalizado";
      if (open) s.total_aberto++;
      if (item.finished_at && item.finished_at >= todayStart) s.total_finalizado_hoje++;

      if (item.pipeline_type === "laudo") {
        if (item.status === "pendente_envio") s.laudo_pendente_envio++;
        if (item.status === "enviado_radiologista") s.laudo_enviado_radiologista++;
        if (item.status === "recebido_radiologista") s.laudo_recebido_radiologista++;
        if (overdue && open) s.laudo_atrasado++;
      }
      if (item.pipeline_type === "cefalometria") {
        if (item.status === "pendente_envio") s.cefalo_pendente_envio++;
        if (item.status === "enviado_radiologista") s.cefalo_enviado_radiologista++;
        if (overdue && open) s.cefalo_atrasado++;
      }
      if (item.pipeline_type === "fotografia") {
        if (item.status === "em_ajuste") s.foto_em_ajuste++;
        if (item.status === "disponivel_impressao") s.foto_disponivel_impressao++;
        if (item.status === "enviado_impressao") s.foto_em_laboratorio++;
        if (overdue && open) s.foto_atrasado++;
      }
      if (item.pipeline_type === "escaneamento") {
        if (item.status === "em_ajuste") s.scan_em_ajuste++;
        if (item.status === "enviado_laboratorio_externo") s.scan_laboratorio_externo++;
        if (overdue && open) s.scan_atrasado++;
      }
    }
    setSummary(s);
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus, filterOverdue, filterFinished, filterSearch, filterOpenedFrom, filterOpenedTo]);

  // Realtime: summary and page both refresh on any pipeline_items change
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel("gerencial-pipeline-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "pipeline_items" }, () => {
        fetchSummary();
        fetchPage(page);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleAdminAction = useCallback(
    async (itemId: string, action: "reopen" | "correct-status", newStatus: PipelineStatus, reason: string) => {
      const response = await fetch(`/api/clinic/pipeline-items/${itemId}/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, newStatus, reason }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Erro desconhecido");
      }
    },
    []
  );

  const openAudit = useCallback(async (item: PipelineItemRow) => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("pipeline_events")
      .select(`id, previous_status, new_status, performed_by, occurred_at, notes, metadata, profiles:performed_by ( full_name, role )`)
      .eq("pipeline_item_id", item.id)
      .order("occurred_at", { ascending: true });
    setAuditTarget({ item, events: (data as AuditEvent[]) ?? [] });
  }, []);

  function getSlaClass(slaDeadline: string | null, status: PipelineStatus): string {
    if (!slaDeadline || status === "publicado_finalizado") return "";
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
    "enviado_laboratorio_externo", "retornado_laboratorio", "publicado_finalizado",
  ];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Gerencial — Pós-atendimento</h1>
        <p className="text-sm text-slate-500">Visão executiva das esteiras</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Em aberto" value={String(summary.total_aberto)} helper="esteiras ativas" accent="amber" compact />
            <MetricCard label="Finalizadas hoje" value={String(summary.total_finalizado_hoje)} helper="publicadas hoje" accent="teal" compact />
            <MetricCard label="Laudos atrasados" value={String(summary.laudo_atrasado)} helper="com SLA vencido" accent={summary.laudo_atrasado > 0 ? "rose" : "slate"} compact />
            <MetricCard label="Fotos atrasadas" value={String(summary.foto_atrasado)} helper="com SLA vencido" accent={summary.foto_atrasado > 0 ? "rose" : "slate"} compact />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCard label="Laudos: pendente envio" value={String(summary.laudo_pendente_envio)} helper="aguardando envio" accent="slate" compact />
            <MetricCard label="Laudos: enviado" value={String(summary.laudo_enviado_radiologista)} helper="no radiologista" accent="slate" compact />
            <MetricCard label="Laudos: recebido" value={String(summary.laudo_recebido_radiologista)} helper="retornou" accent="slate" compact />
            <MetricCard label="Cefalo.: enviado" value={String(summary.cefalo_enviado_radiologista)} helper="no radiologista" accent="slate" compact />
            <MetricCard label="Fotos: em ajuste" value={String(summary.foto_em_ajuste)} helper="em edição" accent="slate" compact />
            <MetricCard label="Fotos: em lab." value={String(summary.foto_em_laboratorio)} helper="enviado impressão" accent="slate" compact />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as FilterType)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none">
          <option value="todos">Todos os tipos</option>
          {pipelineTypes.map((t) => <option key={t} value={t}>{PIPELINE_TYPE_LABELS[t]}</option>)}
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none">
          <option value="todos">Todos os status</option>
          {pipelineStatuses.map((s) => <option key={s} value={s}>{PIPELINE_STATUS_LABELS[s]}</option>)}
        </select>

        <select value={filterFinished} onChange={(e) => setFilterFinished(e.target.value as "todos" | "aberto" | "finalizado")}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none">
          <option value="todos">Todos</option>
          <option value="aberto">Apenas abertos</option>
          <option value="finalizado">Apenas finalizados</option>
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300" />
          Apenas com atraso
        </label>

        <input type="text" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Buscar paciente..."
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />

        <input type="date" value={filterOpenedFrom} onChange={(e) => setFilterOpenedFrom(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
          title="Abertura a partir de" />

        <input type="date" value={filterOpenedTo} onChange={(e) => setFilterOpenedTo(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
          title="Abertura até" />

        <span className="ml-auto text-xs text-slate-400">{total} resultado{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
          Nenhuma esteira encontrada com os filtros selecionados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Abertura</th>
                <th className="px-4 py-3 font-medium">Prazo</th>
                <th className="px-4 py-3 font-medium">Finalizado em</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.attendances?.patient_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PIPELINE_TYPE_BADGE_CLASS[item.pipeline_type]}`}>
                      {PIPELINE_TYPE_LABELS[item.pipeline_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getPipelineStatusBadgeClass(item.status)}`}>
                      {PIPELINE_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(item.opened_at)}</td>
                  <td className={`px-4 py-3 ${getSlaClass(item.sla_deadline, item.status)}`}>
                    {item.sla_deadline ? formatDateTime(item.sla_deadline) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {item.finished_at ? formatDateTime(item.finished_at) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => openAudit(item)}
                        className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Auditoria
                      </button>
                      {isAdmin && item.status === "publicado_finalizado" && (
                        <button onClick={() => setReopenTarget(item)}
                          className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200">
                          Reabrir
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => setCorrectTarget(item)}
                          className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200">
                          Corrigir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => fetchPage(page - 1)}
            disabled={page === 0 || loading}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            ← Anterior
          </button>
          <span className="text-sm text-slate-500">
            Página {page + 1} de {totalPages}
          </span>
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            Próxima →
          </button>
        </div>
      )}

      {/* Modals */}
      {reopenTarget && (
        <ReopenModal
          pipelineItemId={reopenTarget.id}
          patientName={reopenTarget.attendances?.patient_name ?? "Paciente"}
          onConfirm={async (reason) => {
            // When reopening, we go back to the last non-finalized status.
            // For simplicity, reopen to "revisado_liberado" for laudo/cefalo,
            // "publicado_idoc" for fotografia, "em_ajuste" for escaneamento.
            const reopenStatusMap: Record<PipelineType, PipelineStatus> = {
              laudo: "revisado_liberado",
              cefalometria: "revisado_liberado",
              fotografia: "publicado_idoc",
              escaneamento: "em_ajuste",
            };
            const newStatus = reopenStatusMap[reopenTarget.pipeline_type];
            await handleAdminAction(reopenTarget.id, "reopen", newStatus, reason);
          }}
          onClose={() => setReopenTarget(null)}
        />
      )}

      {correctTarget && (
        <CorrectStatusModal
          pipelineItemId={correctTarget.id}
          patientName={correctTarget.attendances?.patient_name ?? "Paciente"}
          currentStatus={correctTarget.status}
          pipelineType={correctTarget.pipeline_type}
          onConfirm={async (newStatus, reason) => {
            await handleAdminAction(correctTarget.id, "correct-status", newStatus, reason);
          }}
          onClose={() => setCorrectTarget(null)}
        />
      )}

      {auditTarget && (
        <AuditModal
          patientName={auditTarget.item.attendances?.patient_name ?? "Paciente"}
          events={auditTarget.events}
          onClose={() => setAuditTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -40
```

Fix any errors. Common: `Json` type from `database.types.ts` may need explicit import; `ProfileRecord` needs checking.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx && git commit -m "feat: add GerencialDashboard with summary cards, paginated grid, and admin actions"
```

---

## Task 8: Gerencial server page

**Files:**
- Create: `src/app/(app)/pos-atendimento/gerencial/page.tsx`

- [ ] **Step 1: Create the page**

Read `src/lib/auth.ts` first to confirm `requireRole` accepts an array before writing. Use the same pattern as the existing `pos-atendimento/page.tsx`.

```typescript
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GerencialPage() {
  const { supabase, profile } = await requireRole(["admin", "gerencia"]);

  // Fetch first page of ALL pipeline_items (including finalizados)
  const { data: pipelineItems, count } = await supabase
    .from("pipeline_items")
    .select(
      `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at, finished_at,
       attendances ( patient_name ), queue_items ( exam_type ), profiles:responsible_id ( full_name )`,
      { count: "exact" }
    )
    .order("opened_at", { ascending: false })
    .range(0, 19);

  const { GerencialDashboard } = await import("./gerencial-dashboard");

  return (
    <GerencialDashboard
      initialItems={pipelineItems ?? []}
      initialTotal={count ?? 0}
      currentProfile={profile}
    />
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/app/(app)/pos-atendimento/gerencial/page.tsx && git commit -m "feat: add /pos-atendimento/gerencial server page"
```

---

## Task 9: SLA config editor

**Files:**
- Create: `src/app/(app)/admin/sla/page.tsx`
- Create: `src/app/(app)/admin/sla/sla-config-editor.tsx`

- [ ] **Step 1: Create the server page**

```typescript
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SUBTYPE_LABELS: Record<string, string> = {
  laudo_2d: "Laudo 2D (panorâmica, periapical, interproximal)",
  laudo_tomografia: "Laudo tomografia",
  cefalometria: "Cefalometria",
  fotografia_idoc: "Fotografia (iDoc)",
  fotografia_impressao: "Fotografia (impressão)",
  escaneamento_digital: "Escaneamento (digital)",
  escaneamento_laboratorio: "Escaneamento (laboratório externo)",
};

export default async function SlaConfigPage() {
  const { supabase } = await requireRole("admin");

  const { data: rows } = await supabase
    .from("sla_config")
    .select("id, pipeline_subtype, business_days, updated_at")
    .order("pipeline_subtype");

  const { SlaConfigEditor } = await import("./sla-config-editor");

  return (
    <SlaConfigEditor
      initialRows={(rows ?? []) as Array<{ id: string; pipeline_subtype: string; business_days: number; updated_at: string }>}
      subtypeLabels={SUBTYPE_LABELS}
    />
  );
}
```

- [ ] **Step 2: Create the editor client component**

```typescript
"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/date";

type SlaRow = {
  id: string;
  pipeline_subtype: string;
  business_days: number;
  updated_at: string;
};

type Props = {
  initialRows: SlaRow[];
  subtypeLabels: Record<string, string>;
};

export function SlaConfigEditor({ initialRows, subtypeLabels }: Props) {
  const [rows, setRows] = useState<SlaRow[]>(initialRows);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleChange(subtype: string, value: string) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 30) {
      setEdited((prev) => ({ ...prev, [subtype]: parsed }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const updates = Object.entries(edited).map(([pipeline_subtype, business_days]) => ({
      pipeline_subtype,
      business_days,
    }));

    if (updates.length === 0) {
      setSaving(false);
      return;
    }

    const response = await fetch("/api/clinic/sla-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ updates }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar configuração.");
      setSaving(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        edited[row.pipeline_subtype] !== undefined
          ? { ...row, business_days: edited[row.pipeline_subtype], updated_at: new Date().toISOString() }
          : row
      )
    );
    setEdited({});
    setSuccess(true);
    setSaving(false);
  }

  const hasChanges = Object.keys(edited).length > 0;

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Configuração de SLA</h1>
        <p className="text-sm text-slate-500">
          Defina o prazo em dias úteis para cada tipo de esteira. Novos atendimentos já usarão os valores atualizados.
        </p>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">Tipo de esteira</th>
              <th className="px-4 py-3 font-medium">Dias úteis</th>
              <th className="px-4 py-3 font-medium">Última atualização</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => {
              const currentValue = edited[row.pipeline_subtype] ?? row.business_days;
              const changed = edited[row.pipeline_subtype] !== undefined;

              return (
                <tr key={row.id} className={changed ? "bg-amber-50" : "hover:bg-slate-50/60"}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {subtypeLabels[row.pipeline_subtype] ?? row.pipeline_subtype}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={currentValue}
                      onChange={(e) => handleChange(row.pipeline_subtype, e.target.value)}
                      className="w-20 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                    <span className="ml-2 text-xs text-slate-400">dias úteis</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(row.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Configuração salva com sucesso.
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-slate-700"
        >
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/app/(app)/admin/sla && git commit -m "feat: add SLA config editor at /admin/sla"
```

---

## Task 10: Navigation links

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Update ROLE_NAVIGATION**

In `src/lib/constants.ts`, find `ROLE_NAVIGATION` and update it to:

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
    { href: "/pos-atendimento/gerencial", label: "Gerencial" },
    { href: "/admin/sla", label: "SLA" },
  ],
  gerencia: [
    { href: "/gerencia", label: "Operação" },
    { href: "/pos-atendimento/gerencial", label: "Gerencial" },
  ],
};
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/User/3D Objects/Clinic" && git add src/lib/constants.ts && git commit -m "feat: add gerencial and SLA nav links for admin and gerencia roles"
```

---

## Task 11: Full TypeScript check and smoke test

- [ ] **Step 1: Final type check**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npx tsc --noEmit 2>&1
```

Expected: zero errors. Fix any remaining issues.

- [ ] **Step 2: Run tests**

```bash
cd "c:/Users/User/3D Objects/Clinic" && npm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 3: Smoke test checklist**

1. Log in as `admin` → verify nav shows "Gerencial" and "SLA" links
2. Navigate to `/pos-atendimento/gerencial` → verify summary cards load (may show zeros if no data)
3. Verify table shows all items including finalizados
4. Test filters: type, status, overdue, finished, date range, patient search
5. Test pagination if more than 20 items
6. Click "Auditoria" on any item → verify events in chronological order with role shown
7. Click "Corrigir" on any item → verify all statuses for that type are listed, motivo required
8. Click "Reabrir" on a finalizado item → verify motivo required, action works
9. Navigate to `/admin/sla` → verify 7 rows with current values
10. Change a value, click "Salvar" → verify success message
11. Log in as `gerencia` → verify nav shows "Gerencial" but NOT "SLA"
12. Log in as `recepcao`/`atendimento` → verify neither "Gerencial" nor "SLA" appear

---

## Self-review: spec coverage check

| Spec requirement | Task |
|---|---|
| Aba/subrota gerencial para admin e gerencia | Task 8 (`/pos-atendimento/gerencial`) |
| Cards de resumo por tipo e situação | Task 7 (`GerencialDashboard.fetchSummary`) |
| Contadores: laudos, cefalo, foto, scan, geral | Task 7 (`SummaryData`) |
| Grade com TODOS os itens (incluindo finalizados) | Task 7 + Task 8 |
| `finished_at` na grade | Task 7 |
| Indicador de atraso na grade | Task 7 (`getSlaClass`) |
| Filtros: data abertura, tipo, status, atraso, finalizado, busca | Task 7 |
| Paginação 20 itens | Task 7 (`PAGE_SIZE = 20`) |
| Ação "Reabrir esteira" — admin only, motivo obrigatório | Tasks 4 + 6 + 7 |
| Ação "Corrigir status" — admin only, qualquer status do tipo | Tasks 3 + 4 + 6 + 7 |
| Evento registrado em cada ação admin | Task 4 (API route via trigger + extra event) |
| Auditoria completa com role do usuário | Task 6 (`AuditModal`) |
| Parametrização SLA em /admin | Task 9 |
| Tabela `sla_config` com 7 subtypes | Task 1 |
| Função `add_business_days` no banco | Task 1 |
| Trigger atualizado para calcular sla_deadline | Task 1 |
| TS `addBusinessDays` utilitária | Task 2 |
| Backfill de itens abertos sem sla_deadline | Tasks 1 + 5 |
| Realtime nos cards e na grade | Task 7 |
| Timezone America/Manaus em todos timestamps | Tasks 6–9 (via `formatDateTime`) |
| recepcao/atendimento NÃO veem botões de admin | Task 7 (`isAdmin` guard) |
