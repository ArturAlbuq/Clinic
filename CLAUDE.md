# Nome do App
Clinic

## Visão geral
Sistema interno de fila digital em tempo real para uma clínica de radiologia odontológica. O app organiza o fluxo entre recepção, atendimento e admin, substituindo o modelo manual de ficha impressa e entrega física entre setores. O objetivo é dar visibilidade operacional, reduzir atrasos, melhorar a chamada dos pacientes, registrar o andamento dos exames e oferecer acompanhamento gerencial e histórico administrativo.

O sistema foi pensado para uso interno, com operação rápida, poucos cliques e interface clara para equipe não técnica. A arquitetura e a UX devem sempre priorizar simplicidade operacional, previsibilidade e segurança, sem transformar o produto em ERP.

Perfis principais:
- recepcao
- atendimento
- admin

Fluxo principal:
- recepção cadastra paciente
- recepção informa exames, prioridade, observação e, quando aplicável, número de cadastro externo
- sistema direciona cada exame/etapa para a sala correta
- atendimento chama, inicia e conclui etapas
- admin acompanha operação, histórico, relatórios, busca e ações sensíveis

## Stack
- Next.js com App Router
- TypeScript
- Tailwind CSS
- Supabase
- Supabase Auth
- Supabase Realtime
- Vercel para deploy
- Supabase CLI para migrations e gestão de ambiente quando necessário

Ambientes desejados:
- produção separada
- staging separado
- desenvolvimento local apontando para staging quando não houver Supabase local real

## Funcionalidades implementadas
- autenticação com perfis de usuário
- fluxo principal entre recepção, atendimento e admin
- cadastro de paciente pela recepção
- suporte a múltiplos exames/etapas por paciente
- filas por sala/exame
- status operacionais como aguardando, chamado, em atendimento/em exame e concluído/finalizado
- prioridade operacional no atendimento
- painel admin com visão operacional
- filtros operacionais no admin
- separação de exames por tipo
- mapeamento de exames para salas
- uso de realtime para atualização das filas
- estrutura para relatórios e evolução do painel admin
- ações administrativas sensíveis concentradas no admin como direção preferencial do projeto

Exames a considerar como separados:
- Fotografia
- Escaneamento intra-oral
- Periapical
- Interproximal
- Panorâmica
- Telerradiografia
- Tomografia

Salas consolidadas:
- Fotos/Escaneamento
- Radiografia intra-oral
- Radiografia extra-oral
- Tomografia

## O que falta fazer
- consolidar staging e produção com segurança e migrations confiáveis
- revisar e estabilizar permissões, RLS e segurança de ações sensíveis
- fortalecer o painel admin com:
  - relatórios em aba própria
  - exportação em PDF
  - busca de pacientes por nome e número de cadastro
  - registro de exclusões
  - desempenho por atendente
- permitir edição e exclusão de cadastro de forma segura e auditável no admin
- tratar corretamente cancelamento por exame/etapa, e não por cadastro inteiro
- melhorar a gestão de pendência de retorno, incluindo volta à fila normal
- permitir visualização de outros dias em recepção e atendimento
- corrigir bugs operacionais ainda abertos
- garantir consistência entre local/staging/produção, especialmente em autenticação e credenciais de gerência

Bugs e pontos de atenção já conhecidos:
- loop infinito ao concluir etapa com prioridade
- credenciais da gerência funcionando em local e falhando em produção
- horários operacionais sumindo do admin em alguns fluxos
- ordenação dos cards do atendimento nem sempre priorizando corretamente itens ativos
- inconsistências visuais em status, labels e layout
- necessidade de timezone consistente em America/Manaus

## Padrões e convenções
### Diretrizes de produto
- Não transformar o sistema em ERP
- Não adicionar complexidade desnecessária
- Sempre priorizar simplicidade operacional
- Sempre revisar o que já existe antes de criar algo novo
- Melhorar e reaproveitar antes de duplicar lógica, componentes, enums, tabelas ou rotas
- No final, sempre diga como testar as melhorias feitas

### Diretrizes de UX
- Interface em pt-BR
- Poucos cliques
- Boa legibilidade
- Visual limpo e operacional
- Desktop e tablet como foco principal
- Evitar poluição visual e dashboards excessivos

### Diretrizes funcionais
- Sempre considerar que um paciente pode ter múltiplos exames/etapas
- Ações como cancelar, editar e excluir devem respeitar o nível correto:
  - cadastro principal
  - exame/etapa
  - sala
- Não confundir ação sobre cadastro inteiro com ação sobre exame individual
- Em geral, ações sensíveis devem ficar somente no admin, com proteção também no backend, não só na interface

### Ordenação operacional esperada no atendimento
1. Em exame
2. Chamado
3. Aguardando ser chamado
4. Concluído
5. Cancelado, se aparecer

### Busca e histórico
- O projeto valoriza busca por nome do paciente
- O projeto valoriza busca por número de cadastro externo
- O projeto valoriza consulta por período
- Histórico administrativo deve ser preservado sempre que possível

### Timezone
- Usar como referência: America/Manaus

### Convenções para prompts e implementações
Sempre que for gerar prompt para Codex ou implementar algo relevante:
- pedir análise do projeto antes de codar
- pedir plano curto antes da implementação
- considerar impacto em admin, recepção, atendimento, relatórios, histórico, busca, ordenação, realtime e timezone
- incluir critérios de aceite
- incluir entregáveis finais
- evitar escopo frouxo ou ambiguidade desnecessária

### Rotas esperadas
- /login
- /recepcao
- /atendimento
- /atendimento/[sala]
- /admin

### Definição de pronto
- recepção cadastra de forma rápida
- atendimento visualiza corretamente a fila da sala
- itens em fluxo ativo permanecem fáceis de localizar
- admin acompanha operação e histórico com clareza
- projeto sobe com setup documentado
- implementações novas respeitam padrões já consolidados no projeto
