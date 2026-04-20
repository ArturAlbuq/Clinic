# 1. Regra principal
Analisar a estrutura de rotas e componentes existentes ANTES de criar qualquer arquivo.
Seguir os padrões visuais e de navegação já estabelecidos no projeto.
Não duplicar componentes, layouts ou lógica existente.

# 2. Objetivo
Criar o módulo de Pós-Atendimento: uma nova rota com painel operacional
para acompanhar as esteiras abertas automaticamente após a finalização do
atendimento presencial. Ao final, deve ser possível visualizar todas as
esteiras abertas, avançar status, registrar observações e filtrar por tipo.

# 3. Fase obrigatória antes de codar
- Mapear a estrutura de rotas existente em src/app/(app)/
- Identificar como o layout de navegação funciona (sidebar, tabs, links)
- Verificar como outras páginas buscam dados do Supabase (server component,
  client component com hook, ou fetch direto)
- Ler database.types.ts para confirmar os tipos de pipeline_items e pipeline_events
- Listar o que será criado antes de criar qualquer arquivo

# 4. O que deve ser implementado

## 4.1 — Nova rota
/pos-atendimento
Acessível para todos os perfis: recepcao, atendimento, admin

## 4.2 — Painel principal (/pos-atendimento)
Lista de todas as pipeline_items com status diferente de 'publicado_finalizado',
ordenadas por: atraso (vencidas primeiro) → abertura mais antiga primeiro.

Colunas da lista:
- Paciente (via attendance.patient_name)
- Exame (via queue_item.exam_type, se vinculado)
- Tipo de esteira (pipeline_type): Laudo | Cefalometria | Fotografia | Escaneamento
- Status atual (pipeline_status) — com badge colorido
- Responsável atual (profiles.full_name, se preenchido)
- Abertura (opened_at formatado em America/Manaus)
- Prazo/SLA (sla_deadline formatado, se preenchido)
- Alerta visual: verde (dentro do prazo) | amarelo (próximo) | vermelho (vencido)
  Por enquanto sla_deadline pode ser null — tratar como "sem prazo definido" (neutro)

Ação por linha:
- Botão "Avançar status" → abre modal/drawer com os próximos status possíveis
- Botão "Ver histórico" → abre modal/drawer com pipeline_events da esteira

## 4.3 — Filtros do painel
- Tipo de esteira (laudo | cefalometria | fotografia | escaneamento | todos)
- Status (select com os valores do enum pipeline_status | todos)
- Apenas com atraso (toggle/checkbox)
- Busca por nome do paciente (input de texto, filtro local ou query)

## 4.4 — Modal/drawer: Avançar status
Exibir:
- Status atual
- Lista dos próximos status possíveis (conforme mapa abaixo)
- Campo de observação (texto livre, opcional)
- Botão "Confirmar"

Ao confirmar:
- UPDATE em pipeline_items: status = novo_status, updated_at = now()
- INSERT em pipeline_events: pipeline_item_id, previous_status, new_status,
  performed_by (usuário logado), occurred_at = now(), notes = observação
- Atualizar a lista em tempo real (refetch ou realtime)

Mapa de progressão de status por tipo de esteira:

LAUDO e CEFALOMETRIA:
nao_iniciado → pendente_envio → enviado_radiologista → recebido_radiologista
→ revisado_liberado → publicado_finalizado
(desvio possível: recebido_radiologista → devolvido_radiologista
→ recebido_corrigido → revisado_liberado → publicado_finalizado)

FOTOGRAFIA:
nao_iniciado → em_ajuste → publicado_idoc → publicado_finalizado
(se com_impressao no metadata: publicado_idoc → disponivel_impressao
→ enviado_impressao → recebido_laboratorio → publicado_finalizado)

ESCANEAMENTO:
nao_iniciado → em_ajuste → publicado_finalizado
(se laboratorio_externo no metadata: em_ajuste → enviado_laboratorio_externo
→ retornado_laboratorio → publicado_finalizado)

Regra: exibir apenas os próximos status válidos para o tipo e metadata da esteira.
Não exibir publicado_finalizado antes do penúltimo status ser atingido.

## 4.5 — Modal/drawer: Histórico
Lista de pipeline_events da esteira selecionada:
- Data/hora (America/Manaus)
- Usuário (profiles.full_name)
- Status anterior → novo status
- Observação (se houver)
Ordenado por occurred_at ASC (mais antigo primeiro).

## 4.6 — Link de navegação
Adicionar link "Pós-atendimento" na navegação existente do app,
visível para recepcao, atendimento e admin.

# 5. Diretrizes de implementação
- Buscar pipeline_items com JOIN em attendances (patient_name) e profiles (responsável)
- Usar Supabase client-side com useEffect ou server component — seguir o padrão
  já existente no projeto para páginas de lista
- Realtime: subscription em pipeline_items para atualizar a lista ao mudar status
  (filtrar por schema public, table pipeline_items)
- Timezone: todos os timestamps exibidos devem usar America/Manaus
- TypeScript estrito, sem any
- Tailwind apenas, sem inline style
- Componentes em PascalCase, utilitários em camelCase
- Sem abstração prematura — se um componente resolve, não criar 3

# 6. Ordem desejada
1. Ler estrutura de rotas e layout de navegação existente
2. Ler database.types.ts (pipeline_items, pipeline_events, enums)
3. Criar página /pos-atendimento com listagem básica funcional
4. Adicionar filtros
5. Implementar modal de avanço de status com lógica de progressão
6. Implementar modal de histórico
7. Adicionar link na navegação
8. Adicionar subscription realtime

# 7. Entregáveis obrigatórios
- [ ] Rota /pos-atendimento funcional com lista de pipeline_items
- [ ] Filtros por tipo, status, atraso e busca por paciente
- [ ] Modal de avanço de status com progressão correta por tipo de esteira
- [ ] INSERT em pipeline_events a cada avanço de status
- [ ] Modal de histórico com eventos ordenados
- [ ] Link na navegação visível para todos os perfis
- [ ] Realtime atualizando a lista ao mudar status
- [ ] Timezone America/Manaus em todos os timestamps

# 8. Critérios de aceite
- Ao finalizar um atendimento na fila, a esteira correspondente aparece no painel
- O status pode ser avançado apenas para os próximos válidos do tipo
- Cada avanço gera um evento em pipeline_events com usuário e timestamp
- O histórico exibe todos os eventos da esteira em ordem cronológica
- Filtros funcionam sem recarregar a página
- A lista atualiza em tempo real quando outro usuário avança um status
- Timestamps exibidos em horário de Manaus

# 9. Restrições finais
- NÃO criar CRUD completo agora — foco em visualização e avanço de status
- NÃO implementar parametrização de SLA nesta fase (sla_deadline fica null por ora)
- NÃO criar painel gerencial agora (Fase 4)
- NÃO permitir voltar status — apenas avançar (correções ficam para o admin, Fase 4)
- NÃO exibir itens com status publicado_finalizado no painel principal
- admin pode avançar qualquer status; recepcao e atendimento seguem o mapa
  de progressão sem exceções