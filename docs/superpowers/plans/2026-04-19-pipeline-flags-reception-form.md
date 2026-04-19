# Pipeline Flags — Formulário de Cadastro da Recepção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 4 checkboxes condicionais ao formulário de cadastro da recepção (`com_laudo`, `com_cefalometria`, `com_impressao_fotografia`, `com_laboratorio_externo_escaneamento`) que aparecem apenas quando o exame correspondente está selecionado, e persistir esses flags no banco via RPC já existente.

**Architecture:** O estado dos flags vive em `reception-dashboard.tsx` junto com o restante do estado do formulário. `exams-section.tsx` recebe os flags e callbacks como props e renderiza os checkboxes condicionais inline. A API route recebe os flags no body e os passa para o RPC `create_attendance_with_queue_items` que já os suporta no staging.

**Tech Stack:** Next.js App Router, TypeScript estrito, Tailwind CSS, Supabase RPC via fetch client-side.

---

## Mapa de arquivos

| Arquivo | Ação | O que muda |
|---|---|---|
| `src/app/(app)/recepcao/reception-dashboard.tsx` | Modificar | Estado `pipelineFlags`, reset automático em `toggleExam`, reset no submit, novas props para `ExamsSection`, flags no payload |
| `src/app/(app)/recepcao/exams-section.tsx` | Modificar | Novas props `pipelineFlags` e `onTogglePipelineFlag`, renderização condicional dos checkboxes, área comum para `com_laudo` |
| `src/app/api/clinic/attendances/route.ts` | Modificar | `CreateAttendanceBody` com 4 campos opcionais, parâmetros `p_com_*` na chamada RPC |

---

## Task 1: Adicionar tipo `PipelineFlags` e estado em `reception-dashboard.tsx`

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

- [ ] **Step 1: Adicionar o tipo `PipelineFlags` e o estado inicial**

Abrir `src/app/(app)/recepcao/reception-dashboard.tsx`. Logo após a linha `const [notes, setNotes] = useState("");` (linha ~96), adicionar:

```tsx
type PipelineFlags = {
  com_laudo: boolean;
  com_cefalometria: boolean;
  com_impressao_fotografia: boolean;
  com_laboratorio_externo_escaneamento: boolean;
};

const PIPELINE_FLAGS_DEFAULT: PipelineFlags = {
  com_laudo: false,
  com_cefalometria: false,
  com_impressao_fotografia: false,
  com_laboratorio_externo_escaneamento: false,
};
```

E logo após `const [notes, setNotes] = useState("");`:

```tsx
const [pipelineFlags, setPipelineFlags] = useState<PipelineFlags>(PIPELINE_FLAGS_DEFAULT);
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit
```

Expected: zero erros (ou apenas erros pré-existentes não relacionados a este arquivo).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: add PipelineFlags type and state to reception form"
```

---

## Task 2: Reset automático dos flags ao desmarcar exame

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

- [ ] **Step 1: Atualizar a função `toggleExam` para resetar flags quando o exame é desmarcado**

Substituir a função `toggleExam` atual (linhas ~141-162) pela versão abaixo:

```tsx
const LAUDO_EXAMS = new Set<ExamType>([
  "periapical",
  "interproximal",
  "panoramica",
  "tomografia",
]);

function toggleExam(examType: ExamType) {
  setSelectedExams((current) => {
    const alreadySelected = current.includes(examType);

    if (alreadySelected) {
      setExamQuantities((currentQuantities) => {
        const nextQuantities = { ...currentQuantities };
        delete nextQuantities[examType];
        return nextQuantities;
      });

      const nextSelected = current.filter((entry) => entry !== examType);

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

      return nextSelected;
    }

    setExamQuantities((currentQuantities) => ({
      ...currentQuantities,
      [examType]: currentQuantities[examType] ?? 1,
    }));

    return [...current, examType];
  });
}
```

Adicionar `LAUDO_EXAMS` fora do componente (antes da função `ReceptionDashboard`).

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: auto-reset pipeline flags when exam is deselected"
```

