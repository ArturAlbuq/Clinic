# Laudo independente por exame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover `com_laudo` de um flag global em `attendances` para um flag por `queue_item`, com checkbox de laudo dentro do card de cada exame elegível na recepção.

**Architecture:** Migration SQL adiciona `com_laudo` em `queue_items` e remove de `attendances`; a RPC passa a receber um mapa por exam type; o trigger lê `NEW.com_laudo` diretamente; a UI passa de um estado global `pipelineFlags.com_laudo` para `laudoPerExam: Partial<Record<ExamType, boolean>>`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (PostgreSQL), Tailwind CSS

---

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/20260421140000_laudo_per_queue_item.sql` | Criar — migration principal |
| `src/lib/database.types.ts` | Modificar — mover `com_laudo` de `attendances` para `queue_items`; remover de `PipelineFlags` |
| `src/app/api/clinic/attendances/route.ts` | Modificar — trocar `comLaudo` por `comLaudoPerExam` |
| `src/app/(app)/recepcao/exams-section.tsx` | Modificar — adicionar checkbox de laudo por exame, remover seção Desdobramentos |
| `src/app/(app)/recepcao/reception-dashboard.tsx` | Modificar — trocar `pipelineFlags.com_laudo` por `laudoPerExam` |
| `src/components/reception-edit-attendance-card.tsx` | Modificar — adaptar para novo modelo (laudo por queue_item) |
| `src/lib/queue.test.ts` | Modificar — remover `com_laudo` do `buildAttendance`, adicionar em `buildQueueItem` |
| `src/lib/admin-report.test.ts` | Modificar — remover `com_laudo` do `buildAttendance` |

---

## Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/20260421140000_laudo_per_queue_item.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- Move com_laudo de attendances para queue_items.
-- Cada queue_item agora carrega seu proprio flag de laudo,
-- permitindo selecao independente por exame.

-- 1. Adiciona coluna em queue_items
alter table public.queue_items
  add column if not exists com_laudo boolean not null default false;

-- 2. Remove coluna de attendances
alter table public.attendances
  drop column if exists com_laudo;

-- 3. Atualiza a RPC de criacao: recebe mapa por exam type em vez de boolean global
create or replace function public.create_attendance_with_queue_items(
  p_patient_name text,
  p_priority public.attendance_priority,
  p_notes text,
  p_exam_types public.exam_type[],
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null,
  p_com_laudo_per_exam jsonb default '{}'::jsonb,
  p_com_cefalometria boolean default false,
  p_com_impressao_fotografia boolean default false,
  p_com_laboratorio_externo_escaneamento boolean default false
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  created_attendance public.attendances%rowtype;
  created_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  if public.current_app_role() not in ('recepcao', 'admin') then
    raise exception 'sem permissao para criar atendimento';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'nome do paciente invalido';
  end if;

  if char_length(trim(coalesce(p_patient_registration_number, ''))) < 1 then
    raise exception 'numero do cadastro obrigatorio';
  end if;

  if coalesce(array_length(p_exam_types, 1), 0) = 0 then
    raise exception 'selecione ao menos um exame';
  end if;

  insert into public.attendances (
    patient_name,
    patient_registration_number,
    priority,
    notes,
    created_by,
    com_cefalometria,
    com_impressao_fotografia,
    com_laboratorio_externo_escaneamento
  )
  values (
    trim(p_patient_name),
    trim(p_patient_registration_number),
    p_priority,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    coalesce(p_com_cefalometria, false),
    coalesce(p_com_impressao_fotografia, false),
    coalesce(p_com_laboratorio_externo_escaneamento, false)
  )
  returning *
  into created_attendance;

  with distinct_exam as (
    select distinct unnest(p_exam_types) as exam_type
  ),
  inserted_items as (
    insert into public.queue_items (attendance_id, exam_type, requested_quantity, com_laudo)
    select
      created_attendance.id,
      distinct_exam.exam_type,
      case
        when coalesce(p_exam_quantities, '{}'::jsonb) ? distinct_exam.exam_type::text
          then greatest(
            1,
            (coalesce(p_exam_quantities, '{}'::jsonb) ->> distinct_exam.exam_type::text)::integer
          )
        else 1
      end,
      coalesce(
        (coalesce(p_com_laudo_per_exam, '{}'::jsonb) ->> distinct_exam.exam_type::text)::boolean,
        false
      )
    from distinct_exam
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(inserted_items)), '[]'::jsonb)
  into created_queue_items
  from inserted_items;

  return jsonb_build_object(
    'attendance', to_jsonb(created_attendance),
    'queueItems', created_queue_items
  );
end;
$$;

-- 4. Atualiza a RPC de edicao: remove p_com_laudo, adiciona p_com_laudo_per_exam
create or replace function public.update_attendance_registration(
  p_attendance_id uuid,
  p_patient_name text,
  p_notes text,
  p_exam_quantities jsonb default '{}'::jsonb,
  p_patient_registration_number text default null,
  p_com_cefalometria boolean default null,
  p_com_impressao_fotografia boolean default null,
  p_com_laboratorio_externo_escaneamento boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  target_attendance public.attendances%rowtype;
  locked_item record;
  updated_queue_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  actor_role := public.current_app_role();

  if actor_role not in ('recepcao', 'admin') then
    raise exception 'sem permissao para editar atendimento';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'nome do paciente invalido';
  end if;

  if coalesce(p_exam_quantities, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'selecione ao menos um exame';
  end if;

  select *
  into target_attendance
  from public.attendances
  where id = p_attendance_id
    and deleted_at is null
    and public.user_can_access_attendance(id)
  for update;

  if target_attendance.id is null then
    raise exception 'atendimento nao encontrado';
  end if;

  if target_attendance.canceled_at is not null then
    raise exception 'atendimento cancelado nao pode ser editado';
  end if;

  if actor_role = 'recepcao' and exists (
    select 1
    from public.queue_items q
    where q.attendance_id = target_attendance.id
      and (
        q.status <> 'aguardando'
        or q.return_pending_at is not null
        or q.called_at is not null
        or q.started_at is not null
        or q.finished_at is not null
        or q.canceled_at is not null
        or q.reactivated_at is not null
      )
  ) then
    raise exception 'recepcao so pode editar atendimento antes da chamada';
  end if;

  for locked_item in
    select exam_type, requested_quantity
    from public.queue_items
    where attendance_id = target_attendance.id
      and (status <> 'aguardando' or return_pending_at is not null)
  loop
    if not coalesce(p_exam_quantities ? locked_item.exam_type::text, false) then
      raise exception 'exame % ja iniciou e nao pode ser removido', locked_item.exam_type;
    end if;

    if greatest(
      1,
      case
        when jsonb_typeof(p_exam_quantities -> locked_item.exam_type::text) = 'number'
          then (p_exam_quantities ->> locked_item.exam_type::text)::integer
        else 1
      end
    ) <> locked_item.requested_quantity then
      raise exception 'quantidade do exame % nao pode ser alterada apos iniciar', locked_item.exam_type;
    end if;
  end loop;

  update public.attendances
  set
    patient_name = trim(p_patient_name),
    patient_registration_number = nullif(trim(coalesce(p_patient_registration_number, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    com_cefalometria = coalesce(p_com_cefalometria, target_attendance.com_cefalometria),
    com_impressao_fotografia = coalesce(
      p_com_impressao_fotografia,
      target_attendance.com_impressao_fotografia
    ),
    com_laboratorio_externo_escaneamento = coalesce(
      p_com_laboratorio_externo_escaneamento,
      target_attendance.com_laboratorio_externo_escaneamento
    )
  where id = target_attendance.id
  returning *
  into target_attendance;

  delete from public.queue_items
  where attendance_id = target_attendance.id
    and status = 'aguardando'
    and return_pending_at is null;

  insert into public.queue_items (attendance_id, exam_type, requested_quantity)
  select
    target_attendance.id,
    desired.key::public.exam_type,
    greatest(
      1,
      case
        when jsonb_typeof(desired.value) = 'number'
          then desired.value::text::integer
        else 1
      end
    )
  from jsonb_each(coalesce(p_exam_quantities, '{}'::jsonb)) as desired
  where not exists (
    select 1
    from public.queue_items existing_item
    where existing_item.attendance_id = target_attendance.id
      and existing_item.exam_type::text = desired.key
  );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  into updated_queue_items
  from public.queue_items q
  where q.attendance_id = target_attendance.id;

  return jsonb_build_object(
    'attendance', to_jsonb(target_attendance),
    'queueItems', updated_queue_items
  );
end;
$$;

-- 5. Atualiza o trigger para ler NEW.com_laudo em vez de target_attendance.com_laudo
create or replace function public.handle_queue_item_pipeline_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  pipeline_created_by uuid;
  pipeline_metadata jsonb;
begin
  select *
  into target_attendance
  from public.attendances
  where id = new.attendance_id;

  if target_attendance.id is null then
    return new;
  end if;

  pipeline_created_by := coalesce(
    auth.uid(),
    new.finished_by,
    new.started_by,
    new.called_by,
    target_attendance.created_by
  );

  -- Laudo: lido do proprio queue_item (independente por exame)
  if new.com_laudo
    and new.exam_type in (
      'periapical',
      'interproximal',
      'panoramica',
      'telerradiografia',
      'tomografia'
    ) then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'laudo',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

  -- Cefalometria: continua lida da attendance (flag por cadastro)
  if target_attendance.com_cefalometria
    and new.exam_type = 'telerradiografia' then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'cefalometria',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'fotografia' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);

    if target_attendance.com_impressao_fotografia then
      pipeline_metadata := pipeline_metadata || jsonb_build_object('com_impressao', true);
    end if;

    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'fotografia',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'escaneamento_intra_oral' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);

    if target_attendance.com_laboratorio_externo_escaneamento then
      pipeline_metadata := pipeline_metadata
        || jsonb_build_object('laboratorio_externo', true);
    end if;

    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'escaneamento',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Aplicar a migration no banco (staging ou local)**

```bash
npx supabase db push
# ou, se usar CLI local:
npx supabase migration up
```

Esperado: sem erros. Confirmar que `queue_items` tem `com_laudo` e `attendances` não tem mais.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260421140000_laudo_per_queue_item.sql
git commit -m "feat: move com_laudo from attendances to queue_items"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Remover `com_laudo` de `attendances` (Row, Insert, Update)**

Em `src/lib/database.types.ts`, localizar as três ocorrências de `com_laudo: boolean` dentro do bloco `attendances` (linhas ~26, ~50, ~74) e remover cada uma.

Bloco Row antes:
```typescript
com_cefalometria: boolean
com_impressao_fotografia: boolean
com_laboratorio_externo_escaneamento: boolean
com_laudo: boolean          // ← remover esta linha
created_at: string
```

Bloco Insert antes:
```typescript
com_cefalometria?: boolean
com_impressao_fotografia?: boolean
com_laboratorio_externo_escaneamento?: boolean
com_laudo?: boolean         // ← remover esta linha
created_at?: string
```

Bloco Update antes:
```typescript
com_cefalometria?: boolean
com_impressao_fotografia?: boolean
com_laboratorio_externo_escaneamento?: boolean
com_laudo?: boolean         // ← remover esta linha
created_at?: string
```

- [ ] **Step 2: Adicionar `com_laudo` em `queue_items` (Row, Insert, Update)**

Localizar o bloco `queue_items` em `database.types.ts`. Adicionar `com_laudo: boolean` no bloco Row, `com_laudo?: boolean` nos blocos Insert e Update, em ordem alfabética junto com as outras colunas existentes.

No bloco Row de `queue_items`, adicionar após `called_by`:
```typescript
called_by: string | null
canceled_at: string | null
canceled_by: string | null
cancellation_authorized_by: string | null
cancellation_reason: string | null
com_laudo: boolean          // ← adicionar aqui
created_at: string
```

No bloco Insert de `queue_items`:
```typescript
called_by?: string | null
canceled_at?: string | null
canceled_by?: string | null
cancellation_authorized_by?: string | null
cancellation_reason?: string | null
com_laudo?: boolean         // ← adicionar aqui
created_at?: string
```

No bloco Update de `queue_items`:
```typescript
called_by?: string | null
canceled_at?: string | null
canceled_by?: string | null
cancellation_authorized_by?: string | null
cancellation_reason?: string | null
com_laudo?: boolean         // ← adicionar aqui
created_at?: string
```

- [ ] **Step 3: Atualizar `PipelineFlags` (remover `com_laudo`)**

Localizar (linha ~1101):
```typescript
export type PipelineFlags = {
  com_laudo: boolean;
  com_cefalometria: boolean;
  com_impressao_fotografia: boolean;
  com_laboratorio_externo_escaneamento: boolean;
};
```

Substituir por:
```typescript
export type PipelineFlags = {
  com_cefalometria: boolean;
  com_impressao_fotografia: boolean;
  com_laboratorio_externo_escaneamento: boolean;
};
```

- [ ] **Step 4: Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Esperado: zero erros neste arquivo. Erros em outros arquivos são esperados e serão corrigidos nas tasks seguintes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: update TypeScript types — com_laudo moves to queue_items"
```

