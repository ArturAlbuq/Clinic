# Design: Admin Dashboard Layout Patch

**Data:** 2026-04-18  
**Arquivo alvo:** `src/components/admin-dashboard.tsx`  
**Escopo:** Remoções cirúrgicas e um ajuste de layout — sem refatoração, sem novos componentes.

---

## Contexto

O painel admin tem um card "80+ esperando" no topo e um bloco "Resumo Operacional" logo abaixo dos cards. O bloco Resumo duplica informações já disponíveis na lista operacional e nos cards, gerando poluição visual. O card "80+ esperando" é útil, mas o dado de espera média (que estava enterrado no bloco removido) é mais valioso no topo.

A seção de navegação (tabs) ficou desproporcional ao card branco que a envolve — o card esticava 100% da largura enquanto as tabs ocupavam apenas o centro.

---

## Mudanças aprovadas

### 1. Substituição do card "80+ esperando" por "Espera média"

- **Onde:** `<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">` (linha ~497)
- **O que:** Remover o `<MetricCard label="80+ esperando" ...>` e inserir no mesmo slot um `<MetricCard label="Espera média" ...>` usando `getAverageWaitMinutes(queueItems.filter(...))` — lógica que já existe no bloco removido.
- **Grid:** continua `xl:grid-cols-6`, nenhuma alteração de layout nos outros cards.
- **Acento:** `cyan` (diferencia visualmente de "Aguardando" que usa `amber`).

### 2. Remoção do bloco "Resumo Operacional"

- **Onde:** `<section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">` (linhas ~506–529)
- **O que:** Remover a `<section>` inteira — inclui o painel esquerdo com 4 Pills (Em andamento, Aguardando, Finalizados, Maior espera) e a coluna direita com 3 MetricCards de prioridade (Normal, 60+ e outras, 80+).

### 3. Remoção de variáveis mortas

Após as remoções acima, as seguintes variáveis ficam sem uso e devem ser deletadas:

| Variável | Linha aprox. | Motivo |
|---|---|---|
| `topPriorityWaiting` | 345 | Alimentava só o card removido |
| `longestWaitingItem` | 350 | Alimentava só o Pill "Maior espera" |
| `longestWaitMinutes` | 354 | Derivada de `longestWaitingItem` |
| `longestWaitDisplay` | 358 | Derivada de `longestWaitMinutes` |

**Variáveis que permanecem:** `waitingAttendances`, `activeAttendances`, `finishedAttendances` — ainda usadas nos filtros e em outros MetricCards.

### 4. Centralização da seção de navegação

- **Onde:** `<section className="app-panel ...">` das tabs (linha ~531)
- **O que:** Trocar o layout `flex justify-between` (título à esquerda, tabs à direita) por centralização — card branco encolhe para abraçar o conteúdo (`inline-flex` ou `w-fit mx-auto`), tabs com padding maior (`py-2.5 px-6`), label "Navegação" acima das tabs centralizado.
- **Texto descritivo** "Operacao, busca, relatorios e exclusoes" ao lado das tabs: removido (redundante com os próprios labels das tabs).

---

## O que NÃO muda

- Nenhuma outra seção do admin (cards de sala, lista operacional, busca, relatórios, exclusões)
- Nenhuma tipagem, interface ou prop do componente
- Nenhuma lógica de filtragem ou ordenação
- Nenhum componente filho existente

---

## Critérios de aceite

- [ ] Card "80+ esperando" não aparece mais no topo
- [ ] Card "Espera média" aparece no lugar, com valor correto de `getAverageWaitMinutes`
- [ ] Bloco "Resumo Operacional" não aparece em nenhuma parte da tela
- [ ] Variáveis `topPriorityWaiting`, `longestWaitingItem`, `longestWaitMinutes`, `longestWaitDisplay` não existem mais no arquivo
- [ ] Seção de navegação centralizada, card branco proporcional às tabs
- [ ] Compilação TypeScript sem erros
- [ ] Nenhuma variável usada em outros blocos foi removida
