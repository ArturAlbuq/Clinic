# Painel da Gerência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o perfil `gerencia` e seu painel operacional de leitura (salas, fila, métricas) sem alterar o painel Admin existente.

**Architecture:** Adicionar `gerencia` ao enum `app_role` via migration; atualizar as funções RLS `user_has_room_access` e `user_can_access_attendance` para incluir `gerencia` como role de leitura; criar rota `/gerencia` com page server component + componente `GerenciaDashboard` client-side reutilizando `useRealtimeClinicData`, `MetricCard` e `buildRoomSummaries` já existentes; criar seed SQL para o usuário `gerencia@clinic.local`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase (migration SQL + seed), `useRealtimeClinicData` hook, `buildRoomSummaries` / `buildRoomOccupancyReport` de `admin-report.ts`.

---

## File Map

| Ação | Arquivo |
|------|---------|
| Criar | `supabase/migrations/20260412030000_add_gerencia_role.sql` |
| Criar | `supabase/migrations/20260412031000_seed_gerencia_user.sql` |
| Modificar | `src/lib/database.types.ts` — adicionar `"gerencia"` ao `AppRole` |
| Modificar | `src/lib/constants.ts` — `ROLE_LABELS`, `ROLE_HOME`, `ROLE_NAVIGATION` |
| Modificar | `src/lib/auth.ts` — `redirectToRoleHome` e `requireRole` já funcionam; `listAccessibleRoomSlugs` não precisa mudar |
| Criar | `src/app/(app)/gerencia/page.tsx` — server component, guard `requireRole("gerencia")` |
| Criar | `src/components/gerencia-dashboard.tsx` — client component com realtime, métricas, salas, fila |

---

## Task 1: Migration — adicionar `gerencia` ao enum `app_role`

**Files:**
- Create: `supabase/migrations/20260412030000_add_gerencia_role.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260412030000_add_gerencia_role.sql

-- 1. Adicionar valor ao enum app_role
alter type public.app_role add value if not exists 'gerencia';

-- 2. Atualizar user_has_room_access para incluir gerencia como leitura completa
create or replace function public.user_has_room_access(target_room_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() in ('admin', 'recepcao', 'gerencia') then true
    when public.current_app_role() <> 'atendimento' then false
    else exists (
      select 1
      from public.profile_room_access pra
      where pra.profile_id = auth.uid()
        and pra.room_slug = target_room_slug
    )
  end;
$$;

-- 3. Atualizar user_can_access_attendance para incluir gerencia como leitura completa
create or replace function public.user_can_access_attendance(target_attendance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() in ('admin', 'recepcao', 'gerencia') then true
    when public.current_app_role() <> 'atendimento' then false
    else exists (
      select 1
      from public.queue_items q
      join public.profile_room_access pra
        on pra.room_slug = q.room_slug
      where q.attendance_id = target_attendance_id
        and pra.profile_id = auth.uid()
    )
  end;
$$;
```

- [ ] **Step 2: Aplicar a migration localmente**

```bash
npx supabase db push
```

Esperado: sem erros. Se o Supabase local não estiver rodando:
```bash
npx supabase start
npx supabase db push
```

- [ ] **Step 3: Verificar que o enum foi atualizado**

```bash
npx supabase db diff
```

Esperado: sem diff pendente (migration aplicada).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260412030000_add_gerencia_role.sql
git commit -m "feat(db): add gerencia to app_role enum and update RLS read functions"
```

---

## Task 2: Migration — seed do usuário `gerencia@clinic.local`

**Files:**
- Create: `supabase/migrations/20260412031000_seed_gerencia_user.sql`

- [ ] **Step 1: Criar o arquivo de seed**

> **Nota:** Em ambiente local/staging o Supabase permite criar usuários via SQL com `auth.users`. Em produção o seed deve ser executado manualmente via `supabase auth admin` ou dashboard.

```sql
-- supabase/migrations/20260412031000_seed_gerencia_user.sql

-- Cria usuário gerencia apenas se não existir (ambiente local/staging)
do $$
declare
  v_user_id uuid;
