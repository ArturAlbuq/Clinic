# Laudo por Exame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma esteira de pós-atendimento de Laudo separada por exame, em vez de agrupar todos os exames de laudo de um atendimento numa única esteira.

**Architecture:** O trigger `handle_queue_item_pipeline_opening` hoje chama `create_pipeline_item_if_missing`, que reutiliza o pipeline_item aberto se já existe um do mesmo tipo. A mudança remove esse reaproveitamento para o tipo `laudo` — cada queue_item com `com_laudo = true` gera sempre um pipeline_item próprio. No front, a coluna "Exame" (singular) exibe apenas o badge do exame daquele pipeline_item. O backfill desfaz o agrupamento existente: pipeline_items de laudo com múltiplos queue_items linkados são mantidos para o primeiro exame e novos pipeline_items são criados para os demais.

**Tech Stack:** Supabase (SQL migration), Next.js App Router, TypeScript, Tailwind CSS.

---

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/20260422100000_laudo_pipeline_per_exam.sql` | Criar — nova migration |
| `src/lib/pipeline.ts` | Modificar — `enrichPipelineItemsWithExams` e `inferPipelineExamsFromQueueItems` |
| `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx` | Modificar — cabeçalho "Exames" → "Exame" |

---

## Task 1: Migration SQL — um pipeline_item de laudo por exame

**Files:**
- Create: `supabase/migrations/20260422100000_laudo_pipeline_per_exam.sql`

O trigger atual chama `create_pipeline_item_if_missing`, que reaproveitará o pipeline_item existente se já houver um do mesmo tipo aberto. A nova função `create_laudo_pipeline_item` ignora esse reaproveitamento e sempre insere um pipeline_item novo para laudo.

O backfill:
1. Para cada pipeline_item de laudo que tem mais de um queue_item linkado, mantém o link com o queue_item mais antigo (o original) e remove os demais de `pipeline_item_queue_items`.
2. Para cada queue_item removido, cria um pipeline_item novo exclusivo.

- [ ] **Criar o arquivo da migration**

```sql
-- Cada exame com laudo gera sua propria esteira de pos-atendimento.
-- Antes: create_pipeline_item_if_missing reaproveitava o pipeline_item aberto.
-- Agora: laudos sempre criam um pipeline_item exclusivo por queue_item.

-- 1. Funcao que cria pipeline_item de laudo sem verificar se ja existe um aberto
create or replace function public.create_laudo_pipeline_item(
  p_attendance_id uuid,
  p_queue_item_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_pipeline_item_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
begin
  -- Verifica se ja existe um pipeline_item de laudo para este queue_item especifico
  select piqi.pipeline_item_id
  into created_pipeline_item_id
  from public.pipeline_item_queue_items piqi
  join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
  where piqi.queue_item_id = p_queue_item_id
    and pi.pipeline_type = 'laudo'
    and pi.finished_at is null
  limit 1;

  if created_pipeline_item_id is not null then
    return created_pipeline_item_id;
  end if;

  v_sla_subtype := public.resolve_sla_subtype('laudo'::public.pipeline_type, coalesce(p_metadata, '{}'::jsonb));
  if v_sla_subtype is not null then
    select business_days into v_business_days
    from public.sla_config
    where pipeline_subtype = v_sla_subtype;
  end if;

  if v_business_days is not null then
    v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
  end if;

  insert into public.pipeline_items (
    attendance_id,
    queue_item_id,
    pipeline_type,
    metadata,
    created_by,
    sla_deadline
  )
  values (
    p_attendance_id,
    p_queue_item_id,
    'laudo'::public.pipeline_type,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by,
    v_sla_deadline
  )
  returning id
  into created_pipeline_item_id;

  perform public.attach_queue_item_to_pipeline_item(
    created_pipeline_item_id,
    p_queue_item_id
  );

  return created_pipeline_item_id;
end;
$$;

-- 2. Atualiza o trigger para usar create_laudo_pipeline_item em vez de create_pipeline_item_if_missing
create or replace function public.handle_queue_item_pipeline_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attendance public.attendances%rowtype;
  pipeline_created_by uuid;
  pipeline_metadata jsonb;
begin
  select *
  into target_attendance
  from public.attendances
  where id = new.attendance_id;

  if target_attendance.id is null then
    return new;
  end if;

  pipeline_created_by := coalesce(
    auth.uid(),
    new.finished_by,
    new.started_by,
    new.called_by,
    target_attendance.created_by
  );

  -- Laudo: um pipeline_item exclusivo por queue_item
  if new.com_laudo
    and new.exam_type in (
      'periapical',
      'interproximal',
      'panoramica',
      'tomografia'
    ) then
    perform public.create_laudo_pipeline_item(
      new.attendance_id,
      new.id,
      jsonb_build_object('source_exam_type', new.exam_type),
      pipeline_created_by
    );
  end if;

  -- Cefalometria: continua por cadastro
  if target_attendance.com_cefalometria
    and new.exam_type = 'telerradiografia' then
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'cefalometria',
      jsonb_build_object('source_exam_type', new.exam_type),
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'fotografia' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);
    if target_attendance.com_impressao_fotografia then
      pipeline_metadata := pipeline_metadata || jsonb_build_object('com_impressao', true);
    end if;
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'fotografia',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  if new.exam_type = 'escaneamento_intra_oral' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);
    if target_attendance.com_laboratorio_externo_escaneamento then
      pipeline_metadata := pipeline_metadata || jsonb_build_object('laboratorio_externo', true);
    end if;
    perform public.create_pipeline_item_if_missing(
      new.attendance_id,
      new.id,
      'escaneamento',
      pipeline_metadata,
      null,
      pipeline_created_by
    );
  end if;

  return new;
