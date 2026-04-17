# Test Plan: Exam Repetition Feature

**Date:** 2026-04-17  
**Feature:** Exam repetition with reason capture  
**Status:** Ready for QA

---

## 1. POST Endpoint Tests

### 1.1 Success Case
**Given:** Atendente autenticado em item "em_atendimento"  
**When:** Clica "Repetir Exame", preenche motivo válido (5-100 chars), clica "Confirmar"  
**Then:**
- [ ] POST `/api/clinic/queue-items/{itemId}/repeat-exam` enviado com `{ reason: "..." }`
- [ ] Resposta: 201 `{ success: true, repetitionId: "uuid" }`
- [ ] Registro inserido em `exam_repetitions` com:
  - `queue_item_id` = itemId
  - `exam_type` = tipo do item
  - `room_slug` = sala do item
  - `technician_id` = ID do atendente autenticado
  - `repetition_reason` = motivo preenchido
  - `repetition_index` = contador global (deve calcular corretamente)
- [ ] Modal fecha sem erro
- [ ] Realtime atualiza admin em tempo real

---

### 1.2 Validation Errors

#### 1.2.1 Motivo muito curto
**When:** Motivo tem < 3 caracteres  
**Then:** 400 `{ error: "Motivo deve ter entre 3 e 500 caracteres." }`

#### 1.2.2 Motivo muito longo
**When:** Motivo tem > 500 caracteres  
**Then:** 400 `{ error: "Motivo deve ter entre 3 e 500 caracteres." }`

#### 1.2.3 Body JSON inválido
**When:** Body não é JSON válido  
**Then:** 400 `{ error: "Body JSON invalido." }`

#### 1.2.4 Motivo ausente
**When:** Body não tem campo `reason`  
**Then:** 400 `{ error: "Motivo deve ter entre 3 e 500 caracteres." }`

---

### 1.3 Authentication Errors

#### 1.3.1 Não autenticado
**When:** Request sem token JWT válido  
**Then:** 401 `{ error: "Nao autenticado." }`

#### 1.3.2 Role incorreta
**When:** Usuário é admin/recepcao (não é atendimento)  
**Then:** 403 `{ error: "Apenas atendentes podem registrar repeticoes de exame." }`

#### 1.3.3 Same-origin violation
**When:** Request vem de origin diferente  
**Then:** 403 `{ error: "Origem invalida." }`

---

### 1.4 Queue Item Errors

#### 1.4.1 Item não encontrado
**When:** Queue item não existe ou foi deletado  
**Then:** 404 `{ error: "Item da fila nao encontrado." }`

#### 1.4.2 Status inválido
**When:** Item tem status "aguardando", "cancelado" ou outro  
**Then:** 409 `{ error: "So e permitido repetir exames em atendimento ou finalizados." }`

#### 1.4.3 Function não existe
**When:** Stored procedure `register_exam_repetition` não foi criada  
**Then:** 503 `{ error: "Registro de repeticao indisponivel ate atualizar o banco." }`

---

## 2. GET Endpoint Tests

### 2.1 Success Case
**Given:** Admin autenticado, período de teste  
**When:** Acessa GET `/api/clinic/repetitions?startDate=2026-04-10&endDate=2026-04-17`  
**Then:**
- [ ] 200 OK
- [ ] Response contém `data` array
- [ ] Response contém `total` count
- [ ] Cada item tem:
  - `id`: uuid
  - `queue_item_id`: uuid
  - `exam_type`: string (ex: "panoramica")
  - `room_slug`: string ou null
  - `technician_id`: uuid ou null
  - `repeated_at`: ISO timestamp
  - `repetition_reason`: string ou null
  - `patient_name`: string ou null
  - `patient_registration_number`: string ou null

---

### 2.2 Filtering Tests

#### 2.2.1 Date range filtering
**When:** `startDate=2026-04-15&endDate=2026-04-17`  
**Then:** Apenas repetições em 15, 16, 17 de abril

#### 2.2.2 Technician filtering
**When:** `technicianId={uuid}`  
**Then:** Apenas repetições daquele técnico

#### 2.2.3 Room filtering
**When:** `roomSlug=radiografia-extra-oral`  
**Then:** Apenas repetições daquela sala

#### 2.2.4 Exam type filtering
**When:** `examType=panoramica`  
**Then:** Apenas repetições de panorâmica

#### 2.2.5 Combined filters
**When:** `startDate=...&technicianId=...&roomSlug=...&examType=...`  
**Then:** Intersecção de todos os filtros (AND logic)

