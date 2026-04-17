# Repetição de Exames - Design Spec

**Data:** 2026-04-17  
**Status:** Frontend concluído, backend pendente (Codex)

---

## 1. Visão Geral

Sistema para registrar quando um atendente precisa repetir um exame durante o atendimento. O motivo da repetição é capturado em texto livre e aparece em relatórios administrativos para análise de qualidade e operações.

**Fluxo operacional:**
1. Atendente está com item "em exame" ou já "concluído"
2. Clica em botão "Repetir Exame" (laranja, com ícone ↻)
3. Modal abre solicitando motivo em textarea
4. Ao confirmar, registro é criado em `exam_repetitions` com motivo
5. No admin, aba "Relatórios" → "Repetições" mostra tabela filtrada com todos os registros

---

## 2. Frontend Implementado

### 2.1 Componente Modal (`RepeatExamModal`)
- **Localização:** `src/components/repeat-exam-modal.tsx`
- **Props:**
  - `isOpen: boolean` — controla visibilidade
  - `isLoading: boolean` — mostra "Salvando..." durante requisição
  - `onClose: () => void` — callback ao cancelar
  - `onSubmit: (reason: string) => Promise<void>` — callback ao confirmar
  - `error?: string` — mensagem de erro (opcional)

- **Comportamento:**
  - Textarea com max 500 caracteres
  - Validação mínima: 3 caracteres
  - ESC fecha o modal
  - Clique fora também fecha
  - Foco automático no textarea ao abrir

### 2.2 Integração no Room Queue Board (`[roomSlug]/room-queue-board.tsx`)

**Estados adicionados:**
```typescript
const [repeatExamItemId, setRepeatExamItemId] = useState<string | null>(null);
const [repeatExamLoading, setRepeatExamLoading] = useState(false);
const [repeatExamError, setRepeatExamError] = useState("");
```

**Botão adicionado ao card de item:**
- Aparece quando `item.status !== "finalizado"` (mesma condição de retorno pendente)
- Cor: laranja (`bg-orange-50`, `text-orange-700`)
- Texto: "↻ Repetir Exame"
- Desativado quando não é "hoje" (`disabled={!isToday}`)

**Modal renderizado no fim do componente:**
```typescript
<RepeatExamModal
  isOpen={repeatExamItemId !== null}
  isLoading={repeatExamLoading}
  error={repeatExamError}
  onClose={() => { setRepeatExamItemId(null); setRepeatExamError(""); }}
  onSubmit={(reason) => submitRepeatExam(repeatExamItemId, reason)}
/>
```

**Função `submitRepeatExam` (stub para Codex):**
```typescript
async function submitRepeatExam(queueItemId: string, reason: string) {
  // TODO: Codex - POST /api/clinic/queue-items/{queueItemId}/repeat-exam
  // Body: { reason: string }
  // Response: { error?: string; success?: boolean }
}
```

### 2.3 Nova Aba de Relatório de Repetições (`RepetitionsReportTable`)
- **Localização:** `src/components/repetitions-report-table.tsx`
- **Substituiu:** Os 3 painéis antigos (por exame, por técnico, por sala)
- **Novo design:** Tabela com filtros e paginação

**Filtros oferecidos:**
- Data início/fim (calendário)
- Técnico (dropdown, filtra por `atendimento` role)
- Sala (dropdown, todas as salas)
- Exame (dropdown, todos os tipos de exame)

**Coluna de resultados:**
| Coluna | Conteúdo |
|--------|----------|
| Paciente | Nome + número de cadastro (truncado em 2 linhas) |
| Exame | Tipo de exame (ex: "Panorâmica") |
| Técnico | Nome do atendente que repetiu |
| Sala | Nome da sala |
| Data/Hora | Formato: `DD/MM/YY HH:MM` |
| Motivo | Texto completo do motivo (truncado em 2 linhas) |

**Paginação:**
- Opções: 5, 10, 15 por página
- Navegação: Anterior / Página X / Próxima
- Mostra total de repetições e intervalo de exibição

**Estados vazios:**
- Se nenhuma repetição: "Nenhuma repetição encontrada"
- Se erro na API: mensagem de erro
- Se carregando: "Carregando..."

---

## 3. Backend (Codex)

### 3.1 Migração SQL
**Arquivo:** `supabase/migrations/20260417HHMMSS_add_repetition_reason.sql`

Adicionar coluna a `exam_repetitions`:
```sql
alter table public.exam_repetitions
add column repetition_reason text;

create index if not exists exam_repetitions_repetition_reason_idx
  on public.exam_repetitions (repetition_reason);
```

RLS: Herdar do padrão existente (admin select).

### 3.2 Endpoint POST `/api/clinic/queue-items/{queueItemId}/repeat-exam`

**Requisição:**
```json
{
  "reason": "Qualidade ruim, sombra na região"
}
```

**Resposta (sucesso):**
```json
{
  "success": true
}
```

**Resposta (erro):**
```json
{
  "error": "Mensagem de erro descritiva"
}
```

**Validações:**
- `queueItemId` válido e pertencente a usuário autenticado
- `reason` não vazio, não null
- Item só pode estar "em exame" ou "finalizado" (status check)
- Autenticação: Qualquer atendente autenticado (role atendimento)

