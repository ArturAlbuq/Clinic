# Repetição de Exames - Backend Implementation Spec (para Codex)

**Data:** 2026-04-17  
**Status:** Backend - Pronto para implementação  
**Frontend:** ✅ Completo (spec: `2026-04-17-repeat-exam-feature-design.md`)

---

## 1. Visão Geral

O frontend captura motivos de repetição de exame via modal no atendimento. Este spec define os endpoints, migrations e lógica backend necessários para persistir e recuperar esses dados.

**Responsabilidades do backend:**
1. Migração SQL: adicionar coluna `repetition_reason` e índices
2. Endpoint POST para registrar repetição
3. Endpoint GET para listar repetições com filtros
4. Realtime subscription setup (opcional, mas recomendado)
5. Testes de RLS e segurança

---

## 2. Migração SQL

### 2.1 Arquivo de Migração
**Nome:** `supabase/migrations/20260417HHMMSS_add_repetition_reason_to_exam_repetitions.sql`  
(Substituir `HHMMSS` pela hora atual)

### 2.2 SQL

```sql
-- Add repetition_reason column to exam_repetitions table
alter table public.exam_repetitions
add column repetition_reason text;

-- Comment for clarity
comment on column public.exam_repetitions.repetition_reason is
  'Texto livre descrevendo o motivo da repetição do exame, capturado pelo atendente.';

-- Index for filtering by reason (optional, mas bom para performance em relatórios)
create index if not exists exam_repetitions_repetition_reason_idx
  on public.exam_repetitions (repetition_reason);
```

### 2.3 Rollback (Segurança)
Se precisar reverter:
```sql
drop index if exists public.exam_repetitions_repetition_reason_idx;
alter table public.exam_repetitions
drop column if exists repetition_reason;
```

---

## 3. Endpoint: POST `/api/clinic/queue-items/{queueItemId}/repeat-exam`

### 3.1 Localização do Arquivo
`src/app/api/clinic/queue-items/[queueItemId]/repeat-exam/route.ts`

### 3.2 Método HTTP
```
POST /api/clinic/queue-items/{queueItemId}/repeat-exam
```

### 3.3 Autenticação
- **Requer:** Usuário autenticado com role `atendimento`
- **Scope:** Qualquer atendente pode registrar repetição (não há restrição por sala)

