# Design: Repetições de Exames

**Data:** 2026-04-11  
**Status:** Aprovado

## Contexto

Feature de repetição anterior (migration `20260411213000`) foi removida por não agradar — usava ação manual com seleção de motivo pelo técnico. Esta versão substitui com abordagem totalmente automática via trigger no banco, sem interação manual.

## Objetivo

Registrar automaticamente quando um exame é repetido (mesmo `attendance_id + exam_type` finalizado mais de uma vez) e exibir métricas no painel Admin > Relatórios como sub-tab "Repetições".

## Regra de negócio

Um exame é considerado repetição quando, ao finalizar (`status = 'finalizado'`), já existe outro `queue_item` com mesmo `attendance_id + exam_type` no status `finalizado`. A primeira finalização não gera registro. A segunda gera com `repetition_index = 1`, a terceira com `repetition_index = 2`, etc.

---

## 1. Banco de dados

### Tabela `public.exam_repetitions`

| Coluna | Tipo | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `queue_item_id` | uuid | FK → `queue_items(id)`, NOT NULL, UNIQUE |
| `attendance_id` | uuid | FK → `attendances(id)`, NOT NULL |
| `exam_type` | `public.exam_type` | NOT NULL |
| `room_slug` | text | FK → `exam_rooms(slug)`, nullable |
| `technician_id` | uuid | FK → `profiles(id)`, nullable — `finished_by` do queue_item |
| `repeated_at` | timestamptz | NOT NULL, default `now() AT TIME ZONE 'America/Manaus'` |
| `repetition_index` | integer | NOT NULL, CHECK > 0 |

**Nota:** usa `room_slug` (não `room_id`) porque o schema do projeto referencia salas por slug em `queue_items`.

**Idempotência:** UNIQUE constraint em `queue_item_id` + `ON CONFLICT (queue_item_id) DO NOTHING` no trigger.

Índices:
- `(repeated_at DESC)` — filtro de período
- `(exam_type, repeated_at DESC)` — filtro por exame
- `(technician_id, repeated_at DESC)` — filtro por técnico
- `(room_slug, repeated_at DESC)` — filtro por sala

### Função e trigger

```
handle_exam_repetition() — RETURNS trigger, SECURITY DEFINER
on_queue_item_finalized  — AFTER UPDATE ON queue_items FOR EACH ROW
                           WHEN (OLD.status <> 'finalizado' AND NEW.status = 'finalizado')
```

Lógica da função:
1. Contar `queue_items` com `attendance_id = NEW.attendance_id AND exam_type = NEW.exam_type AND status = 'finalizado' AND id <> NEW.id`
2. Se `count = 0`: `RETURN NEW` (primeira finalização, não registra)
3. Se `count >= 1`: inserir em `exam_repetitions` com `repetition_index = count`, `ON CONFLICT (queue_item_id) DO NOTHING`

### RLS

- `SELECT`: somente `current_app_role() = 'admin'`
- `INSERT / UPDATE / DELETE`: nenhuma policy — bloqueado para todos os roles autenticados (trigger escreve via `SECURITY DEFINER`)

---

## 2. Frontend

### Hook `useExamRepetitions`

**Localização:** `src/lib/exam-repetitions.ts`

```typescript
type ExamRepetitionsFilters = {
  startDate: string;   // ISO date, America/Manaus
  endDate: string;     // ISO date, America/Manaus
  examType?: ExamType;
  technicianId?: string;
  roomSlug?: string;
};

type ExamRepetitionRow = {
  id: string;
  queue_item_id: string;
  attendance_id: string;
  exam_type: ExamType;
  room_slug: string | null;
  technician_id: string | null;
  repeated_at: string;
  repetition_index: number;
};

type ExamRepetitionsData = {
  rows: ExamRepetitionRow[];
  byExamType: Array<{ examType: ExamType; total: number; pct: number }>;
  byTechnician: Array<{ technicianId: string; total: number; topExamType: ExamType }>;
  byRoom: Array<{ roomSlug: string; total: number; topExamType: ExamType }>;
  isLoading: boolean;
  error: string | null;
};
```

- Usa Supabase browser client (`src/lib/supabase/browser.ts`)
- Filtro de data converte para UTC antes de enviar ao Supabase (America/Manaus = UTC-4)
- Agrupa client-side após fetch (volume esperado baixo)
- Hook com `useEffect` + `useState`, re-fetch quando filtros mudam

### Componente `RepetitionsTab`

**Localização:** `src/components/repetitions-tab.tsx`

Props:
```typescript
type Props = {
  profiles: ProfileRecord[];
  rooms: ExamRoomRecord[];
};
```

**Layout:**

```
[Filtros: período | técnico | tipo de exame]

[Painel 1: Por exame]     [Painel 2: Por técnico]     [Painel 3: Por sala]
exam_type | total | %     nome | total | exame top     sala | total | exame top
```

Grid: `xl:grid-cols-3` — mesmo padrão usado nos relatórios existentes.

Filtros:
- Período: dois `<input type="date">` com padrão = mês atual (1º ao último dia)
- Técnico: `SelectField` com opções derivadas de `profiles.filter(p => p.role === 'atendimento')`
- Tipo de exame: `SelectField` com `EXAM_LABELS`

Estado vazio: usar componente `EmptyState` já existente.

### Integração em `admin-dashboard.tsx`

1. `AdminTab` permanece com os valores atuais — sem alteração
2. Dentro do bloco `activeTab === "relatorios"`, adicionar sub-navegação:
   - `type ReportSubTab = "indicadores" | "repeticoes"`
   - Dois botões de sub-tab acima dos painéis de relatório existentes
   - `"indicadores"` = conteúdo atual de relatórios (sem mover nada)
   - `"repeticoes"` = `<RepetitionsTab profiles={profiles} rooms={rooms} />`
3. `profiles` e `rooms` já estão disponíveis como props do `AdminDashboard`

---

## 3. Ordem de implementação

1. Migration: tabela + trigger + RLS (único arquivo)
2. `src/lib/exam-repetitions.ts` — hook
3. `src/components/repetitions-tab.tsx` — componente
4. `src/lib/database.types.ts` — adicionar tipo `ExamRepetitionRecord`
5. `src/components/admin-dashboard.tsx` — sub-tab de relatórios

---

## Critérios de aceite

- [ ] Finalizar um exame pela primeira vez → nenhuma linha em `exam_repetitions`
- [ ] Finalizar mesmo exame (mesmo `attendance_id + exam_type`) uma segunda vez → linha com `repetition_index = 1`
- [ ] Trigger acionado duas vezes no mesmo `queue_item_id` → nenhuma duplicata (idempotência)
- [ ] Perfil `recepcao` ou `atendimento` não consegue fazer SELECT em `exam_repetitions` (RLS)
- [ ] Sub-tab "Repetições" aparece dentro de Relatórios sem quebrar "Indicadores"
- [ ] Três painéis exibem dados reais com filtros aplicados
- [ ] Filtro de período respeita timezone America/Manaus
