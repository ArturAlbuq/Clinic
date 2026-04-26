# Design: Edição de flags de exame pós-cadastro

**Data:** 2026-04-23  
**Perfis autorizados:** `gerencia`, `admin`

## Problema

Se um exame for cadastrado com uma marcação errada (ex: com impressão quando não deveria, ou sem laudo quando deveria ter), o pipeline_item correspondente é criado incorretamente e pode bloquear ou ignorar etapas no pós-atendimento. Atualmente não é possível corrigir isso depois do cadastro.

## Solução

Dois pontos de acesso, mesmo comportamento:

**1. Gerencial / Admin (`/pos-atendimento/gerencial`)**  
No `CorrectFlagsModal` — novo modal acessível via botão "Corrigir flags" na linha de cada `pipeline_item`, ao lado de "Corrigir status", "Reabrir", "Auditoria".

**2. Edição de atendimento (recepção, admin, gerência)**  
No `ReceptionEditAttendanceCard` — quando o usuário logado é `admin` ou `gerencia`, as flags (laudo por exame, impressão, laboratório, cefalometria) ficam desbloqueadas (`pipelineFlagsReadOnly = false`). Ao salvar, a API executa a RPC que sincroniza tudo.

## Flags editáveis por tipo de pipeline_item

| Flag visível | Tipo de pipeline | Fonte de origem |
|---|---|---|
| Com laudo (por exame) | `laudo` | `queue_items.com_laudo` |
| Com cefalometria | `cefalometria` | `attendances.com_cefalometria` |
| Com impressão (foto) | `fotografia` | `attendances.com_impressao_fotografia` |
| Laboratório externo | `escaneamento` | `attendances.com_laboratorio_externo_escaneamento` |

## Comportamento ao salvar

- **Flag desmarcada (pipeline_item existente):** fecha o pipeline_item correspondente com status `publicado_finalizado` + registra evento de auditoria em `pipeline_events`
- **Flag marcada (pipeline_item inexistente):** cria novo pipeline_item com status `pendente_envio` + evento de auditoria
- **Sem mudança de existência:** apenas sincroniza o `metadata` do pipeline_item e a coluna de origem
- Em todos os casos: atualiza a fonte de origem (`attendances` e/ou `queue_items`) atomicamente

## Arquitetura

### RPC: `correct_exam_flags`

Nova função Postgres. Assinatura:

```sql
correct_exam_flags(
  p_attendance_id uuid,
  p_com_cefalometria boolean,
  p_com_impressao_fotografia boolean,
  p_com_laboratorio_externo_escaneamento boolean,
  p_com_laudo_per_exam jsonb,   -- { "periapical": true, "panoramica": false, ... }
  p_reason text,
  p_performed_by uuid
) returns jsonb
```

Responsabilidades:
1. Valida que o usuário é `gerencia` ou `admin`
2. Atualiza `attendances` (3 flags booleanas)
3. Atualiza `queue_items.com_laudo` para cada exame em `p_com_laudo_per_exam`
4. Para cada flag desmarcada: fecha pipeline_items ativos do tipo correspondente + insere em `pipeline_events`
5. Para cada flag marcada sem pipeline_item ativo: cria novo pipeline_item em `pendente_envio` + insere em `pipeline_events`
6. Atualiza `pipeline_items.metadata` dos itens afetados
7. Retorna `{ attendance, queueItems, affectedPipelineItems }`

### API Route: `PATCH /api/clinic/attendances/[id]/correct-flags`

- Restrição: `requireRole(["gerencia", "admin"])`
- Chama a RPC `correct_exam_flags`
- Retorna o payload da RPC para atualizar o estado do cliente

### Frontend — Gerencial: `CorrectFlagsModal`

Novo componente `src/app/(app)/pos-atendimento/gerencial/correct-flags-modal.tsx`:
- Recebe o `pipeline_item` selecionado e o `attendance` correspondente
- Mostra apenas as flags relevantes ao tipo do item (ex: só "com impressão" para `fotografia`)
- Campo de motivo obrigatório (mínimo 5 caracteres)
- Aviso: "Esta ação pode fechar ou criar itens na esteira"
- Ao confirmar: chama `PATCH /api/clinic/attendances/[id]/correct-flags`
- Em `GerencialDashboard`: botão "Corrigir flags" → abre modal, ao confirmar refaz `fetchPage`

### Frontend — Edição de atendimento

Em `ReceptionEditAttendanceCard`:
- Recebe a role do usuário logado (novo prop `currentRole`)
- `pipelineFlagsReadOnly` passa a ser `currentRole !== "admin" && currentRole !== "gerencia"`
- `onTogglePipelineFlag` e `onToggleLaudo` são ativados para admin/gerência
- Ao `submitEdit`: se houver mudança nas flags E o role for admin/gerência, o card faz **duas chamadas sequenciais**: primeiro a edição normal (`PATCH /api/clinic/attendances/[id]`), depois a correção de flags (`PATCH /api/clinic/attendances/[id]/correct-flags`). Se a segunda falhar, exibe erro informando que o cadastro foi salvo mas as flags não foram sincronizadas.
- O campo de motivo para a correção de flags é incluído no próprio formulário de edição quando o role permite (ex: "Motivo da correção de marcações")

`AttendanceRowExpanded` precisa receber e repassar `currentRole`.

## Migration SQL

Uma migration nova com a função `correct_exam_flags`.

## Fluxo de dados resumido

```
[Modal / EditCard] 
  → PATCH /api/clinic/attendances/[id]/correct-flags
    → RPC correct_exam_flags (atômico)
      → UPDATE attendances
      → UPDATE queue_items (com_laudo)
      → UPDATE/INSERT pipeline_items + pipeline_events
    → retorna estado atualizado
  → frontend atualiza estado local
```