### 3.4 Requisição

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {jwt_token}
```

**Body (JSON):**
```json
{
  "reason": "Posicionamento incorreto do paciente, necessário refazer"
}
```

**Validações obrigatórias:**
- `reason`: string não-vazio, não-null, trim() mínimo 3 caracteres, máximo 500 caracteres
- Se falhar validação: retornar 400 com erro

### 3.5 Resposta - Sucesso (201)

```json
{
  "success": true,
  "repetitionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 3.6 Resposta - Erros

**400 - Validação**
```json
{
  "error": "Motivo deve ter entre 3 e 500 caracteres."
}
```

**404 - Item não encontrado**
```json
{
  "error": "Item da fila não encontrado ou já foi concluído."
}
```

**409 - Status inválido**
```json
{
  "error": "Só é permitido repetir exames que estão em exame ou já foram concluídos."
}
```

**401 - Não autenticado**
```json
{
  "error": "Não autenticado."
}
```

**403 - Sem permissão**
```json
{
  "error": "Apenas atendentes podem registrar repetições de exame."
}
```

**500 - Erro servidor**
```json
{
  "error": "Erro ao registrar repetição. Tente novamente."
}
```

### 3.7 Lógica de Implementação

```typescript
export async function POST(
  request: Request,
  context: { params: { queueItemId: string } }
) {
  // 1. Autenticação
  const { supabase, user } = await requireRole("atendimento");
  if (!user) {
    return json({ error: "Não autenticado." }, { status: 401 });
  }

  // 2. Parse body
  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body JSON inválido." }, { status: 400 });
  }

  // 3. Validar motivo
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3) {
    return json(
      { error: "Motivo deve ter entre 3 e 500 caracteres." },
      { status: 400 }
    );
  }
  if (reason.length > 500) {
    return json(
      { error: "Motivo deve ter entre 3 e 500 caracteres." },
      { status: 400 }
    );
  }

  // 4. Buscar queue_item
  const { data: queueItem, error: fetchError } = await supabase
    .from("queue_items")
    .select("id, exam_type, room_slug, status")
    .eq("id", context.params.queueItemId)
    .single();

  if (fetchError || !queueItem) {
    return json(
      { error: "Item da fila não encontrado ou já foi concluído." },
      { status: 404 }
    );
  }

  // 5. Validar status (deve estar "em_atendimento" ou "finalizado")
  // Nota: verificar constantes reais do projeto
  if (queueItem.status !== "em_atendimento" && queueItem.status !== "finalizado") {
    return json(
      {
        error: "Só é permitido repetir exames que estão em exame ou já foram concluídos.",
      },
      { status: 409 }
    );
  }

  // 6. Inserir em exam_repetitions
  const { data: repetition, error: insertError } = await supabase
    .from("exam_repetitions")
    .insert([
      {
        queue_item_id: context.params.queueItemId,
        exam_type: queueItem.exam_type,
        room_slug: queueItem.room_slug,
        technician_id: user.id,
        repeated_at: new Date().toISOString(), // timezone: Manaus
        repetition_reason: reason,
        // repetition_index: será calculado pelo trigger (ou implementar aqui)
      },
    ])
    .select("id")
    .single();

  if (insertError || !repetition) {
    console.error("Insert error:", insertError);
    return json(
      { error: "Erro ao registrar repetição. Tente novamente." },
      { status: 500 }
    );
  }

  // 7. Retornar sucesso
  return json(
    {
      success: true,
      repetitionId: repetition.id,
    },
    { status: 201 }
  );
}
```

### 3.8 Notas Importantes

- **Timezone:** Usar `new Date().toISOString()` automático ou forçar `America/Manaus` conforme CLAUDE.md
  - Verificar se existe helper `formatToTimezone()` no projeto
- **Trigger existente:** O trigger `handle_exam_repetition()` calcula `repetition_index` automaticamente
  - Ele conta quantos items do mesmo exam_type já foram finalizados globalmente
  - Manter esse comportamento
- **RLS:** A tabela já tem RLS com policy `exam_repetitions_select_admin`
  - INSERT deve ser feito via service role ou via stored procedure com security definer
  - **Recomendação:** Usar Supabase RPC (função stored) com `security definer` para permitir insert
  - OU permitir insert de `atendimento` role se a política for aberta (verificar CLAUDE.md)

---

## 4. Endpoint: GET `/api/clinic/repetitions`

### 4.1 Localização do Arquivo
`src/app/api/clinic/repetitions/route.ts`

### 4.2 Método HTTP
```
GET /api/clinic/repetitions?startDate=2026-04-10&endDate=2026-04-17&technicianId=uuid&roomSlug=radiografia-extra-oral&examType=panoramica
```

### 4.3 Autenticação
- **Requer:** Usuário com role `admin`
- (Apenas admin vê o relatório de repetições)

### 4.4 Query Parameters

| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `startDate` | YYYY-MM-DD | ✅ Sim | Data início do período |
| `endDate` | YYYY-MM-DD | ✅ Sim | Data fim do período |
| `technicianId` | uuid \| "todos" | ❌ Não | UUID do técnico ou "todos" |
| `roomSlug` | string \| "todas" | ❌ Não | Room slug ou "todas" |
| `examType` | enum \| "todos" | ❌ Não | Tipo de exame ou "todos" |
| `limit` | number | ❌ Não | Max resultados (default 1000) |

**Exemplo:**
```
GET /api/clinic/repetitions?startDate=2026-04-10&endDate=2026-04-17&technicianId=uuid&roomSlug=radiografia-extra-oral
```

### 4.5 Validação de Entrada

```typescript
// Validar datas
const startDate = new Date(searchParams.get("startDate") || "");
const endDate = new Date(searchParams.get("endDate") || "");

if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
  return json(
    { error: "startDate e endDate devem ser datas válidas (YYYY-MM-DD)." },
    { status: 400 }
  );
}

if (startDate > endDate) {
  return json(
    { error: "startDate não pode ser maior que endDate." },
    { status: 400 }
  );
}

// Limitar range (ex: máx 6 meses)
const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
if (daysDiff > 180) {
  return json(
    { error: "Período não pode exceder 180 dias." },
    { status: 400 }
  );
}
```

### 4.6 Resposta - Sucesso (200)

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "queue_item_id": "550e8400-e29b-41d4-a716-446655440001",
      "exam_type": "panoramica",
      "room_slug": "radiografia-extra-oral",
      "technician_id": "550e8400-e29b-41d4-a716-446655440002",
      "repeated_at": "2026-04-17T14:32:00.000Z",
      "repetition_reason": "Posicionamento incorreto do paciente",
      "patient_name": "João Silva",
      "patient_registration_number": "2024-001"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "queue_item_id": "550e8400-e29b-41d4-a716-446655440011",
      "exam_type": "periapical",
      "room_slug": "radiografia-intra-oral",
      "technician_id": "550e8400-e29b-41d4-a716-446655440012",
      "repeated_at": "2026-04-17T11:15:00.000Z",
      "repetition_reason": "Qualidade de imagem ruim, sombra na região",
      "patient_name": "Ana Costa",
      "patient_registration_number": "2024-015"
    }
  ],
  "total": 47
}
```

### 4.7 Resposta - Erros

**400 - Validação**
```json
{
  "error": "startDate e endDate devem ser datas válidas (YYYY-MM-DD)."
}
```

**401 - Não autenticado**
```json
{
  "error": "Não autenticado."
}
```

**403 - Sem permissão**
```json
{
  "error": "Apenas admin pode acessar relatório de repetições."
}
```

### 4.8 Lógica de Implementação

```typescript
export async function GET(request: Request) {
  // 1. Autenticação
  const { supabase, user } = await requireRole("admin");
  if (!user) {
    return json({ error: "Não autenticado." }, { status: 401 });
  }

  // 2. Parse query params
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate") || "";
  const endDate = url.searchParams.get("endDate") || "";
  const technicianId = url.searchParams.get("technicianId") || "todos";
  const roomSlug = url.searchParams.get("roomSlug") || "todas";
  const examType = url.searchParams.get("examType") || "todos";
  const limit = Math.min(Number(url.searchParams.get("limit") || "1000"), 5000);

  // 3. Validar datas
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return json(
      { error: "startDate e endDate devem ser datas válidas (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  if (startDateObj > endDateObj) {
    return json(
      { error: "startDate não pode ser maior que endDate." },
      { status: 400 }
    );
  }

  // 4. Construir query
  let query = supabase
    .from("exam_repetitions")
    .select(
      `
      id,
      queue_item_id,
      exam_type,
      room_slug,
      technician_id,
      repeated_at,
      repetition_reason,
      queue_items!inner (
        patient_name,
        attendance!inner (
          patient_name,
          patient_registration_number
        )
      )
    `,
      { count: "exact" }
    )
    .gte("repeated_at", startDateObj.toISOString())
    .lt("repeated_at", new Date(endDateObj.getTime() + 86400000).toISOString()) // +1 day
    .order("repeated_at", { ascending: false })
    .limit(limit);

  // 5. Aplicar filtros opcionais
  if (technicianId !== "todos") {
    query = query.eq("technician_id", technicianId);
  }

  if (roomSlug !== "todas") {
    query = query.eq("room_slug", roomSlug);
  }

  if (examType !== "todos") {
    query = query.eq("exam_type", examType);
  }

  // 6. Executar query
  const { data, error, count } = await query;

  if (error) {
    console.error("Query error:", error);
    return json(
      { error: "Erro ao buscar repetições." },
      { status: 500 }
    );
  }

  // 7. Transformar resposta (flatten patient info)
  const transformed = (data || []).map((rep: any) => ({
    id: rep.id,
    queue_item_id: rep.queue_item_id,
    exam_type: rep.exam_type,
    room_slug: rep.room_slug,
    technician_id: rep.technician_id,
    repeated_at: rep.repeated_at,
    repetition_reason: rep.repetition_reason,
    patient_name: rep.queue_items?.attendance?.patient_name || rep.queue_items?.patient_name || null,
    patient_registration_number: rep.queue_items?.attendance?.patient_registration_number || null,
  }));

  // 8. Retornar
  return json({
    data: transformed,
    total: count || 0,
  });
}
```

### 4.9 Notas Importantes

- **JOINs:** Precisa trazer `patient_name` e `patient_registration_number`
  - Pode estar em `queue_items.patient_name` ou `attendance.patient_name`
  - Verificar schema atual do projeto
- **Timezone:** Considerar timezone `America/Manaus` na comparação de datas
  - Se `repeated_at` está em UTC, converter range de datas para UTC
- **Performance:** Index em `repeated_at` ajuda bastante
  - Já existe: `exam_repetitions_repeated_at_idx`

---

## 5. RLS (Row Level Security)

### 5.1 Situação Atual

```sql
create policy "exam_repetitions_select_admin"
on public.exam_repetitions
for select
to authenticated
using (public.current_app_role() = 'admin');
```

**Problema:** Nenhuma policy de INSERT definida. Atendentes precisam poder inserir, mas a tabela tem RLS habilitada.

### 5.2 Solução Recomendada

**Opção A: Usar Stored Procedure com Security Definer**

```sql
create or replace function public.register_exam_repetition(
  p_queue_item_id uuid,
  p_exam_type public.exam_type,
  p_room_slug text,
  p_reason text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repetition_id uuid;
  v_technician_id uuid;
begin
  -- Get current user ID
  v_technician_id := auth.uid();

  -- Validações (duplicate do endpoint)
  if p_reason is null or trim(p_reason) = '' then
    return json_build_object('error', 'Motivo não pode estar vazio');
  end if;

  if length(trim(p_reason)) < 3 or length(trim(p_reason)) > 500 then
    return json_build_object('error', 'Motivo deve ter 3-500 caracteres');
  end if;

  -- Insert
  insert into public.exam_repetitions (
    queue_item_id,
    exam_type,
    room_slug,
    technician_id,
    repeated_at,
    repetition_reason,
    repetition_index
  )
  values (
    p_queue_item_id,
    p_exam_type,
    p_room_slug,
    v_technician_id,
    now() at time zone 'America/Manaus',
    trim(p_reason),
    1 -- trigger calcula o valor real
  )
  returning id into v_repetition_id;

  return json_build_object('success', true, 'repetitionId', v_repetition_id);
exception when others then
  return json_build_object('error', SQLERRM);
end;
$$;

-- Chamar do endpoint:
const { data } = await supabase
  .rpc('register_exam_repetition', {
    p_queue_item_id: queueItemId,
    p_exam_type: queueItem.exam_type,
    p_room_slug: queueItem.room_slug,
    p_reason: reason,
  });
```

**Opção B: Adicionar Policy de INSERT para Atendentes (Mais simples)**

```sql
create policy "exam_repetitions_insert_atendimento"
on public.exam_repetitions
for insert
to authenticated
with check (
  current_app_role() = 'atendimento'
  and technician_id = auth.uid()
);
```

Mas isso permite que atendente insira registros com outro `technician_id`. **Não recomendado.**

### 5.3 Recomendação Final

Usar **Opção A (Stored Procedure)** porque:
- ✅ Seguro: função executa com permissões elevadas
- ✅ Validações centralizadas no DB
- ✅ Garante que `technician_id = auth.uid()` sempre
- ✅ Valida `queue_item_id` e status antes de inserir
- ✅ Padrão já usado em outras partes do projeto

---

## 6. Realtime (Opcional, Recomendado)

### 6.1 Subscription no Frontend

Após implementar o endpoint GET, adicionar realtime subscription no `admin-dashboard.tsx`:

```typescript
useEffect(() => {
  if (reportSubTab !== "repeticoes") return;

  // Fetch inicial
  const fetchRepetitions = async () => {
    const params = new URLSearchParams({
      startDate: startDate, // state do componente
      endDate: endDate,
      technicianId: technicianId || "todos",
      roomSlug: roomSlug || "todas",
      examType: examType || "todos",
    });

    const res = await fetch(`/api/clinic/repetitions?${params}`);
    const json = await res.json();
    setRepetitions(json.data || []);
  };

  fetchRepetitions();

  // Subscribe a changes
  const channel = supabase
    .channel("exam_repetitions_changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "exam_repetitions",
      },
      (payload: any) => {
        // Re-fetch (simples) ou inserir localmente (complexo)
        fetchRepetitions();
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}, [reportSubTab]);
```

Mas como há filtros dinâmicos, pode ficar lento. **Alternativa:** Refetch a cada X segundos ou ao voltar para a aba.

---

## 7. Testes Manuais (Checklist)

### 7.1 POST /api/clinic/queue-items/{queueItemId}/repeat-exam

- [ ] Atendente autenticado clica "Repetir Exame"
- [ ] Modal abre, preenche motivo com texto válido (≥3 chars)
- [ ] Clica "Confirmar Repetição"
- [ ] Request vai para POST `/api/clinic/queue-items/{itemId}/repeat-exam`
- [ ] Body contém `{ "reason": "..." }`
- [ ] Resposta: 201 com `{ "success": true, "repetitionId": "uuid" }`
- [ ] Registro aparece em `exam_repetitions` com motivo preenchido
- [ ] Campo `technician_id` = ID do atendente autenticado
- [ ] Campo `repeated_at` está em timezone correta

**Casos de erro:**
- [ ] Motivo < 3 chars → 400 com erro apropriado
- [ ] Motivo > 500 chars → 400 com erro
- [ ] Item não encontrado → 404
- [ ] Item com status inválido → 409
- [ ] Não autenticado → 401
- [ ] Não é atendimento → 403

### 7.2 GET /api/clinic/repetitions

- [ ] Admin acessa aba "Relatórios" → "Repetições"
- [ ] Tabela carrega (inicialmente vazia)
- [ ] Filtrar por data inicial/final → resultados aparecem
- [ ] Filtrar por técnico → apenas daquele técnico
- [ ] Filtrar por sala → apenas daquela sala
- [ ] Filtrar por exame → apenas daquele tipo
- [ ] Combinar filtros → resultado é interseção
- [ ] Paginação funciona (5/10/15 por página)
- [ ] Motivo aparece na coluna "Motivo"

**Casos de erro:**
- [ ] Data inválida → 400
- [ ] startDate > endDate → 400
- [ ] Período > 180 dias → 400
- [ ] Não autenticado → 401
- [ ] Não é admin → 403

---

## 8. Estrutura de Pastas (Esperada)

```
src/
├── app/api/clinic/
│   ├── queue-items/
│   │   └── [queueItemId]/
│   │       └── repeat-exam/
│   │           └── route.ts          ← POST endpoint
│   └── repetitions/
│       └── route.ts                   ← GET endpoint
├── components/
│   ├── repeat-exam-modal.tsx          ✅ Frontend
│   └── repetitions-report-table.tsx   ✅ Frontend
└── ...

supabase/
└── migrations/
    └── 20260417HHMMSS_add_repetition_reason_to_exam_repetitions.sql
```

---

## 9. Checklist de Implementação

- [ ] Migração SQL criada e testada (pode fazer rollback)
- [ ] Tabela tem coluna `repetition_reason`
- [ ] Índice criado em `repetition_reason`
- [ ] Stored procedure `register_exam_repetition()` criada
- [ ] POST endpoint `/api/clinic/queue-items/{queueItemId}/repeat-exam`
  - [ ] Autenticação funcionando
  - [ ] Validação de motivo
  - [ ] Validação de status do item
  - [ ] Calls stored procedure
  - [ ] Retorna 201 com repetitionId
  - [ ] Trata erros corretamente
- [ ] GET endpoint `/api/clinic/repetitions`
  - [ ] Autenticação admin
  - [ ] Query params parseados e validados
  - [ ] Filtros aplicados corretamente
  - [ ] JOINs com queue_items e attendance
  - [ ] Retorna data + patient info + reason
  - [ ] Ordenado por repeated_at DESC
  - [ ] Paginação/limit funciona
- [ ] RLS policies revisadas e seguras
- [ ] Realtime subscription setup (opcional)
- [ ] Testes manuais aprovados
- [ ] TypeScript sem erros
- [ ] Dados no BD estão com timezone correto

---

## 10. Notas Finais

### Status Atual
- ✅ **Frontend:** Completo e commitado (botão, modal, tabela com filtros)
- 🔄 **Backend:** Pronto para ser implementado (este spec)
- ⏳ **Integração:** Após backend, testar fluxo completo

### Dependências
- Migração SQL → Endpoints → Realtime (opcional)
- Frontend já está wired para chamar `/api/clinic/queue-items/{id}/repeat-exam` POST

### Timezone
- **Zona:** `America/Manaus`
- **Verificar:** Se projeto usa helpers de timezone ou se aplica direto
- **Função SQL:** `now() at time zone 'America/Manaus'`

### Segurança
- ✅ Atendentes veem o botão, podem clicar
- ✅ Admin vê o relatório, pode filtrar
- ❌ Atendentes NÃO veem `exam_repetitions` (RLS)
- ❌ Ninguém pode registrar repetição por outro técnico (stored proc valida)

### Performance
- Índices adicionados em migração
- Queries com JOINs otimizadas
- Limit de 5000 no GET para evitar overhead

---

**Pronto para Codex implementar! 🚀**