#### 2.2.6 "Todos" values
**When:** `technicianId=todos&roomSlug=todas&examType=todos`  
**Then:** Sem filtro, retorna todos (within date range)

---

### 2.3 Validation Errors

#### 2.3.1 Invalid startDate format
**When:** `startDate=2026/04/10` (formato errado)  
**Then:** 400 `{ error: "startDate e endDate devem ser datas validas (YYYY-MM-DD)." }`

#### 2.3.2 Invalid endDate format
**When:** `endDate=abc`  
**Then:** 400 `{ error: "startDate e endDate devem ser datas validas (YYYY-MM-DD)." }`

#### 2.3.3 startDate > endDate
**When:** `startDate=2026-04-20&endDate=2026-04-10`  
**Then:** 400 `{ error: "startDate nao pode ser maior que endDate." }`

#### 2.3.4 Period > 180 days
**When:** `startDate=2025-10-01&endDate=2026-04-17` (> 180 days)  
**Then:** 400 `{ error: "Periodo nao pode exceder 180 dias." }`

---

### 2.4 Authentication Errors

#### 2.4.1 Não autenticado
**When:** Request sem token  
**Then:** 401 `{ error: "Nao autenticado." }`

#### 2.4.2 Role incorreta
**When:** User é atendimento/recepcao (não é admin)  
**Then:** 403 `{ error: "Apenas admin pode acessar relatorio de repeticoes." }`

---

### 2.5 Pagination Tests

#### 2.5.1 Default limit
**When:** Sem param `limit`  
**Then:** Retorna até 1000 registros

#### 2.5.2 Custom limit
**When:** `limit=100`  
**Then:** Retorna até 100 registros

#### 2.5.3 Limit > 5000
**When:** `limit=10000`  
**Then:** Capped em 5000 (máximo)

#### 2.5.4 Invalid limit
**When:** `limit=abc`  
**Then:** Defaults a 1000

---

## 3. Database Tests

### 3.1 Migration Applied
- [ ] Coluna `repetition_reason` existe em `exam_repetitions`
- [ ] Índice `exam_repetitions_repetition_reason_idx` existe
- [ ] Stored procedure `register_exam_repetition` existe
- [ ] GRANT execute está ativo para authenticated

### 3.2 Stored Procedure Tests

#### 3.2.1 Valid execution
```sql
SELECT public.register_exam_repetition(
  '{valid-queue-item-id}',
  'Qualidade ruim'
);
```
Should return: `{ "success": true, "repetitionId": "uuid" }`

#### 3.2.2 No auth
```sql
SELECT public.register_exam_repetition(
  '{queue-item-id}',
  'reason'
) as auth_check_from_null_user;
```
Should raise: `autenticacao obrigatoria`

#### 3.2.3 Wrong role
(Test with role other than atendimento)
Should raise: `sem permissao para registrar repeticao`

#### 3.2.4 Invalid reason length
```sql
SELECT public.register_exam_repetition(
  '{queue-item-id}',
  'ab'  -- only 2 chars
);
```
Should raise: `motivo deve ter entre 3 e 500 caracteres`

#### 3.2.5 Item not found
```sql
SELECT public.register_exam_repetition(
  '00000000-0000-0000-0000-000000000000',
  'reason'
);
```
Should raise: `item da fila nao encontrado`

#### 3.2.6 Invalid status
```sql
-- Item with status "aguardando"
SELECT public.register_exam_repetition(
  '{waiting-item-id}',
  'reason'
);
```
Should raise: `status invalido para repeticao`

---

## 4. Frontend Integration Tests

### 4.1 Repeat Exam Button
- [ ] Botão aparece em itens "em_atendimento" ou "finalizado"
- [ ] Botão não aparece se status é "aguardando" ou "cancelado"
- [ ] Botão desativado se não é "hoje" (historical view)
- [ ] Cor laranja, ícone ↻, texto "Repetir Exame"

### 4.2 Modal UX
- [ ] Modal abre ao clicar botão
- [ ] Textarea tem foco automático
- [ ] Placeholder é descritivo
- [ ] Counter mostra caracteres digitados (0-500)
- [ ] Botão "Confirmar" desativado se reason < 3 chars
- [ ] Botão "Confirmar" mostra "Salvando..." durante request
- [ ] ESC fecha modal
- [ ] Clique fora fecha modal
- [ ] Modal reseta ao fechar