begin
  -- Verificar se já existe
  select id into v_user_id
  from auth.users
  where email = 'gerencia@clinic.local'
  limit 1;

  if v_user_id is null then
    -- Inserir no auth.users (local/staging apenas)
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at,
      aud,
      role
    ) values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'gerencia@clinic.local',
      crypt('chris@clinic123', gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', 'Gerência'),
      now(),
      now(),
      'authenticated',
      'authenticated'
    )
    returning id into v_user_id;

    -- Inserir o perfil com role gerencia
    -- (o trigger handle_new_user cria com role 'recepcao', então fazemos upsert com a role correta)
    insert into public.profiles (id, full_name, role)
    values (v_user_id, 'Gerência', 'gerencia')
    on conflict (id) do update set role = 'gerencia', full_name = 'Gerência';
  else
    -- Garantir que o perfil existente tem role gerencia
    insert into public.profiles (id, full_name, role)
    values (v_user_id, 'Gerência', 'gerencia')
    on conflict (id) do update set role = 'gerencia', full_name = 'Gerência';
  end if;
end;
$$;
```

- [ ] **Step 2: Aplicar a migration**

```bash
npx supabase db push
```

Esperado: sem erros.

- [ ] **Step 3: Confirmar que o usuário existe**

```bash
npx supabase db execute --sql "select id, email from auth.users where email = 'gerencia@clinic.local';"
```

Esperado: 1 linha com o email.

```bash
npx supabase db execute --sql "select id, full_name, role from public.profiles where role = 'gerencia';"
```

Esperado: 1 linha com `role = gerencia`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260412031000_seed_gerencia_user.sql
git commit -m "feat(db): seed gerencia@clinic.local user with gerencia role"
```

---

## Task 3: Tipos e constantes — adicionar `gerencia` ao frontend

**Files:**
- Modify: `src/lib/database.types.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Adicionar `"gerencia"` ao `AppRole` em `database.types.ts`**

Em [src/lib/database.types.ts](src/lib/database.types.ts), linha 9:

```typescript
export type AppRole = "recepcao" | "atendimento" | "admin" | "gerencia";
```

Também atualizar o enum em `Enums`:

```typescript
    Enums: {
      app_role: AppRole;
      // ...demais
    };
```

(O tipo `AppRole` já é referenciado diretamente, então basta alterar a linha 9.)

- [ ] **Step 2: Atualizar `ROLE_LABELS`, `ROLE_HOME` e `ROLE_NAVIGATION` em `constants.ts`**

Em [src/lib/constants.ts](src/lib/constants.ts), atualizar as três constantes:

```typescript
export const ROLE_LABELS: Record<AppRole, string> = {
  recepcao: "Recepcao",
  atendimento: "Atendimento",
  admin: "Admin",
  gerencia: "Gerência",
};

export const ROLE_HOME: Record<AppRole, string> = {
  recepcao: "/recepcao",
  atendimento: "/atendimento",
  admin: "/admin",
  gerencia: "/gerencia",
};

export const ROLE_NAVIGATION: Record<
  AppRole,
  Array<{
    href: string;
    label: string;
  }>
> = {
  recepcao: [{ href: "/recepcao", label: "Recepcao" }],
  atendimento: [{ href: "/atendimento", label: "Salas" }],
  admin: [{ href: "/admin", label: "Resumo do dia" }],
  gerencia: [{ href: "/gerencia", label: "Operação" }],
};
```

- [ ] **Step 3: Verificar que o build TypeScript não tem erros**

```bash
cd "c:/Users/User/3D Objects/Clinic"
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/database.types.ts src/lib/constants.ts
git commit -m "feat: add gerencia to AppRole type and role constants"
```

---

## Task 4: Componente `GerenciaDashboard`

**Files:**
- Create: `src/components/gerencia-dashboard.tsx`

Este componente é client-side, usa `useRealtimeClinicData`, `buildRoomSummaries`, `buildRoomOccupancyReport` e `MetricCard`. Foco em leitura operacional: cards de métricas, visão de salas e fila.

- [ ] **Step 1: Criar `src/components/gerencia-dashboard.tsx`**

```typescript
"use client";

