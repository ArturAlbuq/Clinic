# Publicado no iDoc como Primeiro Passo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inserir `publicado_idoc` como segunda etapa obrigatória em todos os fluxos de pipeline, e criar pipeline de laudo para exames radiográficos sem laudo.

**Architecture:** Uma migration SQL atualiza o trigger de abertura de pipeline e faz backfill dos itens faltantes. Em paralelo, `pipeline-constants.ts` é atualizado para refletir os novos fluxos de transição de status.

**Tech Stack:** PostgreSQL (Supabase), TypeScript (Next.js)

---

## Arquivos Modificados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/20260424100000_idoc_first_step.sql` | Criar — nova migration |
| `src/lib/pipeline-constants.ts` | Modificar — novos fluxos de transição |

---

## Task 1: Migration — Atualizar trigger para criar laudo sem condição `com_laudo`

**Files:**
- Create: `supabase/migrations/20260424100000_idoc_first_step.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Criar `supabase/migrations/20260424100000_idoc_first_step.sql` com o seguinte conteúdo inicial — apenas o cabeçalho e a atualização do trigger `handle_queue_item_pipeline_opening`:

```sql
-- Migration: publicado_idoc como primeiro passo em todos os fluxos
-- Mudancas:
-- 1. Trigger cria pipeline de laudo para todos os exames radiograficos,
--    independente de com_laudo. Metadata inclui com_laudo: boolean.
-- 2. Cefalometria ganha publicado_idoc no fluxo (sem mudanca no trigger).
-- 3. Backfill: queue_items radiograficos finalizados sem laudo e sem pipeline.

-- 1. Atualiza handle_queue_item_pipeline_opening
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

  -- Laudo: cria para todos os exames radiograficos, com ou sem laudo.
  -- Metadata inclui com_laudo para bifurcar o fluxo no frontend.
  if new.exam_type in (
    'periapical',
    'interproximal',
    'panoramica',
    'tomografia',
    'telerradiografia'
  ) then
    perform public.create_laudo_pipeline_item(
      new.attendance_id,
      new.id,
      jsonb_build_object(
        'source_exam_type', new.exam_type,
        'com_laudo', new.com_laudo
      ),
      pipeline_created_by
    );
  end if;

  -- Cefalometria: continua por cadastro, sem mudanca
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

  -- Fotografia: sem mudanca
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

  -- Escaneamento: sem mudanca na abertura
  if new.exam_type = 'escaneamento_intra_oral' then
    pipeline_metadata := jsonb_build_object('source_exam_type', new.exam_type);
    if target_attendance.com_laboratorio_externo_escaneamento then
      pipeline_metadata := pipeline_metadata
        || jsonb_build_object('laboratorio_externo', true);
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
```

- [ ] **Step 2: Verificar que o arquivo foi criado**

```bash
ls supabase/migrations/ | grep 20260424
```

Esperado: `20260424100000_idoc_first_step.sql`

---

## Task 2: Migration — Backfill de queue_items sem laudo e sem pipeline

**Files:**
- Modify: `supabase/migrations/20260424100000_idoc_first_step.sql`

- [ ] **Step 1: Adicionar bloco de backfill ao final da migration**

Abrir `supabase/migrations/20260424100000_idoc_first_step.sql` e adicionar ao final:

```sql
-- 2. Backfill: cria pipeline_items para queue_items radiograficos
--    finalizados sem com_laudo e sem pipeline de laudo associado.
do $$
declare
  r record;
  v_opened_at timestamptz;
begin
  for r in
    select
      qi.id           as queue_item_id,
      qi.attendance_id,
      qi.exam_type,
      qi.finished_at,
      qi.updated_at,
      qi.finished_by,
      qi.started_by,
      qi.called_by,
      a.created_by    as attendance_created_by
    from public.queue_items qi
    join public.attendances a on a.id = qi.attendance_id
    where qi.status = 'finalizado'
      and qi.com_laudo = false
      and qi.exam_type in (
        'periapical', 'interproximal', 'panoramica',
        'tomografia', 'telerradiografia'
      )
      and qi.deleted_at is null
      -- nao tem pipeline de laudo aberto ou fechado para este queue_item
      and not exists (
        select 1
        from public.pipeline_item_queue_items piqi
        join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
        where piqi.queue_item_id = qi.id
          and pi.pipeline_type = 'laudo'
      )
  loop
    v_opened_at := coalesce(r.finished_at, r.updated_at, now());

    insert into public.pipeline_items (
      attendance_id,
      queue_item_id,
      pipeline_type,
      metadata,
      created_by,
      opened_at,
      sla_deadline
    )
    values (
      r.attendance_id,
      r.queue_item_id,
      'laudo'::public.pipeline_type,
      jsonb_build_object(
        'source_exam_type', r.exam_type,
        'com_laudo', false
      ),
      coalesce(r.finished_by, r.started_by, r.called_by, r.attendance_created_by),
      v_opened_at,
      null  -- sem SLA para itens retroativos
    )
    on conflict do nothing
    returning id into r.queue_item_id; -- reutiliza variavel como temp

    -- Registra link na junction table
    -- Nota: r.queue_item_id foi sobrescrito acima com o novo pipeline_item.id
    -- Usamos uma subquery para recuperar o id recem inserido
    insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
    select pi.id, qi_inner.id
    from public.pipeline_items pi
    join public.queue_items qi_inner on qi_inner.id = pi.queue_item_id
    where pi.queue_item_id = qi_inner.id
      and pi.pipeline_type = 'laudo'
      and pi.opened_at = v_opened_at
      and pi.attendance_id = r.attendance_id
      and pi.metadata->>'source_exam_type' = r.exam_type
      and not exists (
        select 1 from public.pipeline_item_queue_items
        where pipeline_item_id = pi.id
      )
    limit 1
    on conflict do nothing;
  end loop;