---

## Task 3: API — rota POST de criação

**Files:**
- Modify: `src/app/api/clinic/attendances/route.ts`

- [ ] **Step 1: Atualizar `CreateAttendanceBody`**

Localizar (linha ~12):
```typescript
type CreateAttendanceBody = {
  examQuantities?: Partial<Record<ExamType, number>>;
  notes?: string;
  patientName?: string;
  patientRegistrationNumber?: string;
  priority?: AttendancePriority;
  selectedExams?: ExamType[];
  comLaudo?: boolean;
  comCefalometria?: boolean;
  comImpressaoFotografia?: boolean;
  comLaboratorioExternoEscaneamento?: boolean;
};
```

Substituir por:
```typescript
type CreateAttendanceBody = {
  examQuantities?: Partial<Record<ExamType, number>>;
  notes?: string;
  patientName?: string;
  patientRegistrationNumber?: string;
  priority?: AttendancePriority;
  selectedExams?: ExamType[];
  comLaudoPerExam?: Partial<Record<ExamType, boolean>>;
  comCefalometria?: boolean;
  comImpressaoFotografia?: boolean;
  comLaboratorioExternoEscaneamento?: boolean;
};
```

- [ ] **Step 2: Atualizar a chamada RPC no handler POST**

Localizar (linha ~329):
```typescript
const attemptWithQuantities = await supabase.rpc(
  "create_attendance_with_queue_items",
  {
    p_exam_quantities: examQuantities,
    p_exam_types: selectedExams,
    p_notes: notes || "",
    p_patient_name: patientName,
    p_patient_registration_number: patientRegistrationNumber || undefined,
    p_priority: priority,
    p_com_laudo: body.comLaudo ?? false,
    p_com_cefalometria: body.comCefalometria ?? false,
    p_com_impressao_fotografia: body.comImpressaoFotografia ?? false,
    p_com_laboratorio_externo_escaneamento: body.comLaboratorioExternoEscaneamento ?? false,
  },
);
```

