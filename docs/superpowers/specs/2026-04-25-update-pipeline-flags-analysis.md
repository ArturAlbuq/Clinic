# Analise: correcao admin de flags de pos-atendimento

## Schema atual

### `queue_items`

Flag identificado:

- `com_laudo boolean not null default false`

Esse flag foi movido de `attendances` para `queue_items` pela migration `20260421140000_laudo_per_queue_item.sql`, permitindo laudo por exame.

### `attendances`

Flags que tambem alimentam `pipeline_items`:

- `com_cefalometria boolean not null default false`
- `com_impressao_fotografia boolean not null default false`
- `com_laboratorio_externo_escaneamento boolean not null default false`

### `pipeline_items`

Nao ha colunas booleanas dedicadas para esses flags. A tabela usa `metadata jsonb` para persistir flags de fluxo:

- `metadata.com_laudo` em itens `laudo`
- `metadata.com_impressao` em itens `fotografia`
- `metadata.laboratorio_externo` em itens `escaneamento`

## Policies existentes

### `queue_items`

Ja existe policy geral de UPDATE:

- `queue_items_update_by_room_or_admin`

Ela permite `admin` e tambem `atendimento` com acesso a sala, desde que `updated_by = auth.uid()`. Portanto, nao foi adicionada nova policy de UPDATE para admin em `queue_items`. O ponto de risco era que `atendimento` tambem poderia tentar alterar `com_laudo`; a migration nova reforca isso na trigger `guard_queue_item_mutation`.

### `pipeline_items`

Ja existe policy geral de UPDATE:

- `pipeline_items_update_by_role_and_scope`

Ela permite `recepcao`, `atendimento` e `admin` por escopo. A trigger `guard_pipeline_item_mutation` ja impede `recepcao` e `atendimento` de alterar `metadata`, `sla_deadline` e `responsible_id`. Portanto, nao foi adicionada nova policy de UPDATE em `pipeline_items`.

## Triggers existentes

### Abertura de pipeline

Existe trigger:

- `queue_items_open_pipeline_on_finalize`
- chama `handle_queue_item_pipeline_opening()`
- executa apenas quando `NEW.status = 'finalizado'` e `OLD.status <> 'finalizado'`

Comportamento atual:

- Cria `pipeline_items` de `laudo` para exames radiograficos finalizados, incluindo `metadata.com_laudo`.
- Cria `pipeline_items` de `cefalometria` quando `attendances.com_cefalometria = true` e o exame e `telerradiografia`.
- Cria `pipeline_items` de `fotografia` e inclui `metadata.com_impressao` conforme `attendances.com_impressao_fotografia`.
- Cria `pipeline_items` de `escaneamento` e inclui `metadata.laboratorio_externo` conforme `attendances.com_laboratorio_externo_escaneamento`.

Impacto: essa trigger nao propaga edicoes posteriores dos flags. Ela so roda na transicao de status para `finalizado`.

## Mudanca implementada

Migration criada:

- `supabase/migrations/20260425123000_update_pipeline_flags_rpc.sql`

Ela:

- Recria `guard_queue_item_mutation()` com bloqueio explicito para alteracao de `queue_items.com_laudo` por qualquer perfil diferente de `admin`.
- Cria RPC `public.update_pipeline_flags(...)`.

Assinatura:

```sql
public.update_pipeline_flags(
  p_queue_item_id uuid,
  p_com_laudo boolean default null,
  p_com_cefalometria boolean default null,
  p_com_impressao_fotografia boolean default null,
  p_com_laboratorio_externo_escaneamento boolean default null
)
```

Comportamento:

- Exige usuario autenticado.
- Exige `public.current_app_role() = 'admin'`.
- Atualiza `queue_items.com_laudo`.
- Atualiza os flags globais em `attendances`.
- Sincroniza `pipeline_items.metadata` para laudo, fotografia e escaneamento.
- Cria pipeline de laudo ou cefalometria quando o item elegivel ja esta finalizado e o pipeline aberto ainda nao existe.
- Nao altera manualmente status, timestamps ou campos fora dos flags/metadados necessarios.

## Impactos e limites

- `queue_items.updated_at` e `pipeline_items.updated_at` podem mudar por triggers existentes de auditoria/atualizacao automatica.
- A migration nao remove nem altera policies existentes.
- A RPC usa `SECURITY DEFINER`, mas valida internamente `auth.uid()` e role `admin` antes de qualquer update.
- Edicoes diretas em `pipeline_items.metadata` continuam bloqueadas para `recepcao` e `atendimento` pela guard existente.
- Edicoes diretas em `queue_items.com_laudo` passam a ser bloqueadas para `atendimento`, mesmo que a policy geral permita update operacional do item.

## Checklist de validacao em staging

1. Aplicar a migration no staging via Supabase CLI.
2. No Table Editor, escolher um `queue_item` finalizado com pipeline associado.
3. Como `admin`, chamar `update_pipeline_flags` alterando `p_com_laudo` e confirmar:
   - `queue_items.com_laudo` mudou.
   - `pipeline_items.metadata.com_laudo` mudou no item de `laudo` vinculado.
   - Status do `queue_item` nao mudou.
   - Status do `pipeline_item` existente nao mudou.
4. Como `admin`, alterar `p_com_impressao_fotografia` em um atendimento com fotografia e confirmar:
   - `attendances.com_impressao_fotografia` mudou.
   - `pipeline_items.metadata.com_impressao` mudou no item `fotografia`.
5. Como `admin`, alterar `p_com_laboratorio_externo_escaneamento` em um atendimento com escaneamento e confirmar:
   - `attendances.com_laboratorio_externo_escaneamento` mudou.
   - `pipeline_items.metadata.laboratorio_externo` mudou no item `escaneamento`.
6. Como `admin`, alterar `p_com_cefalometria` para `true` em atendimento com `telerradiografia` finalizada e confirmar que um `pipeline_item` de `cefalometria` aberto existe.
7. Como `recepcao`, tentar chamar a RPC e confirmar erro de permissao.
8. Como `atendimento`, tentar chamar a RPC e confirmar erro de permissao.
9. Como `atendimento`, tentar update direto de `queue_items.com_laudo` com `updated_by = auth.uid()` e confirmar bloqueio pela trigger.
10. Confirmar que nenhum campo de status foi alterado nos registros existentes.
