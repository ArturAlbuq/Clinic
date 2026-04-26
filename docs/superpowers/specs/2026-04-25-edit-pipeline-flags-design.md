# Spec: Edição de flags de pós-atendimento no admin

**Data:** 2026-04-25
**Escopo:** Admin panel — correção de `com_laudo`, `com_cefalometria`, `com_impressao_fotografia`, `com_laboratorio_externo_escaneamento` em queue_items/attendances já cadastrados.

---

## Contexto

Os flags de pós-atendimento são definidos na recepção durante o cadastro do atendimento. Quando marcados incorretamente, o pipeline de pós-atendimento (`pipeline_items`) segue com dados errados e o exame não tramita corretamente na esteira. Esta feature permite ao admin corrigir esses flags sem recriar o atendimento.

---

## Distribuição dos flags no banco

| Flag | Tabela | Granularidade |
|---|---|---|
| `com_laudo` | `queue_items` | Por exame (queue_item) |
| `com_cefalometria` | `attendances` | Por atendimento |
| `com_impressao_fotografia` | `attendances` | Por atendimento |
| `com_laboratorio_externo_escaneamento` | `attendances` | Por atendimento |

O RPC `update_pipeline_flags(p_queue_item_id, ...)` recebe um `queue_item_id` e atualiza:
- `queue_items.com_laudo` para aquele item
- `attendances.com_cefalometria/com_impressao_fotografia/com_laboratorio_externo_escaneamento` para o atendimento pai
- Propaga mudanças nos `pipeline_items` afetados (laudo, cefalometria, fotografia, escaneamento)

O RPC é `security definer` e valida `current_app_role() = 'admin'` internamente.

---

## Abordagem escolhida

**Route Handler + modal client-side** — padrão já usado em todos os outros pontos de mutação do admin (`submitCancellation`, `submitDelete`, `submitReturnPending`, etc.).

Sem Server Actions, sem `revalidatePath`, sem reload de página. Estado local atualizado via `handleAttendanceSaved` existente no `AdminDashboard`.

---

## Artefatos

### 1. Route Handler — `src/app/api/clinic/queue-items/update-flags/route.ts`

**Método:** `POST`

**Body:**
```ts
{
  attendanceId: string;
  items: { queueItemId: string; comLaudo: boolean }[];
  comCefalometria: boolean;
  comImpressaoFotografia: boolean;
  comLaboratorioExternoEscaneamento: boolean;
}
```

**Resposta 200:**
```ts
{
  attendance: AttendanceRecord;
  queueItems: QueueItemRecord[];
}
```

**Resposta 4xx/5xx:**
```ts
{ error: string }
```

**Lógica:**
1. `requireRole("admin")` — 403 se não for admin
2. Valida presença de `attendanceId` e `items` não vazio
3. Itera `items` com `for...of` (sequencial — RPC usa `FOR UPDATE`, paralelo causaria deadlock)
4. Para cada item chama `supabase.rpc("update_pipeline_flags", { p_queue_item_id, p_com_laudo, p_com_cefalometria, p_com_impressao_fotografia, p_com_laboratorio_externo_escaneamento })`
5. Acumula `queueItem` de cada resposta RPC; usa o `attendance` da última chamada
6. Retorna `{ attendance, queueItems }`

**Sem `service_role_key` explícito** — o cliente Supabase server-side via `requireRole` passa o JWT do usuário autenticado, suficiente para o RPC `security definer`.

---

### 2. Modal — `src/components/edit-pipeline-flags-modal.tsx`

**Props:**
```ts
type EditPipelineFlagsModalProps = {
  attendance: AttendanceWithQueueItems;
  onSaved: (updatedAttendance: AttendanceRecord, updatedQueueItems: QueueItemRecord[]) => void;
  onClose: () => void;
};
```

**Estado local:**
- `comLaudoPerItem: Record<string, boolean>` — inicializado de `attendance.queueItems` (apenas itens não cancelados)
- `comCefalometria: boolean` — inicializado de `attendance.com_cefalometria`
- `comImpressaoFotografia: boolean` — inicializado de `attendance.com_impressao_fotografia`
- `comLaboratorioExternoEscaneamento: boolean` — inicializado de `attendance.com_laboratorio_externo_escaneamento`
- `submitting: boolean`
- `error: string | null`

**Itens editáveis:**
```ts
const editableItems = attendance.queueItems.filter(
  (item) => item.status !== "cancelado"
);
```
Queue items cancelados não aparecem e não geram chamada RPC.