Substituir por:
```typescript
const attemptWithQuantities = await supabase.rpc(
  "create_attendance_with_queue_items",
  {
    p_exam_quantities: examQuantities,
    p_exam_types: selectedExams,
    p_notes: notes || "",
    p_patient_name: patientName,
    p_patient_registration_number: patientRegistrationNumber || undefined,
    p_priority: priority,
    p_com_laudo_per_exam: body.comLaudoPerExam ?? {},
    p_com_cefalometria: body.comCefalometria ?? false,
    p_com_impressao_fotografia: body.comImpressaoFotografia ?? false,
    p_com_laboratorio_externo_escaneamento: body.comLaboratorioExternoEscaneamento ?? false,
  },
);
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem novos erros neste arquivo.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clinic/attendances/route.ts
git commit -m "feat: replace comLaudo with comLaudoPerExam in attendance API"
```

---

## Task 4: UI — ExamsSection

**Files:**
- Modify: `src/app/(app)/recepcao/exams-section.tsx`

- [ ] **Step 1: Reescrever o componente**

Substituir o conteúdo completo de `src/app/(app)/recepcao/exams-section.tsx` por:

```typescript
import { cn } from "@/lib/utils";
import {
  EXAM_LABELS,
  ROOM_EXAM_TYPES,
} from "@/lib/constants";
import type {
  ExamRoomRecord,
  ExamType,
  PipelineFlags,
} from "@/lib/database.types";

const LAUDO_EXAMS = new Set<ExamType>([
  "periapical",
  "interproximal",
  "panoramica",
  "tomografia",
]);

type ExamsSectionProps = {
  rooms: ExamRoomRecord[];
  selectedExams: ExamType[];
  examQuantities: Partial<Record<ExamType, number>>;
  onToggleExam: (examType: ExamType) => void;
  onUpdateExamQuantity: (examType: ExamType, quantity: string) => void;
  pipelineFlags: PipelineFlags;
  onTogglePipelineFlag: (flag: keyof PipelineFlags, value: boolean) => void;
  laudoPerExam: Partial<Record<ExamType, boolean>>;
  onToggleLaudo: (examType: ExamType, value: boolean) => void;
  pipelineFlagsReadOnly?: boolean;
};

export function ExamsSection({
  rooms,
  selectedExams,
  examQuantities,
  onToggleExam,
  onUpdateExamQuantity,
  pipelineFlags,
  onTogglePipelineFlag,
  laudoPerExam,
  onToggleLaudo,
  pipelineFlagsReadOnly = false,
}: ExamsSectionProps) {
  return (
    <div>
      <span className="mb-4 block text-sm font-semibold text-slate-700">
        Exames
      </span>
      <div className="space-y-4">
        {rooms.map((room) => {
          const roomExams = ROOM_EXAM_TYPES[room.slug as keyof typeof ROOM_EXAM_TYPES];
          const showCefalometria =
            room.slug === "panoramico" && selectedExams.includes("telerradiografia");
          const showImpressao =
            room.slug === "fotografia-escaneamento" && selectedExams.includes("fotografia");
          const showLaboratorio =
            room.slug === "fotografia-escaneamento" && selectedExams.includes("escaneamento_intra_oral");

          return (
            <div
              key={room.slug}
              className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{room.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Selecione os exames que entram nesta sala.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {roomExams.map((examType) => {
                  const checked = selectedExams.includes(examType);
                  const quantity = examQuantities[examType] ?? 1;
                  const showLaudo = checked && LAUDO_EXAMS.has(examType);

                  return (
                    <label
                      key={examType}
                      className={cn(
                        checked
                          ? "rounded-[22px] border border-cyan-300 bg-cyan-50 px-4 py-4"
                          : "rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4",
                        "flex items-start gap-3 cursor-pointer"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleExam(examType)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {EXAM_LABELS[examType]}
                          </p>
                          <p className="text-xs text-slate-600">
                            Vai para {room.name}
                          </p>
                        </div>
                        {checked ? (
                          <div className="flex max-w-[160px] flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Quantidade
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={quantity}
                              onChange={(event) =>
                                onUpdateExamQuantity(examType, event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                            />
                          </div>
                        ) : null}
                        {showLaudo ? (
                          <label
                            className={cn(
                              "flex items-center gap-2",
                              pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={laudoPerExam[examType] ?? false}
                              onChange={(e) => onToggleLaudo(examType, e.target.checked)}
                              disabled={pipelineFlagsReadOnly}
                              className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span className="text-sm text-slate-700">Laudo</span>
                          </label>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>

              {showCefalometria ? (
                <label className={cn("mt-3 flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_cefalometria}
                    onChange={(e) => onTogglePipelineFlag("com_cefalometria", e.target.checked)}
                    disabled={pipelineFlagsReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-700">Cefalometria</span>
                </label>
              ) : null}

              {showImpressao ? (
                <label className={cn("mt-3 flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_impressao_fotografia}
                    onChange={(e) => onTogglePipelineFlag("com_impressao_fotografia", e.target.checked)}
                    disabled={pipelineFlagsReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-700">Com impressão</span>
                </label>
              ) : null}

              {showLaboratorio ? (
                <label className={cn("mt-3 flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_laboratorio_externo_escaneamento}
                    onChange={(e) => onTogglePipelineFlag("com_laboratorio_externo_escaneamento", e.target.checked)}
                    disabled={pipelineFlagsReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-700">Laboratório externo</span>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: erros restantes apenas nos chamadores (`reception-dashboard.tsx` e `reception-edit-attendance-card.tsx`), que serão corrigidos nas tasks seguintes.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/recepcao/exams-section.tsx
git commit -m "feat: add per-exam laudo checkbox, remove Desdobramentos section"
```

