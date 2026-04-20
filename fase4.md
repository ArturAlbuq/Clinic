# 1. Regra principal
Analisar toda a estrutura existente do projeto antes de criar qualquer arquivo.
Reaproveitar componentes, layouts e padrões já estabelecidos.
Não duplicar lógica existente no painel de pós-atendimento já criado.

# 2. Objetivo
Implementar a Fase 4 do módulo de Pós-Atendimento:
- Painel gerencial com visão executiva (cards de resumo + grade filtrada)
- Ações exclusivas do admin: reabrir esteira, corrigir status, visualizar finalizados
- Parametrização de SLA por tipo de esteira no módulo admin

# 3. Fase obrigatória antes de codar
- Ler a estrutura atual de /pos-atendimento e seus componentes
- Ler a estrutura de /admin e como ações sensíveis estão implementadas lá
- Verificar database.types.ts para pipeline_items, pipeline_events e enums
- Verificar como o perfil do usuário logado é lido no projeto (profiles, role)
- Listar o que será criado antes de criar qualquer arquivo

# 4. O que deve ser implementado

## 4.1 — Aba ou subrota gerencial em /pos-atendimento
Adicionar visão gerencial acessível para admin e gerencia.
Pode ser implementada como:
- Nova aba dentro de /pos-atendimento (ex: "Operacional" | "Gerencial")
- Ou subrota /pos-atendimento/gerencial
Seguir o padrão de navegação já existente no projeto.

## 4.2 — Cards de resumo (visão executiva)
Exibir contadores em tempo real por tipo de esteira e situação:

LAUDOS
- Pendentes de envio
- Enviados ao radiologista
- Recebidos do radiologista
- Em atraso (sla_deadline < now() e status != publicado_finalizado)

CEFALOMETRIA
- Pendentes de envio
- Enviados ao radiologista
- Em atraso

FOTOGRAFIAS
- Em ajuste
- Disponíveis para impressão
- Em laboratório (enviado_impressao)
- Em atraso

ESCANEAMENTO
- Em ajuste
- Em laboratório externo
- Em atraso

GERAL
- Total finalizado hoje (finished_at::date = today, timezone Manaus)
- Total em aberto

## 4.3 — Grade gerencial
Tabela com TODOS os pipeline_items (incluindo publicado_finalizado),
com as mesmas colunas do painel operacional mais:
- finished_at (quando finalizado)
- Indicador de atraso (vermelho se sla_deadline < now())

Filtros obrigatórios:
- Data de abertura (intervalo)
- Tipo de esteira
- Status (todos os valores do enum)
- Apenas com atraso
- Finalizado / não finalizado
- Busca por nome do paciente

## 4.4 — Ações exclusivas do admin

### Reabrir esteira finalizada
- Disponível apenas para admin
- Muda status de publicado_finalizado para o status anterior ao fechamento
- Registra evento em pipeline_events com performed_by e motivo obrigatório

### Corrigir status
- Disponível apenas para admin
- Permite selecionar QUALQUER status válido para o tipo (não apenas o próximo)
- Registra evento em pipeline_events com performed_by e motivo obrigatório
- Exibir aviso: "Ação de correção — será registrada em auditoria"

### Visualizar auditoria completa
- Modal com todos os pipeline_events da esteira
- Incluindo correções e reaperturas
- Mostrar perfil do usuário (role) além do nome

## 4.5 — Parametrização de SLA no admin
Nova seção em /admin (ou subpágina /admin/sla):

Tabela de configuração com uma linha por tipo de esteira:
- Laudo 2D (panorâmica, periapical, interproximal): X dias úteis
- Laudo tomografia: X dias úteis
- Cefalometria: X dias úteis
- Fotografia (iDoc): X dias úteis
- Fotografia (impressão): X dias úteis
- Escaneamento (digital): X dias úteis
- Escaneamento (laboratório externo): X dias úteis