---

## Task 3: Reset dos flags no submit bem-sucedido

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

- [ ] **Step 1: Adicionar reset de `pipelineFlags` após submit bem-sucedido**

Dentro de `handleSubmit`, logo após `setNotes("")` (no bloco de reset pós-sucesso, linhas ~231-238), adicionar:

```tsx
setPipelineFlags(PIPELINE_FLAGS_DEFAULT);
```

O bloco de reset completo deve ficar:

```tsx
setPatientName("");
setPatientRegistrationNumber("");
setSelectedExams([]);
setExamQuantities({});
setPriority("normal");
setNotes("");
setPipelineFlags(PIPELINE_FLAGS_DEFAULT);
setFormSuccess("Atendimento enviado para os exames selecionados.");
setIsSubmitting(false);
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: reset pipeline flags after successful form submission"
```

---

## Task 4: Passar flags como props para `ExamsSection`

**Files:**
- Modify: `src/app/(app)/recepcao/reception-dashboard.tsx`

- [ ] **Step 1: Adicionar callback `togglePipelineFlag` no dashboard**

Logo após a função `toggleExam`, adicionar:

```tsx
function togglePipelineFlag(flag: keyof PipelineFlags, value: boolean) {
  setPipelineFlags((current) => ({ ...current, [flag]: value }));
}
```

- [ ] **Step 2: Passar as novas props para `ExamsSection`**

Substituir o trecho do JSX onde `ExamsSection` é renderizado (linhas ~307-313):

```tsx
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

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Expected: erros de tipo em `exams-section.tsx` porque as props novas ainda não existem lá — isso é esperado neste passo.

- [ ] **Step 4: Commit (parcial — será completado na Task 5)**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: pass pipeline flags and toggle callback to ExamsSection"
```

---

## Task 5: Atualizar `exams-section.tsx` com props e checkboxes condicionais

**Files:**
- Modify: `src/app/(app)/recepcao/exams-section.tsx`

- [ ] **Step 1: Atualizar o tipo `ExamsSectionProps` e a assinatura do componente**

Substituir o conteúdo inteiro de `src/app/(app)/recepcao/exams-section.tsx` por:

```tsx
import { cn } from "@/lib/utils";
import {
  EXAM_LABELS,
  ROOM_EXAM_TYPES,
} from "@/lib/constants";
import type {
  ExamRoomRecord,
  ExamType,
} from "@/lib/database.types";

type PipelineFlags = {
  com_laudo: boolean;
  com_cefalometria: boolean;
  com_impressao_fotografia: boolean;
  com_laboratorio_externo_escaneamento: boolean;
};

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
};

export function ExamsSection({
  rooms,
  selectedExams,
  examQuantities,
  onToggleExam,
  onUpdateExamQuantity,
  pipelineFlags,
  onTogglePipelineFlag,
}: ExamsSectionProps) {
  const showLaudo = selectedExams.some((e) => LAUDO_EXAMS.has(e));

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
                      </div>
                    </label>
                  );
                })}
              </div>

              {showCefalometria ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_cefalometria}
                    onChange={(e) => onTogglePipelineFlag("com_cefalometria", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700">Cefalometria</span>
                </label>
              ) : null}

              {showImpressao ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_impressao_fotografia}
                    onChange={(e) => onTogglePipelineFlag("com_impressao_fotografia", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700">Com impressão</span>
                </label>
              ) : null}

              {showLaboratorio ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_laboratorio_externo_escaneamento}
                    onChange={(e) => onTogglePipelineFlag("com_laboratorio_externo_escaneamento", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700">Laboratório externo</span>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      {showLaudo ? (
        <div className="mt-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Desdobramentos</p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={pipelineFlags.com_laudo}
              onChange={(e) => onTogglePipelineFlag("com_laudo", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
            />
            <span className="text-sm text-slate-700">Laudo</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/recepcao/exams-section.tsx
git commit -m "feat: add conditional pipeline flag checkboxes to ExamsSection"
```

---