---

## Task 5: UI — ReceptionDashboard

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

- [ ] **Step 1: Remover `LAUDO_EXAMS` e `com_laudo` de `PIPELINE_FLAGS_DEFAULT`**

Localizar (linha ~60):
```typescript
const PIPELINE_FLAGS_DEFAULT: PipelineFlags = {
  com_laudo: false,
  com_cefalometria: false,
  com_impressao_fotografia: false,
  com_laboratorio_externo_escaneamento: false,
};

const LAUDO_EXAMS = new Set<ExamType>([
  "periapical",
  "interproximal",
  "panoramica",
  "tomografia",
]);
```

Substituir por:
```typescript
const PIPELINE_FLAGS_DEFAULT: PipelineFlags = {
  com_cefalometria: false,
  com_impressao_fotografia: false,
  com_laboratorio_externo_escaneamento: false,
};
```

- [ ] **Step 2: Adicionar estado `laudoPerExam`**

Após a linha que declara `pipelineFlags` (linha ~112):
```typescript
const [pipelineFlags, setPipelineFlags] = useState<PipelineFlags>(PIPELINE_FLAGS_DEFAULT);
```

Adicionar imediatamente abaixo:
```typescript
const [laudoPerExam, setLaudoPerExam] = useState<Partial<Record<ExamType, boolean>>>({});
```

