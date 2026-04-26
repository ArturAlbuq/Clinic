# Edit Pipeline Flags Implementation Plan


**Goal:** Permitir que o admin corrija os flags de pós-atendimento (`com_laudo`, `com_cefalometria`, `com_impressao_fotografia`, `com_laboratorio_externo_escaneamento`) de um atendimento já cadastrado, sem recriar o atendimento.

**Architecture:** Route Handler `POST /api/clinic/queue-items/update-flags` chama o RPC `update_pipeline_flags` sequencialmente para cada queue_item editável do atendimento. Um modal client-side em `admin-dashboard.tsx` coleta os valores e faz o fetch. O estado local é atualizado via `handleAttendanceSaved` existente — sem reload de página.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (RPC `update_pipeline_flags`), Tailwind CSS, React `useState`.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/app/api/clinic/queue-items/update-flags/route.ts` | Criar | Route Handler POST — valida role, chama RPC sequencialmente, retorna attendance + queueItems atualizados |
| `src/components/edit-pipeline-flags-modal.tsx` | Criar | Modal client-side — checkboxes por exame e por atendimento, submit, loading/error state |
| `src/components/admin-dashboard.tsx` | Modificar | Adicionar estado `isFlagsModalOpen`, callback `handleFlagsSaved`, botão "Editar flags" e renderização do modal em `AttendanceRow` |

---

## Task 1: Route Handler `POST /api/clinic/queue-items/update-flags`

**Files:**
- Create: `src/app/api/clinic/queue-items/update-flags/route.ts`

- [ ] **Step 1: Criar o arquivo do Route Handler**

Criar `src/app/api/clinic/queue-items/update-flags/route.ts` com o conteúdo abaixo:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";

type UpdateFlagsItem = {
  queueItemId: string;
  comLaudo: boolean;
};

type UpdateFlagsBody = {
  attendanceId: string;
  items: UpdateFlagsItem[];
  comCefalometria: boolean;
  comImpressaoFotografia: boolean;
  comLaboratorioExternoEscaneamento: boolean;
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

export async function POST(request: Request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase } = await requireRole("admin");

  let body: UpdateFlagsBody | null = null;
  try {
    body = (await request.json()) as UpdateFlagsBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (
    !body ||
    !body.attendanceId ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return jsonError("attendanceId e items sao obrigatorios.", 400);
  }

  const updatedQueueItems: QueueItemRecord[] = [];
  let updatedAttendance: AttendanceRecord | null = null;

  for (const item of body.items) {
    const { data, error } = await supabase.rpc("update_pipeline_flags", {
      p_queue_item_id: item.queueItemId,
      p_com_laudo: item.comLaudo,
      p_com_cefalometria: body.comCefalometria,
      p_com_impressao_fotografia: body.comImpressaoFotografia,
      p_com_laboratorio_externo_escaneamento:
        body.comLaboratorioExternoEscaneamento,
    });

    if (error || !data) {
      logServerError("update_pipeline_flags.rpc", error);
      return jsonError("Nao foi possivel atualizar os flags.", 400);
    }

    const result = data as {
      queueItem: QueueItemRecord;
      attendance: AttendanceRecord;
    };

    updatedQueueItems.push(result.queueItem);
    updatedAttendance = result.attendance;
  }

  if (!updatedAttendance) {
    return jsonError("Nenhum item foi processado.", 400);
  }

  return NextResponse.json({
    attendance: updatedAttendance,
    queueItems: updatedQueueItems,
  });
}
```

- [ ] **Step 2: Verificar que o TypeScript compila sem erros**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -40
```

Esperado: sem erros no arquivo criado.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clinic/queue-items/update-flags/route.ts
git commit -m "feat: route handler POST /api/clinic/queue-items/update-flags"
```

---

## Task 2: Modal `EditPipelineFlagsModal`

**Files:**
- Create: `src/components/edit-pipeline-flags-modal.tsx`

- [ ] **Step 1: Criar o componente do modal**

