# 1. Regra principal
Analisar o componente de cadastro de atendimento existente ANTES de qualquer alteração.
Não duplicar lógica. Não criar novo componente se já existir um de cadastro.
Preservar todo o comportamento atual — apenas adicionar os novos campos.

# 2. Objetivo
Adicionar ao formulário de cadastro da recepção os campos condicionais que definem
a abertura automática das esteiras pós-atendimento.
Ao final, o formulário deve capturar e salvar no banco os 4 flags:
- com_laudo
- com_cefalometria
- com_impressao_fotografia
- com_laboratorio_externo_escaneamento

# 3. Fase obrigatória antes de codar
- Localizar o componente atual de cadastro de atendimento da recepção
- Identificar como os exames são selecionados atualmente
- Verificar o tipo do attendance no database.types.ts (já atualizado com os novos campos)
- Verificar como o cadastro é submetido (server action, mutation, fetch direto)
- Não criar nada antes de ter esse mapeamento

# 4. Pedidos detalhados

## 4.1 — Campos condicionais por exame selecionado
Os campos devem aparecer SOMENTE quando o exame correspondente for selecionado.
Regras de exibição:

- Se PERIAPICAL, INTERPROXIMAL, PANORÂMICA ou TOMOGRAFIA estiver selecionado:
  → exibir toggle/checkbox: "Laudo" (com_laudo)

- Se TELERRADIOGRAFIA estiver selecionada:
  → exibir toggle/checkbox: "Cefalometria" (com_cefalometria)

- Se FOTOGRAFIA estiver selecionada:
  → exibir toggle/checkbox: "Com impressão" (com_impressao_fotografia)

- Se ESCANEAMENTO INTRA-ORAL estiver selecionado:
  → exibir toggle/checkbox: "Laboratório externo" (com_laboratorio_externo_escaneamento)

## 4.2 — Comportamento dos campos
- Aparecem logo abaixo do exame correspondente ou em seção "Desdobramentos" após os exames
- Valor padrão: false (sem laudo, sem impressão, etc.)
- Se o exame for desmarcado, o campo correspondente some E seu valor volta para false
- Campos devem ser visualmente simples: toggle ou checkbox pequeno com label clara

## 4.3 — Persistência
- Os 4 flags devem ser enviados no payload de criação do attendance
- Verificar se o server action atual aceita esses campos ou se precisa ser atualizado
- O tipo do attendance já tem esses campos — garantir que o form os inclua

## 4.4 — Sem regressão
- Todos os campos existentes continuam funcionando exatamente como antes
- A seleção de exames, prioridade, observação e número de cadastro externo não mudam

# 5. Diretrizes de implementação
- Componente em TypeScript estrito — sem any
- Usar os mesmos padrões visuais do formulário existente (Tailwind, componentes de UI já usados)
- Campos condicionais com transição suave (mostrar/esconder sem quebrar layout)
- Não criar abstração desnecessária — se 4 linhas resolvem, não criar um hook

# 6. Ordem desejada
1. Ler o componente de cadastro atual
2. Ler o server action ou função de submissão
3. Ler database.types.ts para confirmar os campos novos
4. Adicionar os campos condicionais no componente
5. Atualizar o payload de submissão
6. Testar visualmente no staging

# 7. Entregáveis obrigatórios
- [ ] Componente de cadastro atualizado com os 4 campos condicionais
- [ ] Server action ou função de submissão atualizada para incluir os flags
- [ ] Campos somem e resetam quando o exame é desmarcado
- [ ] Sem regressão no comportamento existente

# 8. Critérios de aceite
- Ao selecionar PANORÂMICA, aparece opção "Laudo": sim/não
- Ao selecionar FOTOGRAFIA, aparece opção "Com impressão": sim/não
- Ao selecionar TELERRADIOGRAFIA, aparece opção "Cefalometria": sim/não
- Ao selecionar ESCANEAMENTO INTRA-ORAL, aparece opção "Laboratório externo": sim/não
- Ao desmarcar o exame, o campo correspondente desaparece e retorna false
- O attendance é salvo com os flags corretos no banco
- A tela da recepção visual continua limpa e sem sobrecarga de informação

# 9. Restrições finais
- NÃO alterar a lógica de direcionamento para sala
- NÃO alterar campos existentes
- NÃO criar nova tela ou novo componente de cadastro — modificar o existente
- NÃO exibir os 4 campos sempre — apenas quando o exame correspondente estiver ativo
- NÃO usar inline style — apenas Tailwind