- [ ] **Step 3: Atualizar `toggleExam` — remover lógica de `com_laudo`**

Localizar dentro de `toggleExam` (linha ~175):
```typescript
if (isRemoving) {
  const nextSelected = selectedExams.filter((e) => e !== examType);
  setPipelineFlags((flags) => {
    const next = { ...flags };
    if (LAUDO_EXAMS.has(examType) && !nextSelected.some((e) => LAUDO_EXAMS.has(e))) {
      next.com_laudo = false;
    }
    if (examType === "telerradiografia") next.com_cefalometria = false;
    if (examType === "fotografia") next.com_impressao_fotografia = false;
    if (examType === "escaneamento_intra_oral") next.com_laboratorio_externo_escaneamento = false;
    return next;
  });
}
```

Substituir por:
```typescript
if (isRemoving) {
  setLaudoPerExam((current) => {
    const next = { ...current };
    delete next[examType];
    return next;
  });
  setPipelineFlags((flags) => {
    const next = { ...flags };
    if (examType === "telerradiografia") next.com_cefalometria = false;
    if (examType === "fotografia") next.com_impressao_fotografia = false;
    if (examType === "escaneamento_intra_oral") next.com_laboratorio_externo_escaneamento = false;
    return next;
  });
}
```

- [ ] **Step 4: Adicionar função `toggleLaudo`**