## Task 6: Atualizar API route para receber e passar os flags ao RPC

**Files:**
- Modify: `src/app/api/clinic/attendances/route.ts`

- [ ] **Step 1: Adicionar os 4 campos ao tipo `CreateAttendanceBody`**

Substituir o tipo `CreateAttendanceBody` atual (linhas ~12-19):

```ts
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

- [ ] **Step 2: Adicionar os parâmetros `p_com_*` na chamada RPC**

Substituir a chamada `supabase.rpc("create_attendance_with_queue_items", {...})` principal (linhas ~325-335):

```ts
const attemptWithQuantities = await supabase.rpc(
  "create_attendance_with_queue_items",
  {
    p_exam_quantities: examQuantities,
    p_exam_types: selectedExams,
    p_notes: notes || null,
    p_patient_name: patientName,
    p_patient_registration_number: patientRegistrationNumber || null,
    p_priority: priority,
    p_com_laudo: body.comLaudo ?? false,
    p_com_cefalometria: body.comCefalometria ?? false,
    p_com_impressao_fotografia: body.comImpressaoFotografia ?? false,
    p_com_laboratorio_externo_escaneamento: body.comLaboratorioExternoEscaneamento ?? false,
  },
);
```

O bloco `legacyAttempt` (fallback sem `p_exam_quantities`) não recebe os flags — ele é para bancos desatualizados que não têm nem os campos na tabela, então manter sem alteração está correto.

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clinic/attendances/route.ts
git commit -m "feat: pass pipeline flags from request body to RPC"
```

---

## Task 7: Verificação end-to-end manual

**Files:** nenhum (verificação visual)

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

Acessar `http://localhost:3000/recepcao` logado como `recepcao`.

- [ ] **Step 2: Testar aparecimento dos checkboxes**

| Ação | Esperado |
|---|---|
| Selecionar PANORÂMICA | Aparece área "Desdobramentos" com checkbox "Laudo" |
| Selecionar PERIAPICAL (sem desmarcar PANORÂMICA) | "Laudo" continua aparecendo uma única vez |
| Selecionar TELERRADIOGRAFIA | Dentro do card Extra-oral, aparece "Cefalometria" |
| Selecionar FOTOGRAFIA | Dentro do card Fotos/Escaneamento, aparece "Com impressão" |
| Selecionar ESCANEAMENTO INTRA-ORAL | Dentro do card Fotos/Escaneamento, aparece "Laboratório externo" |

- [ ] **Step 3: Testar desaparecimento e reset**

| Ação | Esperado |
|---|---|
| Marcar "Laudo" → desmarcar PANORÂMICA (PERIAPICAL ainda ativo) | "Laudo" permanece |
| Desmarcar PERIAPICAL também | "Laudo" desaparece, valor volta a `false` |
| Marcar "Cefalometria" → desmarcar TELERRADIOGRAFIA | "Cefalometria" desaparece |
| Marcar "Com impressão" → desmarcar FOTOGRAFIA | "Com impressão" desaparece |
| Marcar "Laboratório externo" → desmarcar ESCANEAMENTO | "Laboratório externo" desaparece |

- [ ] **Step 4: Testar submit com flags ativos**

1. Selecionar PANORÂMICA + marcar "Laudo"
2. Selecionar FOTOGRAFIA + marcar "Com impressão"
3. Preencher nome e número de cadastro
4. Clicar "Salvar atendimento"
5. Verificar no Supabase Dashboard (staging) → tabela `attendances` → linha criada deve ter `com_laudo = true` e `com_impressao_fotografia = true`

- [ ] **Step 5: Verificar reset do formulário após submit**

Após submit bem-sucedido: todos os campos voltam ao estado inicial, incluindo os flags — nenhum checkbox condicional aparece.

- [ ] **Step 6: Commit final (se nenhum ajuste necessário)**

```bash
git add -A
git commit -m "chore: pipeline flags end-to-end verified"
```

Se ajustes forem necessários durante a verificação, corrigi-los antes deste commit.