**Layout** (padrão `AdvanceStatusModal`):
- Overlay `fixed inset-0 z-50 bg-black/40`, fecha ao clicar fora
- Caixa `max-w-lg bg-white rounded-xl p-6 shadow-xl`
- Header: título "Editar flags — {patientName}" + botão ✕
- Seção **"Flags por exame"**: lista `editableItems` com `EXAM_LABELS[item.exam_type]` + checkbox `com_laudo`
- Seção **"Flags do atendimento"**: 3 checkboxes (`com_cefalometria`, `com_impressao_fotografia`, `com_laboratorio_externo_escaneamento`) com labels em português
- Bloco de erro vermelho se `error` presente
- Rodapé: botão "Cancelar" + botão "Salvar" (disabled + "Salvando..." durante submit)

**Submit:**
1. `setSubmitting(true)`, `setError(null)`
2. `POST /api/clinic/queue-items/update-flags` com os valores atuais
3. Sucesso: chama `onSaved(attendance, queueItems)` — modal fecha via callback
4. Erro: `setError(payload.error ?? "Erro ao salvar flags.")`, mantém modal aberto

---

### 3. Modificação — `src/components/admin-dashboard.tsx`

**Em `AttendanceRow`:**

Novo estado:
```ts
const [isFlagsModalOpen, setIsFlagsModalOpen] = useState(false);
```

Novo callback (delega para `onAttendanceSaved` existente):
```ts
function handleFlagsSaved(
  updatedAttendance: AttendanceRecord,
  updatedQueueItems: QueueItemRecord[],
) {
  onAttendanceSaved(updatedAttendance, updatedQueueItems);
  setIsFlagsModalOpen(false);
}
```

Novo botão no bloco de ações (mesmo bloco de "Editar cadastro", "Cancelar exame", etc.):
```tsx
<button
  className="rounded-[18px] border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100"
  type="button"
  onClick={() => setIsFlagsModalOpen(true)}
>
  Editar flags
</button>
```

Modal renderizado dentro do JSX de `AttendanceRow`:
```tsx
{isFlagsModalOpen && (
  <EditPipelineFlagsModal
    attendance={attendance}
    onSaved={handleFlagsSaved}
    onClose={() => setIsFlagsModalOpen(false)}
  />
)}
```

**Sem guard de role no frontend** — a página `/admin` já exige `requireRole("admin")` no Server Component. O Route Handler revalida com `requireRole` server-side.

**Sem código novo em `AdminDashboard`** — `handleAttendanceSaved` existente já substitui o attendance pelo `id` e reinsere os queue_items atualizados.

---

### 4. Recepção — sem modificações

`reception-edit-attendance-card.tsx` já passa `noopTogglePipelineFlag` (função vazia) como handler e `pipelineFlagsReadOnly={true}` para `ExamsSection`. `com_laudo` por exame também é read-only via `laudoPerExamReadOnly`. Nenhuma alteração necessária.

---

## Fluxo completo

```
Admin clica "Editar flags" em AttendanceRow (dentro de <details>)
  → isFlagsModalOpen = true
  → EditPipelineFlagsModal abre com attendance + queueItems atuais
  → Admin altera checkboxes
  → Clica "Salvar"
  → POST /api/clinic/queue-items/update-flags
      { attendanceId, items: editableItems com comLaudo, comCefalometria, comImpressaoFotografia, comLaboratorioExternoEscaneamento }
  → Route Handler: requireRole("admin") → for...of items → rpc("update_pipeline_flags") × N
  → 200: { attendance, queueItems }
  → onSaved(attendance, queueItems)
      → AdminDashboard.handleAttendanceSaved → setAttendances + setQueueItems
  → isFlagsModalOpen = false
  → UI atualizada sem reload
```

---

## Critérios de aceite

- Admin abre o modal, altera flags e salva com sucesso
- A alteração reflete imediatamente no painel sem reload completo
- Queue items cancelados não aparecem no modal
- Usuário com role `recepcao` não vê o botão (página `/admin` requer role `admin`)
- Usuário com role `atendimento` não vê o botão (mesma razão)
- Em caso de erro no Route Handler, mensagem clara é exibida no modal
- Loading state ativo durante o submit

---

## Restrições

- Não modifica o fluxo de cadastro da recepção
- Não altera campos além dos 4 flags de pós-atendimento
- Não cria nova rota de página — edição inline no admin existente
- Não usa `any` no TypeScript
- Não duplica componentes de modal existentes