Após a função `togglePipelineFlag`:
```typescript
function togglePipelineFlag(flag: keyof PipelineFlags, value: boolean) {
  setPipelineFlags((current) => ({ ...current, [flag]: value }));
}
```

Adicionar:
```typescript
function toggleLaudo(examType: ExamType, value: boolean) {
  setLaudoPerExam((current) => ({ ...current, [examType]: value }));
}
```

- [ ] **Step 5: Atualizar `handleSubmit` — trocar `comLaudo` por `comLaudoPerExam`**

Localizar dentro de `handleSubmit` (linha ~241):
```typescript
body: JSON.stringify({
  examQuantities,
  notes,
  patientName: trimmedPatientName,
  patientRegistrationNumber: patientRegistrationNumber.trim() || null,
  priority,
  selectedExams,
  comLaudo: pipelineFlags.com_laudo,
  comCefalometria: pipelineFlags.com_cefalometria,
  comImpressaoFotografia: pipelineFlags.com_impressao_fotografia,
  comLaboratorioExternoEscaneamento: pipelineFlags.com_laboratorio_externo_escaneamento,
}),
```

Substituir por:
```typescript
body: JSON.stringify({
  examQuantities,
  notes,
  patientName: trimmedPatientName,
  patientRegistrationNumber: patientRegistrationNumber.trim() || null,
  priority,
  selectedExams,
  comLaudoPerExam: laudoPerExam,
  comCefalometria: pipelineFlags.com_cefalometria,
  comImpressaoFotografia: pipelineFlags.com_impressao_fotografia,
  comLaboratorioExternoEscaneamento: pipelineFlags.com_laboratorio_externo_escaneamento,
}),
```

