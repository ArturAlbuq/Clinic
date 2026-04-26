# Edit Exam Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que perfis `gerencia` e `admin` corrijam flags de exame (com laudo, com impressão, laboratório externo, cefalometria) pós-cadastro, sincronizando `attendances`, `queue_items` e `pipeline_items` atomicamente.

**Architecture:** RPC Postgres `correct_exam_flags` executa tudo atomicamente: atualiza as fontes de origem, fecha pipeline_items cujas flags foram desmarcadas (status `publicado_finalizado`) e cria novos pipeline_items para flags adicionadas (status `pendente_envio`). Uma nova API route `PATCH /api/clinic/attendances/[id]/correct-flags` chama a RPC. No Gerencial/Admin, um novo `CorrectFlagsModal` expõe o acesso por `pipeline_item`. Na edição de atendimento (`ReceptionEditAttendanceCard`), as flags ficam desbloqueadas para admin/gerência e ao salvar a API de flags é chamada se houver mudanças.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RPC), TypeScript, Tailwind CSS

---

## Files

**Create:**
- `supabase/migrations/20260423100000_correct_exam_flags_rpc.sql` — RPC `correct_exam_flags`
- `src/app/api/clinic/attendances/[id]/correct-flags/route.ts` — API route PATCH
- `src/app/(app)/pos-atendimento/gerencial/correct-flags-modal.tsx` — Modal do gerencial

**Modify:**
- `src/components/reception-edit-attendance-card.tsx` — desbloquear flags para admin/gerência, chamar API de flags ao salvar
- `src/components/attendance-row-expanded.tsx` — repassar `currentRole`
- `src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx` — adicionar estado e botão para o modal
- `src/lib/database.types.ts` — adicionar `correct_exam_flags` às Functions

---

## Task 1: RPC `correct_exam_flags` (migration SQL)