Valores iniciais conforme especificação:
- Laudo 2D: 3 dias úteis
- Laudo tomografia: 5 dias úteis
- Cefalometria: 3 dias úteis
- Fotografia iDoc: 2 dias úteis
- Fotografia impressão: 3 dias úteis
- Escaneamento digital: 2 dias úteis
- Escaneamento laboratório: 3 dias úteis

Ao salvar, recalcular sla_deadline dos pipeline_items em aberto
que ainda não têm sla_deadline definido.

Armazenar configuração em nova tabela sla_config:
- id
- pipeline_subtype (ex: laudo_2d, laudo_tomografia, fotografia_idoc, etc.)
- business_days integer
- updated_at
- updated_by

## 4.6 — Aplicação do SLA ao abrir esteiras
Ajustar o trigger de abertura automática das esteiras para calcular
sla_deadline com base na configuração de sla_config no momento da abertura.
Fórmula: opened_at + business_days dias úteis (segunda a sexta,
sem considerar feriados por ora).

# 5. Diretrizes de implementação
- Cards de resumo: queries agregadas no Supabase, atualizadas via
  realtime ou polling a cada 30s
- Grade gerencial: paginação obrigatória (mínimo 20 itens por página)
- Ações do admin: verificar role do usuário logado antes de exibir
  os botões — nunca confiar apenas no RLS para esconder UI
- Motivo obrigatório em reabrir e corrigir: validar no frontend antes
  de permitir submit
- SLA em dias úteis: implementar função utilitária addBusinessDays(date, days)
  em lib/utils/time.ts (ou arquivo equivalente já existente)
- Timezone: America/Manaus em todos os timestamps exibidos e calculados
- TypeScript estrito, sem any
- Tailwind apenas, sem inline style
- Reaproveitar componentes de modal, badge e tabela já existentes

# 6. Ordem desejada
1. Ler estrutura existente (pos-atendimento, admin, componentes)
2. Migration: tabela sla_config com valores iniciais
3. Ajustar trigger para usar sla_config ao abrir esteiras
4. Implementar visão gerencial com cards de resumo
5. Implementar grade gerencial com filtros e paginação
6. Implementar ações do admin (reabrir, corrigir status)
7. Implementar parametrização de SLA em /admin
8. Atualizar tipos TypeScript

# 7. Entregáveis obrigatórios
- [ ] Cards de resumo com contadores por tipo e situação
- [ ] Grade gerencial com todos os itens (incluindo finalizados)
- [ ] Filtros funcionais na grade gerencial
- [ ] Paginação na grade gerencial
- [ ] Ação "Reabrir esteira" exclusiva do admin com motivo obrigatório
- [ ] Ação "Corrigir status" exclusiva do admin com motivo obrigatório
- [ ] Evento registrado em pipeline_events em toda ação do admin
- [ ] Tela de configuração de SLA em /admin
- [ ] Trigger atualizado para calcular sla_deadline ao abrir esteira
- [ ] Função addBusinessDays implementada e utilizada
- [ ] Timezone America/Manaus aplicado em todos os timestamps
- [ ] Migration da tabela sla_config

# 8. Critérios de aceite
- Cards mostram contadores corretos em tempo real
- Grade exibe itens finalizados quando filtro incluir finalizados
- Admin consegue reabrir esteira finalizada com motivo — evento gerado
- Admin consegue corrigir status para qualquer valor válido — evento gerado
- recepcao e atendimento NÃO veem botões de reabrir ou corrigir
- Ao cadastrar novo atendimento após configurar SLA, sla_deadline
  é calculado e salvo automaticamente na esteira
- Itens com sla_deadline ultrapassado aparecem com indicador vermelho

# 9. Restrições finais
- NÃO permitir reabrir ou corrigir para recepcao e atendimento
- NÃO calcular feriados no SLA por ora — apenas dias úteis (seg–sex)
- NÃO remover ou alterar o painel operacional existente
- NÃO paginar os cards de resumo — são sempre contadores globais
- Motivo é obrigatório em reabrir e corrigir — bloquear submit se vazio
- Toda ação sensível do admin DEVE gerar evento em pipeline_events