Criar `src/components/edit-pipeline-flags-modal.tsx` com o conteúdo abaixo:

```tsx
"use client";

import { useState } from "react";
import { EXAM_LABELS } from "@/lib/constants";
import { readJsonResponse } from "@/lib/fetch-json";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  QueueItemRecord,
} from "@/lib/database.types";

type EditPipelineFlagsModalProps = {
  attendance: AttendanceWithQueueItems;
  onSaved: (
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) => void;
  onClose: () => void;
};

export function EditPipelineFlagsModal({
  attendance,
  onSaved,
  onClose,
}: EditPipelineFlagsModalProps) {
  const editableItems = attendance.queueItems.filter(
    (item) => item.status !== "cancelado",
  );

  const [comLaudoPerItem, setComLaudoPerItem] = useState<
    Record<string, boolean>
  >(
    Object.fromEntries(editableItems.map((item) => [item.id, item.com_laudo])),
  );
  const [comCefalometria, setComCefalometria] = useState(
    attendance.com_cefalometria,
  );
  const [comImpressaoFotografia, setComImpressaoFotografia] = useState(
    attendance.com_impressao_fotografia,
  );
  const [comLaboratorioExternoEscaneamento, setComLaboratorioExternoEscaneamento] =
    useState(attendance.com_laboratorio_externo_escaneamento);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/clinic/queue-items/update-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        attendanceId: attendance.id,
        items: editableItems.map((item) => ({
          queueItemId: item.id,
          comLaudo: comLaudoPerItem[item.id] ?? item.com_laudo,
        })),
        comCefalometria,
        comImpressaoFotografia,
        comLaboratorioExternoEscaneamento,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      queueItems?: QueueItemRecord[];
      error?: string;
    }>(response)) ?? {};

    if (!response.ok || !payload.attendance) {
      setError(payload.error ?? "Erro ao salvar flags.");
      setSubmitting(false);
      return;
    }

    onSaved(payload.attendance, payload.queueItems ?? []);
  }

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
            Editar flags — {attendance.patient_name}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {editableItems.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Flags por exame
            </p>
            <div className="space-y-2">
              {editableItems.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={comLaudoPerItem[item.id] ?? false}
                    onChange={(e) =>
                      setComLaudoPerItem((current) => ({
                        ...current,
                        [item.id]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span className="text-sm font-medium text-slate-900">
                    {EXAM_LABELS[item.exam_type]} — com laudo
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Flags do atendimento
          </p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <input
                type="checkbox"
                checked={comCefalometria}
                onChange={(e) => setComCefalometria(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-sm font-medium text-slate-900">
                Com cefalometria
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <input
                type="checkbox"
                checked={comImpressaoFotografia}
                onChange={(e) => setComImpressaoFotografia(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-sm font-medium text-slate-900">
                Com impressão/fotografia
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <input
                type="checkbox"
                checked={comLaboratorioExternoEscaneamento}
                onChange={(e) =>
                  setComLaboratorioExternoEscaneamento(e.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-sm font-medium text-slate-900">
                Com laboratório externo / escaneamento
              </span>
            </label>
          </div>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-slate-700"
          >
            {submitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que o TypeScript compila sem erros**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -40
```