**Files:**
- Create: `supabase/migrations/20260423100000_correct_exam_flags_rpc.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- supabase/migrations/20260423100000_correct_exam_flags_rpc.sql

create or replace function public.correct_exam_flags(
  p_attendance_id uuid,
  p_com_cefalometria boolean,
  p_com_impressao_fotografia boolean,
  p_com_laboratorio_externo_escaneamento boolean,
  p_com_laudo_per_exam jsonb,  -- { "periapical": true, "panoramica": false, ... }
  p_reason text,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  target_attendance public.attendances%rowtype;
  v_performed_by uuid;

  -- flags antigas
  old_com_cefalometria boolean;
  old_com_impressao_fotografia boolean;
  old_com_laboratorio_externo_escaneamento boolean;

  -- helpers
  v_exam_type public.exam_type;
  v_old_laudo boolean;
  v_new_laudo boolean;
  v_queue_item_id uuid;
  v_pipeline_item_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
  v_queue_item record;
  updated_queue_items jsonb;
  updated_pipeline_items jsonb;
begin
  -- Auth
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  actor_role := public.current_app_role();
  if actor_role not in ('gerencia', 'admin') then
    raise exception 'sem permissao para corrigir flags de exame';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'motivo deve ter pelo menos 3 caracteres';
  end if;

  v_performed_by := coalesce(p_performed_by, auth.uid());

  -- Lock attendance
  select * into target_attendance
  from public.attendances
  where id = p_attendance_id and deleted_at is null
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  old_com_cefalometria                    := target_attendance.com_cefalometria;
  old_com_impressao_fotografia            := target_attendance.com_impressao_fotografia;
  old_com_laboratorio_externo_escaneamento := target_attendance.com_laboratorio_externo_escaneamento;

  -- 1. Atualiza attendances
  update public.attendances
  set
    com_cefalometria                     = p_com_cefalometria,
    com_impressao_fotografia             = p_com_impressao_fotografia,
    com_laboratorio_externo_escaneamento = p_com_laboratorio_externo_escaneamento
  where id = p_attendance_id
  returning * into target_attendance;

  -- 2. Atualiza queue_items.com_laudo e gerencia pipeline_items de laudo
  for v_queue_item in
    select qi.id, qi.exam_type, qi.com_laudo
    from public.queue_items qi
    where qi.attendance_id = p_attendance_id
      and qi.exam_type in ('periapical','interproximal','panoramica','tomografia')
      and qi.deleted_at is null
  loop
    v_new_laudo := coalesce(
      (p_com_laudo_per_exam ->> v_queue_item.exam_type::text)::boolean,
      v_queue_item.com_laudo
    );

    if v_new_laudo is distinct from v_queue_item.com_laudo then
      update public.queue_items
      set com_laudo = v_new_laudo
      where id = v_queue_item.id;

      if not v_new_laudo then
        -- Fecha pipeline_item de laudo vinculado a este queue_item
        update public.pipeline_items
        set
          status   = 'publicado_finalizado',
          notes    = p_reason,
          metadata = metadata || jsonb_build_object('flag_correction', true)
        where id in (
          select piqi.pipeline_item_id
          from public.pipeline_item_queue_items piqi
          join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
          where piqi.queue_item_id = v_queue_item.id
            and pi.pipeline_type = 'laudo'
            and pi.finished_at is null
        );
      else
        -- Cria novo pipeline_item de laudo se o exame ja foi finalizado
        if exists (
          select 1 from public.queue_items
          where id = v_queue_item.id and status = 'finalizado'
        ) then
          v_sla_subtype := public.resolve_sla_subtype(
            'laudo'::public.pipeline_type,
            jsonb_build_object('source_exam_type', v_queue_item.exam_type)
          );
          v_business_days := null;
          v_sla_deadline  := null;

          if v_sla_subtype is not null then
            select business_days into v_business_days
            from public.sla_config where pipeline_subtype = v_sla_subtype;
          end if;

          if v_business_days is not null then
            v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
          end if;

          insert into public.pipeline_items (
            attendance_id, queue_item_id, pipeline_type, status,
            metadata, notes, created_by, sla_deadline
          ) values (
            p_attendance_id, v_queue_item.id, 'laudo',
            'pendente_envio',
            jsonb_build_object(
              'source_exam_type', v_queue_item.exam_type,
              'flag_correction', true
            ),
            p_reason,
            v_performed_by,
            v_sla_deadline
          )
          returning id into v_pipeline_item_id;

          insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
          values (v_pipeline_item_id, v_queue_item.id)
          on conflict do nothing;
        end if;
      end if;
    end if;
  end loop;

  -- 3. Cefalometria
  if p_com_cefalometria is distinct from old_com_cefalometria then
    if not p_com_cefalometria then
      -- Fecha
      update public.pipeline_items
      set
        status   = 'publicado_finalizado',
        notes    = p_reason,
        metadata = metadata || jsonb_build_object('flag_correction', true)
      where attendance_id = p_attendance_id
        and pipeline_type = 'cefalometria'
        and finished_at is null;
    else
      -- Cria se houver queue_item de telerradiografia finalizado
      select id into v_queue_item_id
      from public.queue_items
      where attendance_id = p_attendance_id
        and exam_type = 'telerradiografia'
        and status = 'finalizado'
        and deleted_at is null
      limit 1;

      if v_queue_item_id is not null then
        v_sla_subtype := public.resolve_sla_subtype(
          'cefalometria'::public.pipeline_type,
          jsonb_build_object('source_exam_type', 'telerradiografia')
        );
        v_business_days := null;
        v_sla_deadline  := null;

        if v_sla_subtype is not null then
          select business_days into v_business_days
          from public.sla_config where pipeline_subtype = v_sla_subtype;
        end if;

        if v_business_days is not null then
          v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
        end if;

        insert into public.pipeline_items (
          attendance_id, queue_item_id, pipeline_type, status,
          metadata, notes, created_by, sla_deadline
        ) values (
          p_attendance_id, v_queue_item_id, 'cefalometria',
          'pendente_envio',
          jsonb_build_object(
            'source_exam_type', 'telerradiografia',
            'flag_correction', true
          ),
          p_reason,
          v_performed_by,
          v_sla_deadline
        );
      end if;
    end if;
  end if;

  -- 4. Fotografia / com_impressao
  if p_com_impressao_fotografia is distinct from old_com_impressao_fotografia then
    -- Atualiza metadata do pipeline_item de fotografia aberto
    update public.pipeline_items
    set metadata = metadata
      || jsonb_build_object('com_impressao', p_com_impressao_fotografia)
      || jsonb_build_object('flag_correction', true),
      notes = p_reason
    where attendance_id = p_attendance_id
      and pipeline_type = 'fotografia'
      and finished_at is null;

    -- Se desmarcou e havia pipeline_item: fecha
    if not p_com_impressao_fotografia then
      update public.pipeline_items
      set
        status   = 'publicado_finalizado',
        notes    = p_reason,
        metadata = metadata || jsonb_build_object('flag_correction', true)
      where attendance_id = p_attendance_id
        and pipeline_type = 'fotografia'
        and finished_at is null;
    elsif p_com_impressao_fotografia and old_com_impressao_fotografia = false then
      -- Marcou: se nao existir pipeline_item aberto de fotografia, cria
      if not exists (
        select 1 from public.pipeline_items
        where attendance_id = p_attendance_id
          and pipeline_type = 'fotografia'
          and finished_at is null
      ) then
        select id into v_queue_item_id
        from public.queue_items
        where attendance_id = p_attendance_id
          and exam_type = 'fotografia'
          and status = 'finalizado'
          and deleted_at is null
        limit 1;

        if v_queue_item_id is not null then
          insert into public.pipeline_items (
            attendance_id, queue_item_id, pipeline_type, status,
            metadata, notes, created_by
          ) values (
            p_attendance_id, v_queue_item_id, 'fotografia',
            'pendente_envio',
            jsonb_build_object(
              'source_exam_type', 'fotografia',
              'com_impressao', true,
              'flag_correction', true
            ),
            p_reason,
            v_performed_by
          );
        end if;
      end if;
    end if;
  end if;

  -- 5. Escaneamento / laboratorio_externo
  if p_com_laboratorio_externo_escaneamento is distinct from old_com_laboratorio_externo_escaneamento then
    -- Atualiza metadata do pipeline_item de escaneamento aberto
    update public.pipeline_items
    set metadata = metadata
      || jsonb_build_object('laboratorio_externo', p_com_laboratorio_externo_escaneamento)
      || jsonb_build_object('flag_correction', true),
      notes = p_reason
    where attendance_id = p_attendance_id
      and pipeline_type = 'escaneamento'
      and finished_at is null;

    if not p_com_laboratorio_externo_escaneamento then
      update public.pipeline_items
      set
        status   = 'publicado_finalizado',
        notes    = p_reason,
        metadata = metadata || jsonb_build_object('flag_correction', true)
      where attendance_id = p_attendance_id
        and pipeline_type = 'escaneamento'
        and finished_at is null;
    elsif p_com_laboratorio_externo_escaneamento and old_com_laboratorio_externo_escaneamento = false then
      if not exists (
        select 1 from public.pipeline_items
        where attendance_id = p_attendance_id
          and pipeline_type = 'escaneamento'
          and finished_at is null
      ) then
        select id into v_queue_item_id
        from public.queue_items
        where attendance_id = p_attendance_id
          and exam_type = 'escaneamento_intra_oral'
          and status = 'finalizado'
          and deleted_at is null
        limit 1;

        if v_queue_item_id is not null then
          insert into public.pipeline_items (
            attendance_id, queue_item_id, pipeline_type, status,
            metadata, notes, created_by
          ) values (
            p_attendance_id, v_queue_item_id, 'escaneamento',
            'pendente_envio',
            jsonb_build_object(
              'source_exam_type', 'escaneamento_intra_oral',
              'laboratorio_externo', true,
              'flag_correction', true
            ),
            p_reason,
            v_performed_by
          );
        end if;
      end if;
    end if;
  end if;

  -- Retorno
  select coalesce(jsonb_agg(to_jsonb(qi) order by qi.created_at), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items qi
  where qi.attendance_id = p_attendance_id;

  select coalesce(jsonb_agg(to_jsonb(pi) order by pi.opened_at), '[]'::jsonb)
  into updated_pipeline_items
  from public.pipeline_items pi
  where pi.attendance_id = p_attendance_id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItems', updated_queue_items,
    'pipelineItems', updated_pipeline_items
  );
end;
$$;
```

