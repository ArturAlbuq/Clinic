# Step Deadline — Enviado ao Radiologista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um prazo específico (`step_deadline`) para a etapa `enviado_radiologista`, calculado em dias úteis a partir de `opened_at`, exibido com alerta visual nos dois painéis.

**Architecture:** Nova coluna `step_deadline timestamptz` em `pipeline_items`, preenchida por trigger PostgreSQL quando o status muda para `enviado_radiologista`. O frontend lê o campo via o select base existente e exibe no lugar do `sla_deadline` quando o item está nessa etapa.

**Tech Stack:** PostgreSQL (trigger + função), Next.js App Router, Supabase, TypeScript

---

## Arquivos Modificados/Criados

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260424110000_step_deadline_enviado_radiologista.sql` | Criar | Coluna, função `add_business_days`, sla_config row, trigger |
| `src/lib/pipeline.ts` | Modificar | Adicionar `step_deadline` ao select e ao tipo |
| `src/lib/pipeline.test.ts` | Modificar | Adicionar `step_deadline: null` nos stubs do teste existente |
| `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx` | Modificar | Exibir `step_deadline` quando status = `enviado_radiologista` |
| `src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx` | Modificar | Idem |
| `src/app/(app)/admin/sla/page.tsx` | Modificar | Adicionar label `laudo_enviado_radiologista` |

---

## Task 1: Migration — coluna, função, config e trigger

**Files:**
- Create: `supabase/migrations/20260424110000_step_deadline_enviado_radiologista.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Crie `supabase/migrations/20260424110000_step_deadline_enviado_radiologista.sql` com o seguinte conteúdo:

```sql
-- 1. Nova coluna step_deadline em pipeline_items
ALTER TABLE pipeline_items ADD COLUMN step_deadline timestamptz;

-- 2. Função auxiliar add_business_days
CREATE OR REPLACE FUNCTION add_business_days(start_ts timestamptz, days int)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result timestamptz := start_ts;
  remaining int := days;
  dow int;
BEGIN
  WHILE remaining > 0 LOOP
    result := result + INTERVAL '1 day';
    dow := EXTRACT(DOW FROM result); -- 0=Sun, 6=Sat
    IF dow <> 0 AND dow <> 6 THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- 3. Linha de configuração em sla_config (prazo inicial de 3 dias úteis)
INSERT INTO sla_config (pipeline_subtype, business_days)
VALUES ('laudo_enviado_radiologista', 3)
ON CONFLICT (pipeline_subtype) DO NOTHING;

-- 4. Função do trigger
CREATE OR REPLACE FUNCTION set_step_deadline_on_enviado_radiologista()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_days int;
BEGIN
  IF NEW.status = 'enviado_radiologista' AND OLD.status <> 'enviado_radiologista' THEN
    SELECT business_days INTO v_business_days
    FROM sla_config
    WHERE pipeline_subtype = 'laudo_enviado_radiologista';

    IF v_business_days IS NOT NULL THEN
      NEW.step_deadline := add_business_days(NEW.opened_at, v_business_days);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Trigger
CREATE TRIGGER pipeline_items_step_deadline
BEFORE UPDATE ON pipeline_items
FOR EACH ROW
EXECUTE FUNCTION set_step_deadline_on_enviado_radiologista();
```

- [ ] **Step 2: Aplicar a migration no Supabase**

```bash
npx supabase db push
```

Esperado: migration aplicada sem erros. Verifique que a coluna existe:

```bash
npx supabase db execute --sql "SELECT column_name FROM information_schema.columns WHERE table_name = 'pipeline_items' AND column_name = 'step_deadline';"
```

Esperado: retorna `step_deadline`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260424110000_step_deadline_enviado_radiologista.sql
git commit -m "feat: migration — step_deadline para enviado_radiologista"
```

---

## Task 2: Tipo e select base no frontend

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/pipeline.test.ts`

- [ ] **Step 1: Adicionar `step_deadline` ao select e ao tipo em `src/lib/pipeline.ts`**

Localize a linha (≈ linha 20):
```ts
export const PIPELINE_ITEM_BASE_SELECT = `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at, finished_at,
  attendances!inner ( patient_name, deleted_at ), profiles!pipeline_items_responsible_id_fkey ( full_name )`;
```

Substitua por:
```ts
export const PIPELINE_ITEM_BASE_SELECT = `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, step_deadline, metadata, opened_at, updated_at, finished_at,
  attendances!inner ( patient_name, deleted_at ), profiles!pipeline_items_responsible_id_fkey ( full_name )`;
```

