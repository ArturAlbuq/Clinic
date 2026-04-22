# Design: Laudo independente por exame

**Data:** 2026-04-21  
**Status:** Aprovado

## Contexto

Hoje `com_laudo` é um único boolean na tabela `attendances`, compartilhado por todos os exames do cadastro. O trigger de abertura de pipeline lê esse flag e cria laudos para todos os exames elegíveis que forem finalizados. Não há como marcar laudo só para panorâmica sem marcar para tomografia.

A recepção solicitou que laudo seja independente por exame, com checkbox dentro do card de cada sala — igual ao padrão já existente para Cefalometria, Impressão e Laboratório externo.

## Escopo

- Exames elegíveis para laudo: `periapical`, `interproximal`, `panoramica`, `tomografia`
- `telerradiografia` não entra nessa lista (já tem cefalometria como desdobramento específico)
- Remover a seção "Desdobramentos" do final do formulário

## Mudanças

### 1. Banco de dados (migration)

**Adicionar coluna em `queue_items`:**
```sql
ALTER TABLE public.queue_items
  ADD COLUMN com_laudo boolean NOT NULL DEFAULT false;
```

**Remover coluna de `attendances`:**
```sql
ALTER TABLE public.attendances
  DROP COLUMN com_laudo;
```

**Atualizar trigger `handle_queue_item_pipeline_opening`:**
- Trocar `target_attendance.com_laudo` por `NEW.com_laudo`
- Remover o join/fetch ao attendance para este flag específico (os outros flags — cefalometria, impressao, laboratorio — continuam lidos da attendance normalmente, pois ainda são por cadastro e não por exame)

**Atualizar RPC `create_attendance_with_queue_items`:**
- Remover parâmetro `p_com_laudo boolean`
- Adicionar parâmetro `p_com_laudo_per_exam jsonb DEFAULT '{}'::jsonb`
- Ao criar cada `queue_item`, ler `p_com_laudo_per_exam ->> exam_type::text` e persisti-lo em `queue_items.com_laudo`

### 2. API (`src/app/api/clinic/attendances/route.ts`)

- Remover `p_com_laudo: body.comLaudo ?? false` da chamada RPC
- Adicionar `p_com_laudo_per_exam: body.comLaudoPerExam ?? {}` na chamada RPC
- Validação: `comLaudoPerExam` deve ser um objeto cujas chaves são exam types válidos e valores são boolean

### 3. UI — Recepção (`src/app/(app)/recepcao/`)

**`exams-section.tsx`:**
- Remover `LAUDO_EXAMS` e a seção "Desdobramentos" no final do componente
- Adicionar lógica por sala: para cada exame elegível selecionado, mostrar checkbox "Laudo" abaixo do exame dentro do card da sala
- O checkbox aparece apenas quando o exame está selecionado (mesmo padrão de Cefalometria)
- Props: trocar `pipelineFlags.com_laudo` por `laudoPerExam: Partial<Record<ExamType, boolean>>` e callback `onToggleLaudo: (examType: ExamType, value: boolean) => void`

**`reception-dashboard.tsx`:**
- Remover `com_laudo` de `PIPELINE_FLAGS_DEFAULT`
- Adicionar estado `laudoPerExam: Partial<Record<ExamType, boolean>>` inicializado como `{}`
- Ao resetar o formulário, zerar `laudoPerExam`
- Passar `laudoPerExam` e `onToggleLaudo` para `ExamsSection`
- Ao submeter, montar `comLaudoPerExam` a partir de `laudoPerExam`

**`reception-edit-attendance-card.tsx`:**
- Se existir visualização de flags de pipeline no modo de edição, adaptar para o novo modelo
- `pipelineFlagsReadOnly` continua funcionando — os checkboxes de laudo por exame ficam desabilitados após cadastro (mesmo comportamento atual)

### 4. Tipos TypeScript (`src/lib/database.types.ts`)

- Adicionar `com_laudo: boolean` em `queue_items` (Insert/Update/Row)
- Remover `com_laudo: boolean` de `attendances` (Insert/Update/Row)
- Atualizar `PipelineFlags` para remover `com_laudo` (ou manter apenas os flags que continuam na attendance)

## Critérios de aceite

- [ ] Recepção pode marcar laudo para panorâmica sem marcar para tomografia (e vice-versa)
- [ ] Recepção pode marcar laudo para periapical sem marcar para interproximal (e vice-versa)
- [ ] Checkbox "Laudo" aparece dentro do card da sala, abaixo de cada exame elegível selecionado
- [ ] Seção "Desdobramentos" removida do formulário
- [ ] Ao finalizar um exame no atendimento, o pipeline de laudo é criado apenas se `queue_item.com_laudo = true` para aquele exame específico
- [ ] Outros flags (cefalometria, impressão, laboratório) continuam funcionando normalmente
- [ ] Formulário reseta corretamente ao cadastrar novo paciente

## Entregáveis

1. Migration SQL com `ALTER TABLE queue_items ADD COLUMN com_laudo`, remoção de `attendances.com_laudo`, atualização do trigger e da RPC
2. Tipos TypeScript atualizados
3. API atualizada
4. `ExamsSection` com novo comportamento de checkbox por exame
5. `reception-dashboard` com novo estado `laudoPerExam`