### 4.3 Error Handling
- [ ] Erro 400 → mostra "Motivo deve ter entre 3 e 500 caracteres."
- [ ] Erro 404 → mostra "Item da fila não encontrado."
- [ ] Erro 409 → mostra "Só é permitido repetir exames em exame ou finalizados."
- [ ] Erro 403 → mostra "Apenas atendentes podem registrar repetições."
- [ ] Erro 500 → mostra "Erro ao registrar repetição. Tente novamente."
- [ ] Erro na rede → mostra "Erro ao registrar repetição. Tente novamente."

### 4.4 Admin Reports
- [ ] Aba "Relatórios" > "Repetições" carrega dados
- [ ] Filtros funcionam (data, técnico, sala, exame)
- [ ] Tabela mostra colunas corretas
- [ ] Paginação funciona (5/10/15 per page)
- [ ] Motivo truncado a 2 linhas na tabela
- [ ] Total count correto

---

## 5. Realtime Integration Tests

### 5.1 POST → GET Sync
- [ ] Atendente registra repetição
- [ ] Admin vê na tabela 1-2 segundos depois (sem refresh)
- [ ] Filtros reflectem novo item

### 5.2 Multiple Clients
- [ ] 2 atendentes registram repetições simultaneamente
- [ ] Admin vê ambas

---

## 6. Edge Cases

### 6.1 Unicode/Special Characters
- [ ] Motivo com acentos: "Qualidade rúim, câmara falhou"
- [ ] Motivo com emoji: "❌ Equipamento com problema"
- [ ] Motivo com quebras: "Linha 1\nLinha 2"
- [ ] Motivo com quotes: "Disse \"não vale\""

### 6.2 Concurrent Requests
- [ ] Mesmo item repetido 2x simultaneamente
- [ ] Should use `on conflict` logic correctly
- [ ] Database constraint prevents duplicates (unique queue_item_id)

### 6.3 Historical Data
- [ ] Atendente tenta repetir item de ontem
- [ ] Botão desativado (read-only mode)
- [ ] Admin vê item em relatório

---

## 7. Performance Tests

### 7.1 Query Performance
- [ ] GET com 6 meses de dados (limit 5000) < 1s
- [ ] Index `exam_repetitions_repeated_at_idx` está sendo usado
- [ ] JOINs com queue_items e attendances eficientes

### 7.2 Concurrent Writes
- [ ] 10 atendentes registram repetições em paralelo
- [ ] Sem deadlocks
- [ ] Sem data corruption

---

## 8. Acceptance Criteria Met

- [ ] ✅ Botão "Repetir Exame" no atendimento
- [ ] ✅ Modal captura motivo (3-500 chars)
- [ ] ✅ POST `/api/clinic/queue-items/{id}/repeat-exam` funciona
- [ ] ✅ GET `/api/clinic/repetitions` com filtros funciona
- [ ] ✅ Tabela no admin mostra repetições
- [ ] ✅ RLS seguro (apenas admin vê dados)
- [ ] ✅ Stored procedure valida tudo no DB
- [ ] ✅ Realtime atualiza admin
- [ ] ✅ TypeScript sem erros
- [ ] ✅ Build sucesso
- [ ] ✅ Timezone America/Manaus aplicado

---

## 9. Test Execution

### Manual QA Steps

1. **Setup:**
   - Deploy migrations
   - Clear repetitions table
   - Login como atendente

2. **Flow 1: Register Repetition**
   - Go to `/atendimento/radiografia-extra-oral`
   - Find item in "em_atendimento"
   - Click "Repetir Exame"
   - Type reason (5-50 chars)
   - Click "Confirmar Repetição"
   - ✓ Modal closes
   - ✓ No error message

3. **Flow 2: Check Admin**
   - Login como admin
   - Go to `/admin?period=day&date=2026-04-17`
   - Click "Relatórios" > "Repetições"
   - ✓ Table loads
   - ✓ New repetition appears (within 2 sec)
   - ✓ Motivo shows in last column

4. **Flow 3: Filter**
   - Select different date range
   - ✓ Results update
   - Filter by technician
   - ✓ Fewer results
   - Filter by exam type
   - ✓ Only that type shows

5. **Flow 4: Error Cases**
   - Type reason < 3 chars
   - ✓ Button disabled
   - Click "Repetir" on item with "aguardando" status
   - ✓ Error message (409)
   - Not authenticated
   - ✓ Error message (401)

---

**Status:** Ready for QA ✅