Localize o tipo `PipelineItemBaseRow` (≈ linha 23) e adicione o campo após `sla_deadline`:
```ts
  sla_deadline: string | null;
  step_deadline: string | null;
```

- [ ] **Step 2: Corrigir o stub do teste em `src/lib/pipeline.test.ts`**

Localize o objeto de item no teste (≈ linha 62) que tem `sla_deadline: null` e adicione `step_deadline: null` logo após:

```ts
        sla_deadline: null,
        step_deadline: null,
```

- [ ] **Step 3: Rodar os testes**

```bash
npm test
```

Esperado: todos os testes passam (`ok`).

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "feat: adicionar step_deadline ao tipo e select de pipeline_items"
```

---

## Task 3: Painel de pós-atendimento

**Files:**
- Modify: `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx`

- [ ] **Step 1: Trocar exibição do deadline quando status = `enviado_radiologista`**

Localize o bloco (≈ linha 517):
```tsx
                  <td
                    className={`px-4 py-3 ${getSlaAlertClass(item.sla_deadline)}`}
                  >
                    {item.sla_deadline ? (
                      formatDateTime(item.sla_deadline)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
```

Substitua por:
```tsx
                  <td
                    className={`px-4 py-3 ${getSlaAlertClass(item.status === "enviado_radiologista" ? item.step_deadline : item.sla_deadline)}`}
                  >
                    {(item.status === "enviado_radiologista" ? item.step_deadline : item.sla_deadline) ? (
                      formatDateTime((item.status === "enviado_radiologista" ? item.step_deadline : item.sla_deadline)!)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/pos-atendimento/pos-atendimento-dashboard.tsx
git commit -m "feat: exibir step_deadline no painel pos-atendimento quando enviado_radiologista"
```

---

## Task 4: Painel gerencial

**Files:**
- Modify: `src/app/(app)/pos-atendimento/gerencial/gerencial-dashboard.tsx`

- [ ] **Step 1: Trocar exibição do deadline quando status = `enviado_radiologista`**

Localize o bloco (≈ linha 623):
```tsx
                  <td
                    className={`px-4 py-3 ${getSlaClass(item.sla_deadline, item.status)}`}
                  >
                    {item.sla_deadline ? (
                      formatDateTime(item.sla_deadline)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
```

Substitua por:
```tsx
                  <td
                    className={`px-4 py-3 ${getSlaClass(item.status === "enviado_radiologista" ? item.step_deadline : item.sla_deadline, item.status)}`}
                  >
                    {(item.status === "enviado_radiologista" ? item.step_deadline : item.sla_deadline) ? (
                      formatDateTime((item.status === "enviado_radiologista" ? item.step_deadline : item.sla_deadline)!)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/pos-atendimento/gerencial/gerencial-dashboard.tsx
git commit -m "feat: exibir step_deadline no painel gerencial quando enviado_radiologista"
```

---

## Task 5: Label no painel de configuração de SLA

**Files:**
- Modify: `src/app/(app)/admin/sla/page.tsx`

- [ ] **Step 1: Adicionar label para `laudo_enviado_radiologista`**

Localize o objeto `SUBTYPE_LABELS` (≈ linha 5) e adicione a entrada:

```ts
const SUBTYPE_LABELS: Record<string, string> = {
  laudo_2d: "Laudo 2D (panorâmica, periapical, interproximal)",
  laudo_tomografia: "Laudo tomografia",
  laudo_enviado_radiologista: "Enviado ao radiologista (prazo de etapa)",
  cefalometria: "Cefalometria",
  fotografia_idoc: "Fotografia (iDoc)",
  fotografia_impressao: "Fotografia (impressão)",
  escaneamento_digital: "Escaneamento (digital)",
  escaneamento_laboratorio: "Escaneamento (laboratório externo)",
};
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/admin/sla/page.tsx
git commit -m "feat: label para laudo_enviado_radiologista no painel de SLA"
```

---

## Verificação Final

- [ ] Avançar um item de laudo para `enviado_radiologista` e verificar que `step_deadline` é preenchido automaticamente no banco
- [ ] Confirmar que o deadline aparece no painel de pós-atendimento com cor correta
- [ ] Confirmar que o deadline aparece no painel gerencial com cor correta
- [ ] Confirmar que items em outros status continuam exibindo `sla_deadline`
- [ ] Confirmar que a linha `laudo_enviado_radiologista` aparece em `/admin/sla` com o label correto e permite editar o prazo
