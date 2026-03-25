# AGENTS.md

## Objetivo do projeto
Sistema interno de fila digital em tempo real para clínica de radiologia odontológica.

## Stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Supabase Auth
- Supabase Realtime

## Prioridades
1. Fluxo principal funcionando
2. UX simples e rápida
3. Realtime confiável
4. Código limpo sem superengenharia

## Não fazer
- Não transformar em ERP
- Não criar agenda
- Não integrar com sistemas externos
- Não adicionar bibliotecas sem necessidade
- Não criar features fora do escopo do MVP

## Padrões de UX
- Interface em pt-BR
- Poucos cliques
- Legibilidade alta
- Botões de ação claros
- Layout bom para desktop e tablet

## Rotas esperadas
- /login
- /recepcao
- /atendimento
- /atendimento/fotografia-escaneamento
- /atendimento/periapical
- /atendimento/panoramico
- /atendimento/tomografia
- /admin

## Definição de pronto
- Recepção cadastra rápido
- Sala recebe paciente em tempo real
- Atendimento muda status com 1 clique
- Admin vê resumo do dia
- Projeto sobe localmente com README claro