Quero que você melhore o painel admin do sistema interno da clínica para exibir com clareza o tempo de atendimento de cada paciente, separado por exame/sala, considerando corretamente que um mesmo paciente pode fazer mais de 1 exame no mesmo atendimento.

## Objetivo
Ajustar a área do admin para que ela permita acompanhar:
1. quanto tempo cada paciente esperou por cada exame;
2. quanto tempo durou cada exame;
3. o tempo total do atendimento do paciente;
4. tudo isso de forma separada por etapa/exame, sem confundir pacientes que possuem múltiplas salas no mesmo fluxo.

## Contexto importante
O sistema já suporta:
- múltiplas etapas por paciente;
- prioridade;
- itens de fila por sala;
- visão admin do fluxo do dia.

Agora quero que o painel admin fique mais útil operacionalmente e gerencialmente, mostrando tempos por etapa.

## Regra central
Um paciente pode ter mais de um exame no mesmo atendimento.

Exemplo:
- João Silva -> panorâmico + tomografia
- Maria Souza -> fotografia/escaneamento + periapical + tomografia

O painel admin não pode tratar isso como um único bloco de tempo genérico.
Quero os tempos separados por exame/sala.

## O que quero no painel admin

### 1. Tempo por exame do paciente
Para cada paciente no admin, exibir por etapa:
- nome do exame / sala
- horário de entrada na fila daquela etapa
- horário em que foi chamado
- horário em que o exame começou
- horário em que o exame terminou
- tempo de espera daquela etapa
- tempo de execução daquela etapa
- tempo total daquela etapa

Definições:
- tempo de espera da etapa = created_at até started_at
- tempo de execução da etapa = started_at até finished_at
- tempo total da etapa = created_at até finished_at

Se algum campo ainda não existir, adapte usando a estrutura atual do projeto e proponha o menor ajuste necessário.

### 2. Tempo total do atendimento
Além dos tempos por exame, quero mostrar:
- tempo total do atendimento do paciente

Definição sugerida:
- do momento em que o atendimento foi criado até o término da última etapa concluída

Se o atendimento ainda estiver em andamento:
- mostrar o tempo acumulado até agora

### 3. Visualização correta para pacientes com múltiplos exames
O admin deve conseguir entender facilmente:
- quantas etapas o paciente tem
- quais já foram concluídas
- quais ainda estão aguardando
- quanto tempo cada uma levou ou está levando

Quero isso de forma clara, sem deixar a tela poluída.

## Formato desejado no admin

Quero que você proponha e implemente uma exibição prática, por exemplo:

### Opção de layout sugerida
Na lista de atendimentos recentes ou do dia:
- nome do paciente
- prioridade
- situação geral
- tempo total do atendimento
- bloco expansível ou seção interna com as etapas/exames

Dentro de cada atendimento:
- Panorâmico
  - espera: X min
  - execução: Y min
  - total: Z min
- Tomografia
  - espera: X min
  - execução: Y min
  - total: Z min

Se o paciente ainda estiver em andamento:
- deixar claro que o tempo está correndo
- usar rótulos como:
  - aguardando
  - em atendimento
  - finalizado

## Regras visuais
Quero algo limpo e operacional.

Requisitos:
- boa legibilidade
- leitura rápida
- não exagerar em cores
- manter foco em uso interno
- destacar tempos que estejam altos
- não transformar a tela em dashboard confuso

Sugestões:
- usar tabela simples ou cards com sublinhas por etapa
- destacar atrasos com badge discreta
- manter exame/sala sempre identificado com clareza

## Regras para cálculo de tempo
Implemente com consistência.

### Por etapa
- espera = started_at - created_at
- execução = finished_at - started_at
- total da etapa = finished_at - created_at

### Em andamento
Se a etapa estiver:
- aguardando: mostrar tempo atual de espera até agora
- chamado: mostrar tempo desde created_at ou called_at, conforme a melhor lógica operacional, mas explique a decisão
- em_atendimento: mostrar tempo de execução em andamento e também o total acumulado
- finalizado: mostrar os tempos fechados

### Do atendimento geral
- início = created_at do atendimento principal
- fim = maior finished_at entre as etapas finalizadas
- se ainda não terminou tudo, mostrar tempo correndo até o momento atual

## O que eu quero que você faça antes de implementar
Antes de codar:
1. revise a modelagem atual;
2. diga se os campos atuais já suportam isso;
3. diga se o cálculo pode ser feito apenas no frontend ou se é melhor derivar parte disso no backend;
4. proponha a abordagem mais simples e segura;
5. só então implemente.

## Requisitos técnicos
- preservar a arquitetura atual o máximo possível
- evitar refatoração desnecessária
- não adicionar bibliotecas desnecessárias
- manter compatibilidade com múltiplas etapas por paciente
- manter o painel admin rápido
- evitar queries excessivamente pesadas sem necessidade

## Se precisar ajustar dados
Se o modelo atual não estiver ideal, faça apenas o menor ajuste necessário.
Exemplos possíveis:
- garantir que cada item de fila tenha created_at, called_at, started_at e finished_at confiáveis
- ajustar queries do admin
- criar helpers utilitários para cálculo de tempos
- opcionalmente criar campos derivados apenas se realmente necessário

## Critérios de aceite
Só considerar concluído se:
- o admin conseguir ver o tempo de cada paciente separado por exame
- funcionar corretamente para pacientes com 1 exame e com múltiplos exames
- o tempo total do atendimento também aparecer
- os tempos em andamento atualizarem corretamente
- a UI continuar limpa e fácil de entender
- não houver confusão entre atendimento geral e etapas individuais

## Formato obrigatório da sua resposta final
Ao concluir, me entregue:
1. resumo do que foi alterado
2. arquivos e componentes afetados
3. lógica usada para calcular os tempos
4. observações sobre performance e escalabilidade
5. sugestões curtas para uma futura evolução

## Restrições
- não inventar features fora deste escopo
- não transformar isso em analytics avançado
- não criar excesso de gráficos
- não poluir o painel admin
- priorizar utilidade real no dia a dia

Comece agora analisando a estrutura atual e propondo a abordagem mais simples e correta. Só depois implemente.