- [ ] **Step 6: Resetar `laudoPerExam` após submit bem-sucedido**

Localizar o bloco de reset após submit (linha ~265):
```typescript
setPriority("normal");
setNotes("");
setPipelineFlags(PIPELINE_FLAGS_DEFAULT);
setFormSuccess("Atendimento enviado para os exames selecionados.");
```

Adicionar `setLaudoPerExam({});` junto:
```typescript
setPriority("normal");
setNotes("");
setPipelineFlags(PIPELINE_FLAGS_DEFAULT);
setLaudoPerExam({});
setFormSuccess("Atendimento enviado para os exames selecionados.");
```

- [ ] **Step 7: Passar `laudoPerExam` e `onToggleLaudo` para `ExamsSection`**

Localizar o uso de `ExamsSection` no return (linha ~342):
```typescript
<ExamsSection
  rooms={rooms}
  selectedExams={selectedExams}
  examQuantities={examQuantities}
  onToggleExam={toggleExam}
  onUpdateExamQuantity={updateExamQuantity}
  pipelineFlags={pipelineFlags}
  onTogglePipelineFlag={togglePipelineFlag}
/>
```

Substituir por:
```typescript
<ExamsSection
  rooms={rooms}
  selectedExams={selectedExams}
  examQuantities={examQuantities}
  onToggleExam={toggleExam}
  onUpdateExamQuantity={updateExamQuantity}
  pipelineFlags={pipelineFlags}
  onTogglePipelineFlag={togglePipelineFlag}
  laudoPerExam={laudoPerExam}
  onToggleLaudo={toggleLaudo}
/>
```

- [ ] **Step 8: Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem erros neste arquivo.

- [ ] **Step 9: Commit**

```bash
git add src/app/(app)/recepcao/reception-dashboard.tsx
git commit -m "feat: add laudoPerExam state to reception dashboard"
```

---

## Task 6: UI — ReceptionEditAttendanceCard

**Files:**
- Modify: `src/components/reception-edit-attendance-card.tsx`

- [ ] **Step 1: Atualizar `attendancePipelineFlags` — remover `com_laudo`**

Localizar (linha ~45):
```typescript
const attendancePipelineFlags: PipelineFlags = {
  com_laudo: attendance.com_laudo,
  com_cefalometria: attendance.com_cefalometria,
  com_impressao_fotografia: attendance.com_impressao_fotografia,
  com_laboratorio_externo_escaneamento:
    attendance.com_laboratorio_externo_escaneamento,
};
```

Substituir por:
```typescript
const attendancePipelineFlags: PipelineFlags = {
  com_cefalometria: attendance.com_cefalometria,
  com_impressao_fotografia: attendance.com_impressao_fotografia,
  com_laboratorio_externo_escaneamento:
    attendance.com_laboratorio_externo_escaneamento,
};
```

- [ ] **Step 2: Construir `laudoPerExamReadOnly` a partir dos queue_items**