end;
$$;

-- 3. Backfill: desfaz agrupamentos existentes em pipeline_items de laudo abertos
-- Para cada pipeline_item de laudo aberto com mais de 1 queue_item linkado:
--   - mantém o link com o queue_item mais antigo
--   - cria um pipeline_item novo para cada queue_item excedente
do $$
declare
  r record;
  extra_qi record;
  new_pi_id uuid;
  v_sla_subtype text;
  v_business_days integer;
  v_sla_deadline timestamptz;
begin
  for r in
    select pi.id as pipeline_item_id, pi.attendance_id, pi.metadata, pi.created_by
    from public.pipeline_items pi
    where pi.pipeline_type = 'laudo'
      and pi.finished_at is null
      and (
        select count(*)
        from public.pipeline_item_queue_items piqi
        where piqi.pipeline_item_id = pi.id
      ) > 1
  loop
    -- Para cada queue_item alem do mais antigo, cria pipeline_item proprio
    for extra_qi in
      select piqi.queue_item_id, qi.exam_type
      from public.pipeline_item_queue_items piqi
      join public.queue_items qi on qi.id = piqi.queue_item_id
      where piqi.pipeline_item_id = r.pipeline_item_id
      order by qi.created_at asc
      offset 1  -- pula o mais antigo (que fica no pipeline_item original)
    loop
      -- Remove o link excedente do pipeline_item original
      delete from public.pipeline_item_queue_items
      where pipeline_item_id = r.pipeline_item_id
        and queue_item_id = extra_qi.queue_item_id;

      -- Cria pipeline_item exclusivo para esse queue_item
      v_sla_subtype := public.resolve_sla_subtype(
        'laudo'::public.pipeline_type,
        jsonb_build_object('source_exam_type', extra_qi.exam_type)
      );
      v_business_days := null;
      v_sla_deadline := null;

      if v_sla_subtype is not null then
        select business_days into v_business_days
        from public.sla_config
        where pipeline_subtype = v_sla_subtype;
      end if;

      if v_business_days is not null then
        v_sla_deadline := public.add_business_days(timezone('utc', now()), v_business_days);
      end if;

      insert into public.pipeline_items (
        attendance_id,
        queue_item_id,
        pipeline_type,
        metadata,
        created_by,
        sla_deadline
      )
      values (
        r.attendance_id,
        extra_qi.queue_item_id,
        'laudo'::public.pipeline_type,
        jsonb_build_object('source_exam_type', extra_qi.exam_type),
        r.created_by,
        v_sla_deadline
      )
      returning id into new_pi_id;

      insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
      values (new_pi_id, extra_qi.queue_item_id)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;
```

- [ ] **Aplicar a migration no staging via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` com `project_id = zyzlrilkqukcgyjztbmb`, `name = laudo_pipeline_per_exam`, e o conteúdo SQL acima.

- [ ] **Verificar que a migration foi aplicada**

Execute no banco:
```sql
select proname from pg_proc where proname = 'create_laudo_pipeline_item';
```
Resultado esperado: 1 linha com `create_laudo_pipeline_item`.

- [ ] **Verificar backfill**