end;
$$;
```

> **Nota para o Codex:** O bloco de backfill acima tem uma fragilidade na lógica de relink da junction table porque `on conflict do nothing` no INSERT da migration não retorna o ID. Reescreva o loop usando uma variável separada `new_pi_id uuid` para capturar o `returning id` e depois inserir na junction table diretamente com essa variável. Veja o padrão correto em `supabase/migrations/20260422100000_laudo_pipeline_per_exam.sql` (linhas 185–261).

- [ ] **Step 2: Reescrever o bloco de backfill com variável correta**

Substituir o bloco `do $$` por este padrão correto (espelhando `20260422100000_laudo_pipeline_per_exam.sql`):

```sql
do $$
declare
  r record;
  new_pi_id uuid;
  v_opened_at timestamptz;
begin
  for r in
    select
      qi.id           as queue_item_id,
      qi.attendance_id,
      qi.exam_type,
      qi.finished_at,
      qi.updated_at,
      qi.finished_by,
      qi.started_by,
      qi.called_by,
      a.created_by    as attendance_created_by
    from public.queue_items qi
    join public.attendances a on a.id = qi.attendance_id
    where qi.status = 'finalizado'
      and qi.com_laudo = false
      and qi.exam_type in (
        'periapical', 'interproximal', 'panoramica',
        'tomografia', 'telerradiografia'
      )
      and qi.deleted_at is null
      and not exists (
        select 1
        from public.pipeline_item_queue_items piqi
        join public.pipeline_items pi on pi.id = piqi.pipeline_item_id
        where piqi.queue_item_id = qi.id
          and pi.pipeline_type = 'laudo'
      )
  loop
    v_opened_at := coalesce(r.finished_at, r.updated_at, timezone('utc', now()));

    insert into public.pipeline_items (
      attendance_id,
      queue_item_id,
      pipeline_type,
      metadata,
      created_by,
      opened_at,
      sla_deadline
    )
    values (
      r.attendance_id,
      r.queue_item_id,
      'laudo'::public.pipeline_type,
      jsonb_build_object(
        'source_exam_type', r.exam_type,
        'com_laudo', false
      ),
      coalesce(r.finished_by, r.started_by, r.called_by, r.attendance_created_by),
      v_opened_at,
      null
    )
    returning id into new_pi_id;

    insert into public.pipeline_item_queue_items (pipeline_item_id, queue_item_id)
    values (new_pi_id, r.queue_item_id)
    on conflict do nothing;
  end loop;
end;
$$;
```

- [ ] **Step 3: Commit da migration**

```bash
git add supabase/migrations/20260424100000_idoc_first_step.sql
git commit -m "feat: migration — publicado_idoc primeiro passo, backfill sem laudo"
```

---

## Task 3: Frontend — Atualizar `pipeline-constants.ts`

**Files:**
- Modify: `src/lib/pipeline-constants.ts`

- [ ] **Step 1: Atualizar `getLaudoNextStatuses` para bifurcar por `com_laudo`**

Em `src/lib/pipeline-constants.ts`, substituir a função `getLaudoNextStatuses`:

```typescript
// Antes:
function getLaudoNextStatuses(current: PipelineStatus): PipelineStatus[] {
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["pendente_envio"],
    pendente_envio: ["enviado_radiologista"],
    enviado_radiologista: ["revisado_liberado", "devolvido_radiologista"],
    devolvido_radiologista: ["recebido_corrigido"],
    recebido_corrigido: ["revisado_liberado"],
    revisado_liberado: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}

// Depois:
function getLaudoNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const comLaudo = Boolean(metadata.com_laudo);

  if (!comLaudo) {
    const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
      nao_iniciado: ["publicado_idoc"],
      publicado_idoc: ["publicado_finalizado"],
    };
    return map[current] ?? [];
  }

  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["publicado_idoc"],
    publicado_idoc: ["pendente_envio"],
    pendente_envio: ["enviado_radiologista"],
    enviado_radiologista: ["revisado_liberado", "devolvido_radiologista"],
    devolvido_radiologista: ["recebido_corrigido"],
    recebido_corrigido: ["revisado_liberado"],
    revisado_liberado: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}
```

- [ ] **Step 2: Atualizar `getNextStatuses` para passar `metadata` a `getLaudoNextStatuses`**

Substituir o bloco de `getNextStatuses`:

```typescript
// Antes:
export function getNextStatuses(
  type: PipelineType,
  currentStatus: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  if (type === "laudo" || type === "cefalometria") {
    return getLaudoNextStatuses(currentStatus);
  }
  ...
}