Adicionar logo após a definição de `attendancePipelineFlags`:
```typescript
const laudoPerExamReadOnly = attendance.queueItems.reduce<Partial<Record<ExamType, boolean>>>(
  (acc, item) => {
    if (item.com_laudo) acc[item.exam_type] = true;
    return acc;
  },
  {},
);
```

- [ ] **Step 3: Passar `laudoPerExam` e `onToggleLaudo` para `ExamsSection` no modo de edição**

Localizar (linha ~261):
```typescript
<ExamsSection
  rooms={rooms}
  selectedExams={selectedExams}
  examQuantities={examQuantities}
  onToggleExam={toggleExam}
  onUpdateExamQuantity={updateExamQuantity}
  pipelineFlags={attendancePipelineFlags}
  onTogglePipelineFlag={noopTogglePipelineFlag}
  pipelineFlagsReadOnly
/>
```

Substituir por:
```typescript
<ExamsSection
  rooms={rooms}
  selectedExams={selectedExams}
  examQuantities={examQuantities}
  onToggleExam={toggleExam}
  onUpdateExamQuantity={updateExamQuantity}
  pipelineFlags={attendancePipelineFlags}
  onTogglePipelineFlag={noopTogglePipelineFlag}
  laudoPerExam={laudoPerExamReadOnly}
  onToggleLaudo={() => {}}
  pipelineFlagsReadOnly
/>
```

- [ ] **Step 4: Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: zero erros em todo o projeto.

- [ ] **Step 5: Commit**

```bash
git add src/components/reception-edit-attendance-card.tsx
git commit -m "feat: adapt edit card to per-exam laudo model"
```

---

## Task 7: Corrigir testes

**Files:**
- Modify: `src/lib/queue.test.ts`
- Modify: `src/lib/admin-report.test.ts`

- [ ] **Step 1: Remover `com_laudo` de `buildAttendance` em `queue.test.ts`**

Localizar (linha ~39):
```typescript
com_laudo: false,
com_cefalometria: false,
```

Substituir por:
```typescript
com_cefalometria: false,
```

- [ ] **Step 2: Adicionar `com_laudo` em `buildQueueItem` em `queue.test.ts`**

Localizar dentro de `buildQueueItem` (linha ~78):
```typescript
status: "aguardando",
updated_at: "2026-03-25T10:00:00.000Z",
updated_by: null,
```

Adicionar `com_laudo: false,` antes de `status`:
```typescript
com_laudo: false,
status: "aguardando",
updated_at: "2026-03-25T10:00:00.000Z",
updated_by: null,
```

- [ ] **Step 3: Remover `com_laudo` de `buildAttendance` em `admin-report.test.ts`**

Localizar (linha ~37):
```typescript
com_laudo: false,
com_cefalometria: false,
```

Substituir por:
```typescript
com_cefalometria: false,
```

- [ ] **Step 4: Rodar os testes**

```bash
node --import tsx/esm --test src/lib/queue.test.ts
node --import tsx/esm --test src/lib/admin-report.test.ts
```

Esperado: todos os testes passando.

- [ ] **Step 5: Compilação final**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queue.test.ts src/lib/admin-report.test.ts
git commit -m "fix: update test builders after com_laudo migration to queue_items"
```

---

## Como testar

1. Abrir a recepção (`/recepcao`)
2. Selecionar **Periapical** → deve aparecer checkbox "Laudo" dentro do card da sala
3. Selecionar também **Panorâmica** → deve aparecer checkbox "Laudo" separado no card dela
4. Marcar laudo só para Periapical, deixar Panorâmica sem laudo
5. Salvar o atendimento
6. No atendimento, finalizar o exame Periapical → pipeline de laudo deve ser criado
7. Finalizar o exame Panorâmica → **não** deve criar pipeline de laudo
8. Verificar que Cefalometria (Telerradiografia), Impressão (Fotografia) e Laboratório externo (Escaneamento) continuam funcionando normalmente
9. Confirmar que a seção "Desdobramentos" não aparece mais no formulário
