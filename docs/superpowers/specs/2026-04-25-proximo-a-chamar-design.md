# Design Spec — Destaque "Próximo a Chamar"

**Data:** 2026-04-25  
**Escopo:** Visual apenas — zero mudança em queries, mutations, RLS ou estrutura de dados.

---

## Objetivo

Adicionar destaque visual ao paciente que deve ser chamado a seguir em cada sala, para que o atendente identifique imediatamente quem chamar — sem precisar raciocinar sobre a ordem.

---

## Regra de negócio: quem é o "próximo a chamar"

O próximo a chamar é o item com `status = 'aguardando'` de maior prioridade, desempatado por `created_at ASC`:

1. `oitenta_mais` primeiro
2. `sessenta_mais_outras` segundo
3. `normal` por último
4. Dentro da mesma prioridade: quem entrou na fila antes (`getQueueItemQueueStartAt` ASC)

**Importante:** essa lógica é independente da ordenação atual da lista na tela (que usa tempo de chegada como critério primário). O destaque é calculado separadamente, no frontend, a partir dos dados já carregados — sem nova query.

---

## Destaque visual: Opção A (badge + borda)

### No painel da sala — `room-queue-board.tsx`

**O que muda no card do próximo:**
- `ring-2 ring-amber-400 ring-offset-2` adicionado ao `<article>` (além das classes existentes)
- `border-2 border-amber-400` substitui `border` no `<article>`
- Badge `Próximo a chamar` (âmbar sólido, ícone estrela) inserido ao lado do nome do paciente, após os badges existentes

**Badge:**
```tsx
<span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950 shadow-sm">
  <Star className="h-3.5 w-3.5" fill="currentColor" />
  Próximo a chamar
</span>
```

**Regras:**
- Aparece somente se `item.id === nextToCallId`
- `nextToCallId` é `null` se não há itens `aguardando`
- Nunca aparece em itens com status diferente de `aguardando`

### Na visão geral — `attendance-overview.tsx`

**O que muda no bloco "Proximo paciente" do card de sala:**
- Quando `nextItem !== null`: borda do bloco muda de `border-slate-200` para `border-amber-400`, fundo de `bg-white/85` para `bg-amber-50`, adiciona `ring-1 ring-amber-300`
- Badge `Próximo a chamar` inserido no header do bloco (ao lado do label "Proximo paciente")

**Regras:**
- O `nextItem` já é calculado na linha 171 do `attendance-overview.tsx` como `visibleRoomItems.find(item => item.status === "aguardando")` — esse `find` precisa ser substituído pela mesma lógica de prioridade usada no painel da sala
- Quando `nextItem === null`: bloco mantém visual neutro atual

---

## Lógica de `nextToCallId` / `getNextToCall`

Extrair função utilitária `getNextAguardando` em `src/lib/queue.ts`:

```ts
export function getNextAguardando<T extends QueueItemWithAttendance>(
  items: T[],
): T | null {
  const aguardando = items.filter((item) => item.status === "aguardando");
  if (!aguardando.length) return null;

  return aguardando.reduce((best, item) => {
    const bestRank = getPriorityRank(best.attendance?.priority ?? "normal");
    const itemRank = getPriorityRank(item.attendance?.priority ?? "normal");
    if (itemRank < bestRank) return item;
    if (itemRank === bestRank) {
      const bestTime = new Date(getQueueItemQueueStartAt(best)).getTime();
      const itemTime = new Date(getQueueItemQueueStartAt(item)).getTime();
      return itemTime < bestTime ? item : best;
    }
    return best;
  });
}
```

Essa função é usada em:
1. `room-queue-board.tsx` — via `useMemo` sobre `visibleItems`, para calcular `nextToCallId`
2. `attendance-overview.tsx` — substitui o `find` atual para calcular `nextItem` corretamente por prioridade

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/queue.ts` | Adicionar `getNextAguardando()` |
| `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx` | `useMemo` para `nextToCallId`, badge + ring no card |
| `src/app/(app)/atendimento/attendance-overview.tsx` | Substituir `find` por `getNextAguardando`, destaque no bloco "Proximo paciente" |

**Arquivos não tocados:** qualquer outro arquivo do projeto.

---

## Critérios de aceite

- Atendente identifica imediatamente quem chamar sem raciocinar sobre a ordem
- 80+ sempre destacado antes de 60+, que aparece antes de normal
- Destaque desaparece quando o paciente é chamado (mudança de status para `chamado`)
- Salas sem fila: nenhum destaque
- Sem quebra de layout em nenhum breakpoint
- Sem CSS inline, sem novos componentes