- [ ] **Step 2: Aplicar a migration**

```bash
npx supabase db push
```

Expected: Migration aplicada sem erros. Se usar Supabase local:
```bash
npx supabase db reset
```

- [ ] **Step 3: Testar a RPC manualmente no Supabase Studio**

No SQL Editor do Supabase, execute com um `attendance_id` existente:
```sql
select public.correct_exam_flags(
  '<attendance_id_real>',
  false,  -- com_cefalometria
  false,  -- com_impressao_fotografia
  false,  -- com_laboratorio_externo
  '{}',   -- com_laudo_per_exam
  'Teste de correcao de flags'
);
```
Expected: retorna JSON com `attendance`, `queueItems`, `pipelineItems`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260423100000_correct_exam_flags_rpc.sql
git commit -m "feat: add correct_exam_flags RPC"
```

---

## Task 2: API Route `PATCH /api/clinic/attendances/[id]/correct-flags`

**Files:**
- Create: `src/app/api/clinic/attendances/[id]/correct-flags/route.ts`

- [ ] **Step 1: Criar a route**

```typescript
// src/app/api/clinic/attendances/[id]/correct-flags/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import type { ExamType } from "@/lib/database.types";

type CorrectFlagsBody = {
  comCefalometria: boolean;
  comImpressaoFotografia: boolean;
  comLaboratorioExternoEscaneamento: boolean;
  comLaudoPerExam: Partial<Record<ExamType, boolean>>;
  reason: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }

  const { supabase } = await requireRole(["gerencia", "admin"]);
  const { id } = await context.params;

  let body: CorrectFlagsBody | null = null;
  try {
    body = (await request.json()) as CorrectFlagsBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body) {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  const reason = body.reason?.trim() ?? "";
  if (reason.length < 3) {
    return jsonError("Motivo deve ter pelo menos 3 caracteres.", 400);
  }

  const { data, error } = await supabase.rpc("correct_exam_flags", {
    p_attendance_id: id,
    p_com_cefalometria: body.comCefalometria,
    p_com_impressao_fotografia: body.comImpressaoFotografia,
    p_com_laboratorio_externo_escaneamento: body.comLaboratorioExternoEscaneamento,
    p_com_laudo_per_exam: body.comLaudoPerExam ?? {},
    p_reason: reason,
  });

  if (error || !data) {
    logServerError("correct_exam_flags.rpc", error);

    const msg = error?.message ?? "";
    if (msg.includes("sem permissao")) {
      return jsonError("Voce nao tem permissao para esta acao.", 403);
    }
    if (msg.includes("atendimento nao encontrado")) {
      return jsonError("Atendimento nao encontrado.", 404);
    }
    if (msg.includes("motivo deve ter")) {
      return jsonError("Motivo deve ter pelo menos 3 caracteres.", 400);
    }

    return jsonError("Nao foi possivel corrigir as flags.", 400);
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Verificar que a route compila**

```bash
npx tsc --noEmit
```

Expected: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clinic/attendances/[id]/correct-flags/route.ts
git commit -m "feat: add PATCH correct-flags API route"
```

---

## Task 3: `CorrectFlagsModal` no Gerencial

**Files:**
- Create: `src/app/(app)/pos-atendimento/gerencial/correct-flags-modal.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/app/(app)/pos-atendimento/gerencial/correct-flags-modal.tsx
"use client";

import { useState } from "react";
import type { ExamType, PipelineType } from "@/lib/database.types";
import { EXAM_LABELS } from "@/lib/constants";

const LAUDO_EXAMS: ExamType[] = ["periapical", "interproximal", "panoramica", "tomografia"];

type CorrectFlagsModalProps = {
  attendanceId: string;
  patientName: string;
  pipelineType: PipelineType;
  currentFlags: {
    comCefalometria: boolean;
    comImpressaoFotografia: boolean;
    comLaboratorioExternoEscaneamento: boolean;
    comLaudoPerExam: Partial<Record<ExamType, boolean>>;
  };
  onConfirm: (flags: {
    comCefalometria: boolean;
    comImpressaoFotografia: boolean;
    comLaboratorioExternoEscaneamento: boolean;
    comLaudoPerExam: Partial<Record<ExamType, boolean>>;
    reason: string;
  }) => Promise<void>;
  onClose: () => void;
};

export function CorrectFlagsModal({
  patientName,
  pipelineType,
  currentFlags,
  onConfirm,
  onClose,
}: CorrectFlagsModalProps) {
  const [comCefalometria, setComCefalometria] = useState(currentFlags.comCefalometria);
  const [comImpressaoFotografia, setComImpressaoFotografia] = useState(
    currentFlags.comImpressaoFotografia,
  );
  const [comLaboratorioExternoEscaneamento, setComLaboratorioExternoEscaneamento] = useState(
    currentFlags.comLaboratorioExternoEscaneamento,
  );
  const [comLaudoPerExam, setComLaudoPerExam] = useState(currentFlags.comLaudoPerExam);
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
      await onConfirm({
        comCefalometria,
        comImpressaoFotografia,
        comLaboratorioExternoEscaneamento,
        comLaudoPerExam,
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao corrigir flags.");
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
            Corrigir marcações — {patientName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Ação de correção — será registrada em auditoria. Flags incorretas podem
          criar ou fechar itens na esteira automaticamente.
        </p>

        <div className="mb-4 space-y-3">
          {pipelineType === "laudo" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Laudo por exame:</p>
              {LAUDO_EXAMS.map((exam) => (
                <label key={exam} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={comLaudoPerExam[exam] ?? false}
                    onChange={(e) =>
                      setComLaudoPerExam((prev) => ({
                        ...prev,
                        [exam]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                  />
                  <span className="text-sm text-slate-700">{EXAM_LABELS[exam]}</span>
                </label>
              ))}
            </div>
          )}

          {pipelineType === "cefalometria" && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={comCefalometria}
                onChange={(e) => setComCefalometria(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600"
              />
              <span className="text-sm text-slate-700">Com cefalometria</span>
            </label>
          )}

          {pipelineType === "fotografia" && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={comImpressaoFotografia}
                onChange={(e) => setComImpressaoFotografia(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600"
              />
              <span className="text-sm text-slate-700">Com impressão</span>
            </label>
          )}

          {pipelineType === "escaneamento" && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={comLaboratorioExternoEscaneamento}
                onChange={(e) => setComLaboratorioExternoEscaneamento(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600"
              />
              <span className="text-sm text-slate-700">Laboratório externo</span>
            </label>
          )}
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
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-amber-700"
          >
            {submitting ? "Salvando..." : "Confirmar correção"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/pos-atendimento/gerencial/correct-flags-modal.tsx
git commit -m "feat: add CorrectFlagsModal component"
```

---

## Task 4: Integrar `CorrectFlagsModal` no `GerencialDashboard`

**Files:**
- Modify: `src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx`

O dashboard precisa:
1. Novo estado `correctFlagsTarget`
2. Função `handleCorrectFlags` que chama a API
3. Botão "Flags" na coluna de ações
4. Renderizar o modal

- [ ] **Step 1: Adicionar imports**

No topo de `gerencial-dashboard.tsx`, adicionar ao bloco de imports locais:
```typescript
import { CorrectFlagsModal } from "./correct-flags-modal";
```

E garantir que `ExamType` está importado de `@/lib/database.types` (já deve estar via `Database` — se não, adicionar explicitamente):
```typescript
import type { Database, ExamType } from "@/lib/database.types";
```

- [ ] **Step 2: Adicionar estado `correctFlagsTarget`**

Logo após a declaração de `correctTarget` (linha ~93), adicionar:
```typescript
const [correctFlagsTarget, setCorrectFlagsTarget] = useState<PipelineItemRow | null>(null);
```

- [ ] **Step 3: Adicionar função `handleCorrectFlags`**

Logo após o bloco `handleAdminAction`, adicionar:
```typescript
const handleCorrectFlags = useCallback(
  async (flags: {
    comCefalometria: boolean;
    comImpressaoFotografia: boolean;
    comLaboratorioExternoEscaneamento: boolean;
    comLaudoPerExam: Partial<Record<ExamType, boolean>>;
    reason: string;
  }) => {
    if (!correctFlagsTarget) return;

    const response = await fetch(
      `/api/clinic/attendances/${correctFlagsTarget.attendance_id}/correct-flags`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(flags),
      },
    );

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "Erro ao corrigir flags.");
    }

    await fetchPage(page);
    await fetchSummary();
  },
  [correctFlagsTarget, fetchPage, fetchSummary, page],
);
```

- [ ] **Step 4: Adicionar botão "Flags" na coluna de ações**

Na `<td>` de ações, após o botão "Corrigir" existente, adicionar:
```typescript
{(isAdmin || currentProfile.role === "gerencia") && (
  <button
    onClick={() => setCorrectFlagsTarget(item)}
    className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
  >
    Flags
  </button>
)}
```

- [ ] **Step 5: Renderizar o `CorrectFlagsModal`**

No final do JSX retornado, após o bloco `{correctTarget && (<CorrectStatusModal .../>)}`, adicionar:
```typescript
{correctFlagsTarget && (
  <CorrectFlagsModal
    attendanceId={correctFlagsTarget.attendance_id}
    patientName={correctFlagsTarget.attendances?.patient_name ?? "Paciente"}
    pipelineType={correctFlagsTarget.pipeline_type}
    currentFlags={{
      comCefalometria: Boolean(
        (correctFlagsTarget.metadata as Record<string, unknown>)?.source_exam_type === "telerradiografia",
      ),
      comImpressaoFotografia: Boolean(
        (correctFlagsTarget.metadata as Record<string, unknown>)?.com_impressao,
      ),
      comLaboratorioExternoEscaneamento: Boolean(
        (correctFlagsTarget.metadata as Record<string, unknown>)?.laboratorio_externo,
      ),
      comLaudoPerExam: correctFlagsTarget.pipeline_type === "laudo"
        ? Object.fromEntries(
            correctFlagsTarget.exams.map((e) => [e.exam_type, true]),
          )
        : {},
    }}
    onConfirm={handleCorrectFlags}
    onClose={() => setCorrectFlagsTarget(null)}
  />
)}
```

- [ ] **Step 6: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx
git commit -m "feat: integrate CorrectFlagsModal into GerencialDashboard"
```

---

## Task 5: Flags editáveis na edição de atendimento (Admin/Gerência)

**Files:**
- Modify: `src/components/reception-edit-attendance-card.tsx`
- Modify: `src/components/attendance-row-expanded.tsx`

O objetivo é: quando `currentRole` for `admin` ou `gerencia`, as flags ficam desbloqueadas e ao salvar, se houver mudança, chama também a rota `/correct-flags`.

- [ ] **Step 1: Atualizar `AttendanceRowExpanded` para repassar `currentRole`**

Em `src/components/attendance-row-expanded.tsx`, adicionar `currentRole` ao tipo e ao componente:

```typescript
// Adicionar ao tipo AttendanceRowExpandedProps:
currentRole?: string;

// No corpo do componente, repassar para ReceptionEditAttendanceCard:
<ReceptionEditAttendanceCard
  attendance={attendance}
  isToday={isToday}
  rooms={rooms}
  currentRole={currentRole}
  onAttendanceSaved={onAttendanceSaved}
/>
```

- [ ] **Step 2: Passar `currentRole` de quem usa `AttendanceRowExpanded`**

Buscar todos os usos de `AttendanceRowExpanded` no codebase:
```bash
grep -r "AttendanceRowExpanded" src --include="*.tsx" -l
```

Para cada arquivo encontrado, passar `currentRole` vindo do perfil do usuário logado. Em `reception-dashboard.tsx`, o `currentRole` vem via props do server component. Adicionar `currentRole` ao tipo `ReceptionDashboardProps` e repassar até `AttendanceRowExpanded`.

- [ ] **Step 3: Atualizar `ReceptionEditAttendanceCard` para aceitar `currentRole`**

Em `src/components/reception-edit-attendance-card.tsx`:

**a) Adicionar ao tipo:**
```typescript
type ReceptionEditAttendanceCardProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  rooms: ExamRoomRecord[];
  currentRole?: string;
  onAttendanceSaved: (
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) => void;
};
```

**b) Desestruturar o novo prop:**
```typescript
export function ReceptionEditAttendanceCard({
  attendance,
  isToday,
  rooms,
  currentRole,
  onAttendanceSaved,
}: ReceptionEditAttendanceCardProps) {
```

**c) Calcular se pode editar flags:**
```typescript
const canEditFlags = currentRole === "admin" || currentRole === "gerencia";
```

**d) Adicionar estado para flags editáveis (logo após os estados existentes de `selectedExams`/`examQuantities`):**
```typescript
const [pipelineFlags, setPipelineFlags] = useState<PipelineFlags>({
  com_cefalometria: attendance.com_cefalometria,
  com_impressao_fotografia: attendance.com_impressao_fotografia,
  com_laboratorio_externo_escaneamento: attendance.com_laboratorio_externo_escaneamento,
});
const [laudoPerExam, setLaudoPerExam] = useState<Partial<Record<ExamType, boolean>>>(
  attendance.queueItems.reduce<Partial<Record<ExamType, boolean>>>((acc, item) => {
    if (item.com_laudo) acc[item.exam_type] = true;
    return acc;
  }, {}),
);
const [flagsReason, setFlagsReason] = useState("");
```

**e) Resetar os novos estados no `resetForm`:**
```typescript
function resetForm() {
  setPatientName(attendance.patient_name);
  setPatientRegistrationNumber(attendance.patient_registration_number ?? "");
  setNotes(attendance.notes ?? "");
  setSelectedExams(initialSelectedExams);
  setExamQuantities(initialExamQuantities);
  setMutationError("");
  setPipelineFlags({
    com_cefalometria: attendance.com_cefalometria,
    com_impressao_fotografia: attendance.com_impressao_fotografia,
    com_laboratorio_externo_escaneamento: attendance.com_laboratorio_externo_escaneamento,
  });
  setLaudoPerExam(
    attendance.queueItems.reduce<Partial<Record<ExamType, boolean>>>((acc, item) => {
      if (item.com_laudo) acc[item.exam_type] = true;
      return acc;
    }, {}),
  );
  setFlagsReason("");
}
```

**f) Detectar mudança nas flags:**
```typescript
function hasFlagsChanged(): boolean {
  if (pipelineFlags.com_cefalometria !== attendance.com_cefalometria) return true;
  if (pipelineFlags.com_impressao_fotografia !== attendance.com_impressao_fotografia) return true;
  if (
    pipelineFlags.com_laboratorio_externo_escaneamento !==
    attendance.com_laboratorio_externo_escaneamento
  )
    return true;
  for (const item of attendance.queueItems) {
    if ((laudoPerExam[item.exam_type] ?? false) !== item.com_laudo) return true;
  }
  return false;
}
```

**g) Atualizar `submitEdit` para chamar `/correct-flags` quando necessário:**
```typescript
async function submitEdit() {
  setMutationError("");

  if (patientName.trim().length < 2) {
    setMutationError("Informe um nome de paciente valido.");
    return;
  }

  if (!patientRegistrationNumber.trim()) {
    setMutationError("Informe o numero do cadastro do paciente.");
    return;
  }

  if (!selectedExams.length) {
    setMutationError("Selecione ao menos um exame.");
    return;
  }

  if (canEditFlags && hasFlagsChanged() && flagsReason.trim().length < 3) {
    setMutationError("Informe o motivo da correção das marcações (mínimo 3 caracteres).");
    return;
  }

  setIsSaving(true);

  const selectedExamQuantities = selectedExams.reduce<Partial<Record<ExamType, number>>>(
    (accumulator, examType) => {
      accumulator[examType] = examQuantities[examType] ?? 1;
      return accumulator;
    },
    {},
  );

  const response = await fetch(`/api/clinic/attendances/${attendance.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      examQuantities: selectedExamQuantities,
      notes,
      patientName,
      patientRegistrationNumber,
    }),
  });

  const payload = (await readJsonResponse<{
    attendance?: AttendanceRecord;
    error?: string;
    queueItems?: QueueItemRecord[];
  }>(response)) ?? { error: "Nao foi possivel atualizar o cadastro." };

  if (!response.ok || !payload.attendance) {
    setMutationError(payload.error || "Nao foi possivel atualizar o cadastro.");
    setIsSaving(false);
    return;
  }

  // Se flags mudaram, chama correct-flags
  if (canEditFlags && hasFlagsChanged()) {
    const flagsResponse = await fetch(
      `/api/clinic/attendances/${attendance.id}/correct-flags`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          comCefalometria: pipelineFlags.com_cefalometria,
          comImpressaoFotografia: pipelineFlags.com_impressao_fotografia,
          comLaboratorioExternoEscaneamento:
            pipelineFlags.com_laboratorio_externo_escaneamento,
          comLaudoPerExam: laudoPerExam,
          reason: flagsReason.trim(),
        }),
      },
    );

    if (!flagsResponse.ok) {
      const flagsPayload = (await readJsonResponse<{ error?: string }>(
        flagsResponse,
      )) ?? {};
      setMutationError(
        `Cadastro salvo, mas erro ao corrigir marcações: ${flagsPayload.error ?? "tente novamente."}`,
      );
      // Ainda notifica o parent com o que foi salvo no cadastro
      onAttendanceSaved(
        payload.attendance as AttendanceRecord,
        (payload.queueItems ?? []) as QueueItemRecord[],
      );
      setIsEditing(false);
      setIsSaving(false);
      return;
    }
  }

  onAttendanceSaved(
    payload.attendance as AttendanceRecord,
    (payload.queueItems ?? []) as QueueItemRecord[],
  );
  setIsEditing(false);
  setIsSaving(false);
}
```

**h) Atualizar o JSX do `ExamsSection` para desbloquear flags:**

Substituir as props `pipelineFlagsReadOnly`, `onTogglePipelineFlag` e `onToggleLaudo` por versões condicionais:
```typescript
<ExamsSection
  rooms={rooms}
  selectedExams={selectedExams}
  examQuantities={examQuantities}
  onToggleExam={toggleExam}
  onUpdateExamQuantity={updateExamQuantity}
  pipelineFlags={pipelineFlags}
  onTogglePipelineFlag={
    canEditFlags
      ? (flag, value) => setPipelineFlags((prev) => ({ ...prev, [flag]: value }))
      : () => {}
  }
  laudoPerExam={laudoPerExam}
  onToggleLaudo={
    canEditFlags
      ? (examType, value) =>
          setLaudoPerExam((prev) => ({ ...prev, [examType]: value }))
      : () => {}
  }
  pipelineFlagsReadOnly={!canEditFlags}