Esperado: sem erros no arquivo criado.

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-pipeline-flags-modal.tsx
git commit -m "feat: componente EditPipelineFlagsModal para edicao de flags no admin"
```

---

## Task 3: Integração em `admin-dashboard.tsx`

**Files:**
- Modify: `src/components/admin-dashboard.tsx`

**Contexto:** A função `AttendanceRow` começa na linha ~773. O bloco de botões de ação fica em torno das linhas 1251–1315. O import de `EditPipelineFlagsModal` precisa ser adicionado no topo do arquivo.

- [ ] **Step 1: Adicionar o import de `EditPipelineFlagsModal`**

No topo de `src/components/admin-dashboard.tsx`, após os imports existentes de componentes (ex.: após a linha que importa `RepetitionsReportTable`), adicionar:

```ts
import { EditPipelineFlagsModal } from "@/components/edit-pipeline-flags-modal";
```

- [ ] **Step 2: Adicionar estado `isFlagsModalOpen` em `AttendanceRow`**

Dentro da função `AttendanceRow`, junto aos outros `useState` existentes (ex.: após `const [isReturnFormOpen, setIsReturnFormOpen] = useState(false);`), adicionar:

```ts
const [isFlagsModalOpen, setIsFlagsModalOpen] = useState(false);
```

- [ ] **Step 3: Adicionar callback `handleFlagsSaved` em `AttendanceRow`**

Dentro da função `AttendanceRow`, junto às outras funções de submit (ex.: após `submitReturnPending`), adicionar:

```ts
function handleFlagsSaved(
  updatedAttendance: AttendanceRecord,
  updatedQueueItems: QueueItemRecord[],
) {
  onAttendanceSaved(updatedAttendance, updatedQueueItems);
  setIsFlagsModalOpen(false);
}
```

- [ ] **Step 4: Adicionar botão "Editar flags" no bloco de ações**

No JSX de `AttendanceRow`, no mesmo `<div className="flex flex-wrap gap-3">` onde ficam os botões "Cancelar exame", "Editar cadastro", "Marcar pendencia do exame" e "Excluir cadastro" (linhas ~1251–1315), adicionar o botão logo antes do botão "Excluir cadastro":

```tsx
<button
  className="rounded-[18px] border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100"
  type="button"
  onClick={() => {
    setMutationError("");
    setIsCancelFormOpen(false);
    setIsReturnFormOpen(false);
    setIsDeleteFormOpen(false);
    setIsEditing(false);
    setIsFlagsModalOpen(true);
  }}
>
  Editar flags
</button>
```

- [ ] **Step 5: Renderizar o modal no JSX de `AttendanceRow`**

No JSX de `AttendanceRow`, logo antes do `</div>` de fechamento da `<details>` (após o bloco `{isDeleteFormOpen ? ... : null}`), adicionar:

```tsx
{isFlagsModalOpen && (
  <EditPipelineFlagsModal
    attendance={attendance}
    onSaved={handleFlagsSaved}
    onClose={() => setIsFlagsModalOpen(false)}
  />
)}
```

- [ ] **Step 6: Verificar que o TypeScript compila sem erros**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit 2>&1 | head -40
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin-dashboard.tsx
git commit -m "feat: botao e modal de edicao de flags de pos-atendimento no admin"
```

---

## Task 4: Verificação manual

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npm run dev
```

- [ ] **Step 2: Testar fluxo do admin**

1. Abrir `http://localhost:3000/admin` com usuário de role `admin`
2. Expandir qualquer `AttendanceRow` clicando em "Ver fluxo e tempos por exame"
3. Confirmar que o botão "Editar flags" aparece no bloco de ações
4. Clicar em "Editar flags" — modal deve abrir com:
   - Checkboxes de `com_laudo` para cada exame não cancelado, com valores atuais
   - Checkboxes de `com_cefalometria`, `com_impressao_fotografia`, `com_laboratorio_externo_escaneamento` com valores atuais
5. Alterar um ou mais flags e clicar "Salvar"
6. Confirmar que o modal fecha e os dados no painel refletem os novos valores sem reload

- [ ] **Step 3: Testar estado de erro**

1. Desconectar a rede ou forçar erro no Route Handler temporariamente
2. Clicar "Salvar" — confirmar que mensagem de erro aparece no modal e ele permanece aberto

- [ ] **Step 4: Testar bloqueio na recepção**

1. Abrir `http://localhost:3000/recepcao` com usuário de role `recepcao`
2. Confirmar que nenhum botão "Editar flags" aparece em nenhum card
3. Confirmar que os checkboxes de flags nos cards de atendimento estão desabilitados (comportamento já existente — apenas verificar regressão)

- [ ] **Step 5: Commit final se tudo passar**

```bash
git add -A
git commit -m "chore: verificacao manual concluida — edicao de flags no admin"
```
