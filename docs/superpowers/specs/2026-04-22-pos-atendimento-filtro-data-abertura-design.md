# Design: Filtro por data de abertura no Pos-atendimento

## Contexto

O dashboard operacional de `Pós-atendimento` já permite filtrar por tipo de esteira, status, atraso e nome do paciente. A operação pediu um filtro adicional por data, mas não pela data de entrada do exame no cadastro e sim pela data em que a esteira de pós-atendimento foi aberta para aquele exame.

No código atual, essa referência já existe em `pipeline_items.opened_at` e já é usada para ordenação da tela. Portanto, a mudança é de filtragem e UX, sem necessidade de criar novos campos no banco nem alterar a hidratação dos exames.

## Objetivo

Permitir que o usuário do `Pós-atendimento` operacional filtre as esteiras por:

- um dia específico
- um intervalo `de/até`

usando `pipeline_items.opened_at` como fonte da data.

## Escopo

Incluído:

- tela `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx`
- filtro visual com campos `Dia`, `De` e `Até`
- lógica de filtro local em cima de `item.opened_at`
- regra de prioridade do campo `Dia`

Excluído:

- tela `Gerencial - Pós-atendimento`
- alterações de banco, RPC, API ou Supabase query
- mudanças em `enrichPipelineItemsWithExams`

## Abordagens consideradas

### 1. Três campos no mesmo bloco com prioridade do `Dia`

Campos `Dia`, `De` e `Até` convivem no mesmo bloco. Se `Dia` estiver preenchido, ele domina o filtro e o intervalo fica visualmente desabilitado. Se `Dia` estiver vazio, `De/Até` passa a valer.

Prós:

- resolve os dois casos de uso com baixa fricção
- preserva a rapidez da tela operacional
- exige pouca mudança estrutural

Contras:

- a prioridade do `Dia` precisa ficar explícita na interface e no código

### 2. Alternância explícita entre modo `Dia` e modo `Intervalo`

Um seletor define o modo ativo e mostra apenas os campos relevantes para aquele modo.

Prós:

- reduz ambiguidade de interpretação

Contras:

- adiciona mais um controle na barra
- torna o uso mais lento para uma necessidade simples

### 3. Apenas `De/Até`, com dia único representado por datas iguais

Mantém só dois campos e exige que a operação preencha as duas pontas com a mesma data para um filtro pontual.

Prós:

- implementação mínima

Contras:

- pior experiência para o caso principal de consulta por um único dia

## Decisão

Adotar a abordagem 1.

Ela atende ao pedido com menor custo cognitivo e menor impacto visual. A regra operacional fica:

- se `Dia` estiver preenchido, filtrar apenas esteiras abertas naquele dia
- se `Dia` estiver vazio, aplicar `De` e `Até` como intervalo
- se nenhum campo estiver preenchido, manter o comportamento atual

## Design de interface

Os novos campos entram no mesmo bloco de filtros já existente, ao lado da busca por paciente.

Ordem sugerida:

- `Tipo`
- `Status`
- `Apenas com atraso`
- `Buscar paciente`
- `Dia`
- `De`
- `Até`

Comportamento visual:

- quando `Dia` estiver preenchido, os campos `De` e `Até` ficam desabilitados visualmente
- o contador de resultados permanece no mesmo bloco
- não haverá seletor extra de modo

## Regras funcionais

### Regra principal

O filtro usa `item.opened_at`.

### Regra de prioridade

- `Dia` preenchido: ignorar `De` e `Até`
- `Dia` vazio: aplicar `De` e `Até`

### Regra de intervalo

- apenas `De`: incluir itens com `opened_at >= inicio do dia`
- apenas `Até`: incluir itens com `opened_at <= fim do dia`
- `De` + `Até`: incluir itens entre os dois limites, inclusive

### Regra de composição

O filtro de data é combinado com os filtros já existentes:

- tipo
- status
- atraso
- busca por paciente

Ou seja, o item só aparece se passar por todos os filtros ativos.

## Regra técnica de datas

Para evitar interpretação ambígua de timezone:

- o valor de `opened_at` deve ser convertido para `Date`
- os limites derivados do input `type="date"` devem ser montados como datas locais
- para `Dia`, usar início e fim do mesmo dia
- para `Até`, usar o fim do dia selecionado

Isso evita erro de corte em UTC quando o usuário escolhe uma data local.

## Mudanças previstas em código

Arquivo principal:

- `src/app/(app)/pos-atendimento/pos-atendimento-dashboard.tsx`

Mudanças esperadas:

- adicionar estados `filterOpenedDay`, `filterOpenedFrom`, `filterOpenedTo`
- adicionar inputs `type="date"` na barra de filtros
- criar utilitário local para calcular início/fim do dia com segurança
- incluir o critério de data dentro do `useMemo` de `filtered`
- desabilitar visualmente `De` e `Até` quando `Dia` estiver preenchido

Nenhuma mudança esperada em:

- `src/lib/pipeline.ts`
- queries de `page.tsx`
- backend/API/Supabase

## Testes esperados

### Casos principais

- `Dia = 2026-04-22` retorna apenas esteiras com `opened_at` nesse dia
- `De = 2026-04-20` e `Até = 2026-04-22` retorna somente itens dentro do intervalo
- `Dia` preenchido junto com `De/Até` aplica apenas `Dia`
- `De` isolado funciona
- `Até` isolado funciona
- sem data preenchida, a lista se comporta como hoje

### Casos de regressão

- busca por paciente continua funcionando combinada com data
- filtro por status continua funcionando combinado com data
- filtro `Apenas com atraso` continua funcionando combinado com data
- ordenação por SLA/abertura permanece intacta
- atualização realtime continua respeitando o filtro atual após reidratar itens

## Riscos

- interpretação errada de data por timezone ao usar strings ISO diretamente
- ambiguidade de UX se o `Dia` não deixar claro que domina o intervalo

## Critérios de aceite

- [ ] O `Pós-atendimento` operacional exibe os campos `Dia`, `De` e `Até`
- [ ] Quando `Dia` está preenchido, o filtro usa apenas esse dia
- [ ] Quando `Dia` está vazio, `De/Até` funcionam como intervalo inclusivo
- [ ] O filtro usa `pipeline_items.opened_at`
- [ ] A tela continua combinando esse filtro com tipo, status, atraso e paciente
- [ ] Nenhuma alteração é feita na tela gerencial