**Comportamento:**
1. Validar input
2. Verificar se item existe e status é válido
3. Inserir em `exam_repetitions` com:
   - `queue_item_id`: do item
   - `exam_type`: do item
   - `room_slug`: do item
   - `technician_id`: do usuário autenticado
   - `repeated_at`: NOW() em Manaus
   - `repetition_index`: (lógica existente)
   - `repetition_reason`: do payload
4. Retornar `{ success: true }`

### 3.3 Endpoint GET `/api/clinic/repetitions`

**Query params:**
- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD
- `examType?`: enum exam_type ou "todos"
- `roomSlug?`: room slug ou "todas"
- `technicianId?`: uuid ou "todos"

**Resposta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "queue_item_id": "uuid",
      "exam_type": "panoramica",
      "room_slug": "radiografia-extra-oral",
      "technician_id": "uuid",
      "repeated_at": "2026-04-17T14:32:00Z",
      "repetition_reason": "Posicionamento incorreto",
      "patient_name": "João Silva",
      "patient_registration_number": "2024-001"
    }
  ]
}
```

**Lógica:**
1. Validar parâmetros de data
2. Fetch `exam_repetitions` com filtros
3. JOIN com `queue_items` para pegar `exam_type`, `room_slug`
4. JOIN com `attendance` para pegar `patient_name`, `patient_registration_number`
5. Retornar dados ordenados por `repeated_at DESC`

---

## 4. Integração com Realtime

O componente `RepeatExamModal` está wired para chamar `submitRepeatExam()`, que faz POST ao endpoint backend. Após sucesso, o realtime subscription existente em `useRealtimeClinicData` atualizará automaticamente a lista de repetições no admin (quando integrado).

**Para o admin:** Codexa deverá usar `useEffect` para fetch inicial de repetições ao montar a aba, depois manter subscription realtime ativa (se `reportSubTab === "repeticoes"`).

---

## 5. Dados Persistidos

**Tabela:** `exam_repetitions`

| Campo | Tipo | Novo? | Descrição |
|-------|------|-------|-----------|
| id | uuid | não | PK |
| queue_item_id | uuid | não | FK queue_items |
| exam_type | exam_type enum | não | Tipo de exame |
| room_slug | text | não | Sala onde foi repetido |
| technician_id | uuid | não | Quem repetiu |
| repeated_at | timestamptz | não | Quando foi repetido (Manaus TZ) |
| repetition_index | integer | não | Contador (lógica existente) |
| **repetition_reason** | **text** | **SIM** | **Novo: motivo em texto livre** |

---

## 6. Testes Manuais (Checklist)

### Frontend
- [ ] Abrir atendimento em uma sala
- [ ] Clicar "↻ Repetir Exame" em item "em exame"
- [ ] Modal abre com título e textarea
- [ ] Digitar motivo < 3 caracteres: botão "Confirmar" desativado
- [ ] Digitar motivo ≥ 3 caracteres: botão ativa
- [ ] ESC fecha modal
- [ ] Clique fora fecha modal
- [ ] Cancelar fecha sem fazer nada
- [ ] Confirmar: modal mostra "Salvando..." (após Codex implementar)

### Admin - Relatório
- [ ] Ir a Admin → Relatórios → Repetições
- [ ] Tabela vazia (sem dados)
- [ ] Filtrar por data, técnico, sala, exame (sem quebrar)
- [ ] Paginação funciona (depois que temos dados)
- [ ] Trocar por página (5/10/15) funciona

### Dados (após Codex)
- [ ] Atendente repete exame → registro aparece em `exam_repetitions`
- [ ] Motivo é persistido corretamente
- [ ] Relatório mostra repetição 1-2 seg depois (realtime)
- [ ] Filtros retornam dados certos

---

## 7. Componentes Criados / Modificados

| Arquivo | Tipo | Status |
|---------|------|--------|
| `src/components/repeat-exam-modal.tsx` | Novo | ✅ Completo |
| `src/components/repetitions-report-table.tsx` | Novo | ✅ Completo |
| `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx` | Modificado | ✅ Integrado |
| `src/components/admin-dashboard.tsx` | Modificado | ✅ Integrado (tabela vazia) |

---

## 8. Próximas Etapas (Codex)

1. ✅ **Spec aprovada**
2. 🔄 **Migração SQL:** Adicionar coluna `repetition_reason`
3. 🔄 **Endpoint POST:** `/api/clinic/queue-items/{queueItemId}/repeat-exam`
4. 🔄 **Endpoint GET:** `/api/clinic/repetitions` com filtros
5. 🔄 **Hook de busca:** Integrar no admin via `useEffect` + realtime
6. 🔄 **Testes:** Validar fluxo completo

---

## 9. Notas Importantes

- **Timezone:** Todos os timestamps em `America/Manaus`
- **Segurança:** Apenas atendentes podem registrar repetições (role check)
- **RLS:** Manter padrão: admin vê tudo, atendentes não veem `exam_repetitions`
- **Performance:** Índices já adicionados em migração anterior; manter para `repetition_reason` se necessário
- **Scope:** Repetição é **por exame**, não por cadastro inteiro