// Depois:
export function getNextStatuses(
  type: PipelineType,
  currentStatus: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  if (type === "laudo") {
    return getLaudoNextStatuses(currentStatus, metadata);
  }
  if (type === "cefalometria") {
    return getCefalometriaNextStatuses(currentStatus);
  }
  if (type === "fotografia") {
    return getFotografiaNextStatuses(currentStatus, metadata);
  }
  if (type === "escaneamento") {
    return getEscaneamentoNextStatuses(currentStatus, metadata);
  }
  return [];
}
```

- [ ] **Step 3: Extrair `getCefalometriaNextStatuses` (fluxo com laudo, com `publicado_idoc`)**

Adicionar nova função após `getLaudoNextStatuses`:

```typescript
function getCefalometriaNextStatuses(current: PipelineStatus): PipelineStatus[] {
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["publicado_idoc"],
    publicado_idoc: ["pendente_envio"],
    pendente_envio: ["enviado_radiologista"],
    enviado_radiologista: ["revisado_liberado", "devolvido_radiologista"],
    devolvido_radiologista: ["recebido_corrigido"],
    recebido_corrigido: ["revisado_liberado"],
    revisado_liberado: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}
```

- [ ] **Step 4: Atualizar `getEscaneamentoNextStatuses` para inserir `publicado_idoc` após `nao_iniciado`**

Substituir a função `getEscaneamentoNextStatuses`:

```typescript
// Antes:
function getEscaneamentoNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const laboratorioExterno = Boolean(metadata.laboratorio_externo);
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["em_ajuste"],
    em_ajuste: laboratorioExterno
      ? ["enviado_laboratorio_externo"]
      : ["publicado_finalizado"],
    enviado_laboratorio_externo: ["retornado_laboratorio"],
    retornado_laboratorio: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}

// Depois:
function getEscaneamentoNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const laboratorioExterno = Boolean(metadata.laboratorio_externo);
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["publicado_idoc"],
    publicado_idoc: ["em_ajuste"],
    em_ajuste: laboratorioExterno
      ? ["enviado_laboratorio_externo"]
      : ["publicado_finalizado"],
    enviado_laboratorio_externo: ["retornado_laboratorio"],
    retornado_laboratorio: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}
```

- [ ] **Step 5: Atualizar `getStatusesForType` para incluir `publicado_idoc`**

Substituir o objeto `map` dentro de `getStatusesForType`:

```typescript
// Depois:
const map: Record<PipelineType, PipelineStatus[]> = {
  laudo: [
    "nao_iniciado",
    "publicado_idoc",
    "pendente_envio",
    "enviado_radiologista",
    "devolvido_radiologista",
    "recebido_corrigido",
    "revisado_liberado",
    "publicado_finalizado",
  ],
  cefalometria: [
    "nao_iniciado",
    "publicado_idoc",
    "pendente_envio",
    "enviado_radiologista",
    "devolvido_radiologista",
    "recebido_corrigido",
    "revisado_liberado",
    "publicado_finalizado",
  ],
  fotografia: [
    "nao_iniciado",
    "em_ajuste",
    "publicado_idoc",
    "disponivel_impressao",
    "enviado_impressao",
    "publicado_finalizado",
  ],
  escaneamento: [
    "nao_iniciado",
    "publicado_idoc",
    "em_ajuste",
    "enviado_laboratorio_externo",
    "retornado_laboratorio",
    "publicado_finalizado",
  ],
};
```

- [ ] **Step 6: Verificar TypeScript sem erros**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro de tipo.

- [ ] **Step 7: Commit das mudanças de frontend**

```bash
git add src/lib/pipeline-constants.ts
git commit -m "feat: inserir publicado_idoc nos fluxos de laudo, cefalometria e escaneamento"
```

---

## Task 4: Verificação Final

- [ ] **Step 1: Confirmar arquivos modificados**

```bash
git log --oneline -3
```

Esperado: dois commits das tasks 2 e 3.

- [ ] **Step 2: Verificar que o TypeScript compila limpo**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Testar a migration localmente (se Supabase CLI disponível)**

```bash
supabase db reset
```

Esperado: todas as migrations aplicadas sem erros. Se `supabase` não estiver disponível, pular este step e anotar para rodar manualmente.

- [ ] **Step 4: Smoke test manual dos fluxos**

Verificar na UI (pós-atendimento) que:
1. Um pipeline de laudo com `com_laudo = false` exibe apenas: `Não iniciado → Publicado no iDoc → Publicado / Finalizado`
2. Um pipeline de laudo com `com_laudo = true` exibe: `Não iniciado → Publicado no iDoc → Pendente envio → ...`
3. Um pipeline de escaneamento exibe: `Não iniciado → Publicado no iDoc → Em ajuste → ...`
4. Um pipeline de cefalometria exibe: `Não iniciado → Publicado no iDoc → Pendente envio → ...`
5. Um pipeline de fotografia mantém: `Não iniciado → Em ajuste → Publicado no iDoc → ...` (sem mudança)