```sql
select pi.id, count(piqi.queue_item_id) as links
from public.pipeline_items pi
join public.pipeline_item_queue_items piqi on piqi.pipeline_item_id = pi.id
where pi.pipeline_type = 'laudo' and pi.finished_at is null
group by pi.id
having count(piqi.queue_item_id) > 1;
```
Resultado esperado: 0 linhas (nenhum pipeline_item de laudo aberto com mais de 1 link).

- [ ] **Commit**

```bash
git add supabase/migrations/20260422100000_laudo_pipeline_per_exam.sql
git commit -m "feat: create one laudo pipeline_item per exam instead of grouping"
```

---

## Task 2: Front-end — adaptar pós-atendimento para exame singular

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx`

O dashboard exibe uma coluna "Exames" com `PipelineExamBadges`. Como agora cada pipeline_item de laudo tem exatamente 1 exame, renomear a coluna para "Exame" e garantir que o `enrichPipelineItemsWithExams` não quebre quando `pipeline_item_queue_items` retorna exatamente 1 link por pipeline_item de laudo.

A função `enrichPipelineItemsWithExams` em `src/lib/pipeline.ts` já lida corretamente com 1 link — nenhuma alteração de lógica necessária. Apenas o cabeçalho da tabela muda.

- [ ] **Renomear cabeçalho da coluna no dashboard**

Em [pos-atendimento-dashboard.tsx](src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx), linha 354, alterar:

```tsx
// antes
<th className="px-4 py-3 font-medium">Exames</th>

// depois
<th className="px-4 py-3 font-medium">Exame</th>
```

- [ ] **Verificar que `inferPipelineExamsFromQueueItems` em `src/lib/pipeline.ts` trata laudo corretamente no fallback**

A função em [pipeline.ts:68-88](src/lib/pipeline.ts) chama `getQueueItemPipelineType`, que retorna `'laudo'` para um queue_item com `com_laudo = true`. No fallback (quando `pipeline_item_queue_items` não existe), ela faz match por `attendance_id + pipeline_type`. Com pipeline_items separados por exame, o match pode retornar o pipeline_item errado pois pega o mais recente com `opened_at <= eventAt`.

Ajustar `inferPipelineExamsFromQueueItems` para preferir o pipeline_item cujo `queue_item_id` (campo legado) bate com o queue_item sendo processado, antes de cair no match por tempo:

Em [pipeline.ts:94-130](src/lib/pipeline.ts), substituir a função inteira:

```typescript
function inferPipelineExamsFromQueueItems(
  items: PipelineItemBaseRow[],
  queueItems: LegacyQueueItemRow[],
) {
  const inferred = new Map<string, PipelineLinkedExam[]>();

  for (const queueItem of queueItems) {
    const pipelineType = getQueueItemPipelineType(queueItem);

    if (!pipelineType) {
      continue;
    }

    // Para laudo, tenta match direto pelo queue_item_id legado primeiro
    const directMatch =
      pipelineType === "laudo"
        ? items.find(
            (item) =>
              item.queue_item_id === queueItem.id &&
              item.pipeline_type === pipelineType,
          )
        : undefined;

    const eventAt = new Date(getQueueItemPipelineEventAt(queueItem)).getTime();
    const matchedItem =
      directMatch ??
      items
        .filter(
          (item) =>
            item.attendance_id === queueItem.attendance_id &&
            item.pipeline_type === pipelineType &&
            new Date(item.opened_at).getTime() <= eventAt,
        )
        .sort(
          (left, right) =>
            new Date(right.opened_at).getTime() -
            new Date(left.opened_at).getTime(),
        )[0];

    if (!matchedItem) {
      continue;
    }

    const current = inferred.get(matchedItem.id) ?? [];
    current.push(normalizePipelineExam(queueItem));
    inferred.set(matchedItem.id, current);
  }

  return inferred;
}
```

- [ ] **Commit**

```bash
git add src/lib/pipeline.ts src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx
git commit -m "feat: show one exam per laudo row in pos-atendimento"
```

---

## Como testar

1. No staging, cadastre um paciente com Periapical + Interproximal + Panoramica, todos com Laudo marcado.
2. Vá para a sala de Radiografia intra-oral e finalize os 3 exames.
3. Abra `/pos-atendimento` — devem aparecer **3 linhas separadas** de Laudo, uma para cada exame, cada uma com status e responsável independentes.
4. Avance o status de uma delas — as outras não devem ser afetadas.
5. Verifique que atendimentos antigos (backfill) também aparecem separados.
