# Design: Publicado no iDoc como Primeiro Passo em Todos os Fluxos

**Data:** 2026-04-24  
**Status:** Aprovado

---

## Contexto

Hoje o pipeline de laudo só é criado quando `attendance.com_laudo = true`, e nenhum fluxo passa por `publicado_idoc` antes das etapas do radiologista. Exames radiográficos sem laudo não geram pipeline algum. A etapa `publicado_idoc` já existe no fluxo de fotografia, mas escaneamento não a inclui.

**Problema:** A imagem do exame pode estar pronta para publicação no iDoc antes de o laudo estar concluído — ou mesmo quando não há laudo. O sistema não deve depender do laudo para liberar a publicação.

---

## Regra Proposta

Em todos os fluxos de pós-atendimento, `publicado_idoc` deve ser a segunda etapa (após `nao_iniciado`), para qualquer tipo de exame que precise ser disponibilizado na plataforma.

---

## Fluxos Resultantes

### Laudo — com laudo (`com_laudo = true`)

```
nao_iniciado → publicado_idoc → pendente_envio → enviado_radiologista
  → devolvido_radiologista → recebido_corrigido → revisado_liberado
  → publicado_finalizado
```

### Laudo — sem laudo (`com_laudo = false`)

```
nao_iniciado → publicado_idoc → publicado_finalizado
```

### Cefalometria (sempre tem laudo)

```
nao_iniciado → publicado_idoc → pendente_envio → enviado_radiologista
  → devolvido_radiologista → recebido_corrigido → revisado_liberado
  → publicado_finalizado
```

### Fotografia (sem mudança estrutural — `publicado_idoc` já existia)

```
nao_iniciado → em_ajuste → publicado_idoc → (disponivel_impressao → enviado_impressao →) publicado_finalizado
```

> Fotografia mantém `em_ajuste` antes de `publicado_idoc` — o fluxo de ajuste de imagem precede a publicação.

### Escaneamento

```
nao_iniciado → publicado_idoc → em_ajuste → (enviado_laboratorio_externo → retornado_laboratorio →) publicado_finalizado
```

---

## Mudanças no Banco (Migration SQL)

### 1. Trigger `handle_queue_item_pipeline_opening`

**Laudo:** Remover a condição `new.com_laudo`. Criar pipeline de laudo para **todos** os exam types radiográficos finalizados:
- `periapical`, `interproximal`, `panoramica`, `tomografia`, `telerradiografia`

A metadata deve incluir `com_laudo: boolean` copiado de `new.com_laudo` (ou `target_attendance.com_laudo`, conforme a coluna disponível no `queue_items`), para que o fluxo saiba quais transições são permitidas.

**Escaneamento:** Sem mudança na lógica de criação — o pipeline já é criado hoje.

### 2. Metadata do laudo

Adicionar campo `com_laudo` (boolean) no JSONB de `pipeline_items` do tipo `laudo`:

```jsonb
{
  "source_exam_type": "panoramica",
  "com_laudo": true
}
```

Esse campo é definido no momento da criação e não muda depois. O frontend usa esse valor para determinar quais transições de status são permitidas.

### 3. Backfill

Para queue_items já finalizados (`status = 'finalizado'`) de exam types radiográficos que **não têm** `com_laudo = true` e que **não possuem** pipeline de laudo aberto ou fechado associado, criar os pipeline_items retroativamente via bloco `DO $$` na própria migration.

Esses itens retroativos devem:
- Ter `metadata = jsonb_build_object('source_exam_type', qi.exam_type, 'com_laudo', false)`
- Ter `opened_at = qi.finished_at` (ou `qi.updated_at` como fallback)
- Não calcular SLA (já foram concluídos, o SLA não é aplicável)
- Ter status `nao_iniciado` (para ficarem visíveis na esteira e poderem ser avançados manualmente)

### 4. Unique index

O índice `pipeline_items_open_unique_laudo_idx` atual garante unicidade por `(queue_item_id, pipeline_type)` onde `finished_at is null`. Exames sem laudo vão usar o mesmo índice — sem mudança necessária.

---

## Mudanças no Frontend (`pipeline-constants.ts`)

### `getLaudoNextStatuses`

Passa a receber `metadata: Record<string, unknown>` e bifurca com base em `metadata.com_laudo`:

**Com laudo (`com_laudo = true`):**
```
nao_iniciado → publicado_idoc → pendente_envio → enviado_radiologista
  → [revisado_liberado | devolvido_radiologista]
  → devolvido_radiologista → recebido_corrigido → revisado_liberado
  → publicado_finalizado
```

**Sem laudo (`com_laudo = false` ou ausente):**
```
nao_iniciado → publicado_idoc → publicado_finalizado
```

### `getNextStatuses`

Passar `metadata` para `getLaudoNextStatuses` (e `getCefalometriaNextStatuses` se extraída).

### `getEscaneamentoNextStatuses`

Inserir `publicado_idoc` após `nao_iniciado`:

```
nao_iniciado → publicado_idoc → em_ajuste → [laboratorio | publicado_finalizado]
```

### `getStatusesForType`

Atualizar as listas de status para incluir `publicado_idoc`:

- **laudo:** adicionar `"publicado_idoc"` entre `"nao_iniciado"` e `"pendente_envio"`
- **cefalometria:** idem
- **escaneamento:** adicionar `"publicado_idoc"` entre `"nao_iniciado"` e `"em_ajuste"`

---

## Escopo Fora desta Spec

- Nenhuma mudança na UI de chips/badges — os componentes já sabem renderizar `publicado_idoc`
- Nenhuma mudança na lógica de SLA para os fluxos sem laudo
- Nenhuma mudança nas permissões de RLS — quem já pode avançar o status de laudo pode avançar `publicado_idoc`
- A cefalometria continua sendo criada apenas quando `com_cefalometria = true` — sem mudança

---

## Critérios de Sucesso

1. Ao finalizar um queue_item radiográfico **sem laudo**, um pipeline_item de tipo `laudo` é criado com `metadata.com_laudo = false`
2. O fluxo desse item é `nao_iniciado → publicado_idoc → publicado_finalizado`
3. Ao finalizar um queue_item radiográfico **com laudo**, o pipeline_item inclui `publicado_idoc` antes de `pendente_envio`
4. O fluxo de escaneamento inclui `publicado_idoc` como segunda etapa
5. Itens retroativos (sem laudo, já finalizados) aparecem na esteira com status `nao_iniciado`