/>
```

**i) Adicionar campo de motivo quando flags estiverem habilitadas e tiverem mudado:**

No bloco `{isEditing ? (...)  : null}`, após o `<ExamsSection>`, adicionar:
```typescript
{canEditFlags && hasFlagsChanged() && (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-700">
      Motivo da correção das marcações{" "}
      <span className="text-rose-500">*</span>
    </span>
    <input
      type="text"
      value={flagsReason}
      onChange={(e) => setFlagsReason(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
      placeholder="Ex.: marcado incorretamente no cadastro"
    />
  </label>
)}
```

- [ ] **Step 4: Verificar que passa em tsc**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/reception-edit-attendance-card.tsx src/components/attendance-row-expanded.tsx
git commit -m "feat: unlock pipeline flags editing for admin/gerencia in attendance edit form"
```

---

## Task 6: Passar `currentRole` do server component para os dashboards

**Files:**
- Modify: `src/app/(app)/recepcao/page.tsx`
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

O `currentRole` precisa chegar desde o server component até `AttendanceRowExpanded`. Em `ReceptionDashboard`, o role vem via props.

- [ ] **Step 1: Verificar como `reception-dashboard` recebe dados do server**

```bash
grep -n "currentProfile\|currentRole\|profile" "src/app/(app)/recepcao/page.tsx"
```

- [ ] **Step 2: Adicionar `currentRole` ao tipo `ReceptionDashboardProps`**

Em `src/app/(app)/recepcao/reception-dashboard.tsx`, adicionar ao tipo:
```typescript
currentRole: string;
```

- [ ] **Step 3: Passar até `AttendanceRowExpanded`**

Em `reception-dashboard.tsx`, onde `AttendanceRowExpanded` é renderizado, adicionar:
```typescript
<AttendanceRowExpanded
  ...
  currentRole={currentRole}
/>
```

- [ ] **Step 4: No server component `src/app/(app)/recepcao/page.tsx`, passar o role**

Verificar a estrutura atual do arquivo e adicionar `currentRole={profile.role}` ao `<ReceptionDashboard .../>`.

- [ ] **Step 5: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/recepcao/page.tsx src/app/(app)/recepcao/reception-dashboard.tsx
git commit -m "feat: propagate currentRole to AttendanceRowExpanded for flags editing"
```

---

## Task 7: Verificação final

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Expected: Build concluído sem erros.

- [ ] **Step 2: Testar fluxo no Gerencial**

1. Login como admin ou gerência
2. Navegar para `/pos-atendimento/gerencial`
3. Localizar um pipeline_item de tipo `fotografia`
4. Clicar em "Flags"
5. Marcar/desmarcar "Com impressão", informar motivo, confirmar
6. Verificar que o pipeline_item foi fechado ou criado corretamente na tabela
7. Verificar em `pipeline_events` que o evento foi registrado com o motivo

- [ ] **Step 3: Testar fluxo na edição de atendimento**

1. Login como admin
2. Navegar para `/recepcao` ou buscar atendimento
3. Expandir um atendimento com exames de laudo
4. Clicar "Editar cadastro"
5. Verificar que as flags de laudo estão desbloqueadas
6. Desmarcar um laudo, informar motivo, salvar
7. Verificar que o pipeline_item de laudo correspondente foi fechado

- [ ] **Step 4: Commit final**

```bash
git commit --allow-empty -m "feat: complete exam flags correction feature"
```