import { useMemo } from "react";
import { MetricCard } from "@/components/metric-card";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { PriorityBadge } from "@/components/priority-badge";
import { buildRoomSummaries } from "@/lib/admin-report";
import { ATTENDANCE_STATUS_LABELS, ROOM_BY_SLUG, ROOM_ORDER, type RoomSlug } from "@/lib/constants";
import type {
  AttendanceRecord,
  ExamRoomRecord,
  QueueItemRecord,
} from "@/lib/database.types";
import { formatClock } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  groupAttendancesWithQueueItems,
  getAttendanceOverallStatus,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";

type Props = {
  initialAttendances: AttendanceRecord[];
  initialQueueItems: QueueItemRecord[];
  rooms: ExamRoomRecord[];
};

export function GerenciaDashboard({
  initialAttendances,
  initialQueueItems,
  rooms,
}: Props) {
  const { attendances, queueItems, realtimeStatus, realtimeError } =
    useRealtimeClinicData({
      includePendingReturns: true,
      initialAttendances,
      initialQueueItems,
    });

  const roomSummaries = useMemo(
    () => buildRoomSummaries({ attendances, queueItems, rooms }),
    [attendances, queueItems, rooms],
  );

  const activeQueueItems = useMemo(
    () => queueItems.filter((qi) => qi.status !== "finalizado" && qi.status !== "cancelado" && !qi.deleted_at),
    [queueItems],
  );

  const waitingCount = activeQueueItems.filter((qi) => qi.status === "aguardando").length;
  const calledCount = activeQueueItems.filter((qi) => qi.status === "chamado").length;
  const inProgressCount = activeQueueItems.filter((qi) => qi.status === "em_atendimento").length;

  const occupiedRooms = roomSummaries.filter((rs) => rs.activeCount > 0).length;
  const freeRooms = ROOM_ORDER.length - occupiedRooms;

  const attendancesWithItems = useMemo(() => {
    const active = groupAttendancesWithQueueItems(attendances, queueItems).filter((a) => {
      const status = getAttendanceOverallStatus(a.queueItems);
      return status === "aguardando" || status === "em_andamento";
    });
    // sortAttendancesByPriorityAndCreatedAt retorna um novo array ordenado (não é comparator)
    return sortAttendancesByPriorityAndCreatedAt(active);
  }, [attendances, queueItems]);

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Painel de Operação
        </h1>
        <RealtimeStatusBadge status={realtimeStatus} error={realtimeError} />
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Aguardando"
          value={String(waitingCount)}
          helper="pacientes na fila"
          accent="amber"
        />
        <MetricCard
          label="Chamados"
          value={String(calledCount)}
          helper="aguardando entrada"
          accent="teal"
        />
        <MetricCard
          label="Em exame"
          value={String(inProgressCount)}
          helper="em atendimento agora"
          accent="teal"
        />
        <MetricCard
          label="Salas ocupadas"
          value={String(occupiedRooms)}
          helper={`de ${ROOM_ORDER.length} salas`}
          accent={occupiedRooms === ROOM_ORDER.length ? "rose" : "slate"}
        />
        <MetricCard
          label="Salas livres"
          value={String(freeRooms)}
          helper="disponíveis agora"
          accent={freeRooms === 0 ? "rose" : "slate"}
        />
      </div>

      {/* Visão por salas */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">
          Salas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roomSummaries.map((rs) => {
            const roomConfig = ROOM_BY_SLUG[rs.roomSlug as RoomSlug];
            const isOccupied = rs.activeCount > 0;

            return (
              <div
                key={rs.roomSlug}
                className={`rounded-2xl border px-5 py-4 shadow-sm ${
                  isOccupied
                    ? "border-cyan-200 bg-cyan-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    {roomConfig?.roomName ?? rs.roomSlug}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isOccupied
                        ? "bg-cyan-200 text-cyan-900"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {isOccupied ? "Ocupada" : "Livre"}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p>
                    Em exame:{" "}
                    <span className="font-semibold text-slate-900">
                      {rs.activeCount}
                    </span>
                  </p>
                  <p>
                    Aguardando:{" "}
                    <span className="font-semibold text-slate-900">
                      {rs.waitingCount}
                    </span>
                  </p>
                  <p>
                    Finalizados hoje:{" "}
                    <span className="font-semibold text-slate-900">
                      {rs.finishedCount}
                    </span>
                  </p>
                  {rs.nextItem && (
                    <p className="mt-1 truncate text-amber-700">
                      Próximo: {rs.nextItem.attendance?.patient_name ?? "—"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Fila operacional */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">
          Fila e atendimento em andamento
        </h2>
        {attendancesWithItems.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum paciente ativo no momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-4">Paciente</th>
                  <th className="pb-2 pr-4">Prioridade</th>
                  <th className="pb-2 pr-4">Cadastro</th>
                  <th className="pb-2">Status geral</th>
                </tr>
              </thead>
              <tbody>
                {attendancesWithItems.map((a) => {
                  const overallStatus = getAttendanceOverallStatus(a.queueItems);
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {a.patient_name}
                        {a.patient_registration_number && (
                          <span className="ml-2 text-xs text-slate-400">
                            #{a.patient_registration_number}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <PriorityBadge priority={a.priority} />
                      </td>
                      <td className="py-2 pr-4 text-slate-500">
                        {formatClock(a.created_at)}
                      </td>
                      <td className="py-2 text-slate-700">
                        {ATTENDANCE_STATUS_LABELS[overallStatus]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que não há erros de import**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/gerencia-dashboard.tsx
git commit -m "feat: add GerenciaDashboard component with realtime metrics, rooms and queue"
```

---

## Task 5: Rota `/gerencia` — page server component

**Files:**
- Create: `src/app/(app)/gerencia/page.tsx`

- [ ] **Step 1: Criar `src/app/(app)/gerencia/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
import {
  fetchAttendances,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
} from "@/lib/queue";
import { GerenciaDashboard } from "@/components/gerencia-dashboard";

export const dynamic = "force-dynamic";

export default async function GerenciaPage() {
  const { supabase } = await requireRole("gerencia");

  const today = formatDateInputValue(new Date());
  const selectedDate = parseDateInput(today);
  const range = getRangeBounds("day", selectedDate);

  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
    fetchExamRooms(supabase),
  ]);

  return (
    <GerenciaDashboard
      initialAttendances={attendances}
      initialQueueItems={queueItems}
      rooms={rooms}
    />
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/"(app)"/gerencia/page.tsx
git commit -m "feat: add /gerencia route with server component and role guard"
```

---

## Task 6: Verificar guard e navegação para `gerencia`

**Files:**
- Review: `src/lib/auth.ts` (sem alteração necessária)
- Review: `src/components/app-shell.tsx`

- [ ] **Step 1: Confirmar que `requireRole` aceita `"gerencia"`**

A função em [src/lib/auth.ts](src/lib/auth.ts) já usa `AppRole` dinamicamente — ao adicionar `"gerencia"` ao tipo, o guard passa a funcionar sem código extra.

A função `redirectToRoleHome` usa `ROLE_HOME[session.profile.role]`, que agora inclui `/gerencia`. Sem alteração necessária.

- [ ] **Step 2: Verificar `app-shell.tsx` — navegação por perfil**

```bash
grep -n "ROLE_NAVIGATION\|ROLE_HOME\|profile.role" "src/components/app-shell.tsx"
```

Se `app-shell.tsx` usa `ROLE_NAVIGATION[profile.role]`, a navegação para `gerencia` já estará incluída automaticamente. Se não usar, anotar aqui para ajuste.

- [ ] **Step 3: Se necessário, ajustar `app-shell.tsx`**

Se a busca acima mostrar que o shell não usa `ROLE_NAVIGATION` dinamicamente, adicionar o suporte. Verificar antes de editar.

- [ ] **Step 4: Build final**

```bash
npx next build
```

Esperado: build sem erros.

- [ ] **Step 5: Commit (se houve alteração no app-shell)**

```bash
git add src/components/app-shell.tsx
git commit -m "fix: ensure app-shell navigation supports gerencia role"
```

---

## Task 7: Atualizar `supabase/schema.sql`

**Files:**
- Modify: `supabase/schema.sql`

O `schema.sql` deve refletir o estado atual do banco para novos deploys.

- [ ] **Step 1: Regenerar o schema**

```bash
npx supabase db dump --schema public > supabase/schema.sql
```

- [ ] **Step 2: Verificar que `gerencia` aparece no enum**

```bash
grep "gerencia" supabase/schema.sql
```

Esperado: pelo menos uma linha com `'gerencia'` no enum `app_role`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "chore: update schema.sql to include gerencia role"
```

---

## Task 8: Teste de aceitação manual

Estes são os cenários do spec `painelgeren`. Validar todos antes de declarar pronto.

- [ ] **Cenário A — Admin continua funcionando**
  - Autenticar com usuário admin
  - Confirmar que `/admin` carrega sem erros
  - Confirmar que todas as abas (Operacao, Busca, Relatórios, Exclusões) funcionam

- [ ] **Cenário B — Gerência autentica com perfil correto**
  - Autenticar com `gerencia@clinic.local` / `chris@clinic123`
  - Confirmar que o sistema redireciona para `/gerencia`
  - Confirmar que o painel carrega sem erros

- [ ] **Cenário C — Visão de salas**
  - No painel da gerência, confirmar que os 4 cards de salas aparecem
  - Confirmar que salas com itens ativos mostram "Ocupada"
  - Confirmar que salas sem itens mostram "Livre"

- [ ] **Cenário D — Fila e atendimento**
  - Confirmar que a tabela de fila mostra pacientes com status aguardando/em andamento
  - Confirmar que cards de métricas mostram contagens corretas

- [ ] **Cenário E — Previsão operacional**
  - Confirmar que "Próximo" aparece no card da sala quando há item aguardando

- [ ] **Cenário F — Gerência não tem ações sensíveis**
  - Confirmar que não há botões de cancelar, editar ou excluir no painel da gerência

- [ ] **Cenário G — Guards e rotas**
  - Tentar acessar `/admin` com usuário gerencia → deve redirecionar para `/gerencia`
  - Tentar acessar `/gerencia` com usuário admin → deve redirecionar para `/admin`
  - Tentar acessar `/gerencia` sem autenticação → deve redirecionar para `/login`

- [ ] **Cenário H — Realtime**
  - Confirmar que o badge de realtime mostra "Tempo real ativo" após conexão
  - Criar um atendimento na recepção e confirmar que aparece no painel da gerência sem reload

---

## Resumo de Impactos

| Área | Impacto |
|------|---------|
| Admin | Nenhum — painel intacto, apenas tipo expandido |
| Gerência | Nova rota `/gerencia`, perfil, seed |
| Recepção | Nenhum |
| Atendimento | Nenhum |
| Relatórios | Nenhum — `gerencia` não acessa `/admin` |
| Histórico | Nenhum |
| Busca | Nenhum |
| Ordenação | Nenhum |
| Realtime | Funciona via `useRealtimeClinicData` já existente |
| Timezone | `formatClock` e `formatDateInputValue` já usam `America/Manaus` |

---

## Como aplicar no projeto

1. **Rodar as migrations** (ambiente local/staging):
   ```bash
   npx supabase db push
   ```
2. **Verificar o usuário criado**:
   ```bash
   npx supabase db execute --sql "select email from auth.users where email = 'gerencia@clinic.local';"
   ```
3. **Build para confirmar sem erros**:
   ```bash
   npx next build
   ```
4. **Testar os cenários A–H** descritos na Task 8.
5. **Produção:** a migration `20260412030000_add_gerencia_role.sql` precisa ser aplicada. O seed `20260412031000_seed_gerencia_user.sql` deve ser executado manualmente no painel Supabase de produção (ou via `supabase db push` apontando para produção), pois inserir em `auth.users` via SQL direto só funciona com acesso service_role.
