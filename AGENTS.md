# AGENTS.md – Clinic

Instruções para agentes (Codex, subagentes, automações) trabalharem neste repositório.

## Contexto rápido

**Projeto**: Sistema de fila digital em tempo real para clínica de radiologia odontológica.

**Stack**: Next.js + TypeScript + Tailwind + Supabase + Realtime + Vercel

**Perfis**: recepção, atendimento, admin

**Prioridade**: Simplicidade operacional. Não é ERP. Sem complexidade desnecessária.

Leia [CLAUDE.md](CLAUDE.md) para visão completa, stack, funcionalidades implementadas e bugs conhecidos.

---

## Antes de começar

1. **Sempre leia o que já existe** antes de criar algo novo
   - Componentes, enums, tipos, rotas, queries
   - Reutilize e melhore em vez de duplicar

2. **Respeite a estrutura de permissões e níveis**
   - Ações sensíveis (editar, deletar, cancelar) ficam no admin
   - Proteção deve estar no backend (RLS, políticas), não só na UI
   - Considere que um paciente pode ter múltiplos exames/etapas

3. **Sempre inclua critérios de aceite claros**
   - O que é considerado "pronto"?
   - Como será testado?

4. **Timezone**: Use `America/Manaus` como referência em toda a lógica

---

## Padrões esperados

### Estrutura de pastas
```
src/
  app/              # App Router
  components/       # React components (UI)
  lib/              # Utilities, tipos, queries
  middleware/       # Auth, validação
  actions/          # Server actions
```

### Componentes
- Use TypeScript strict
- Componentes server por padrão
- `use client` apenas quando necessário (interatividade, hooks)
- Priorize legibilidade e simplicidade

### Dados e queries
- Queries em `lib/` com tipos bem definidos
- RLS policies no banco (segurança primary)
- Server actions para mutações sensíveis
- Realtime para atualizações vivas (filas, status)

### Styling
- Tailwind CSS
- Mobile/tablet como foco
- Evite complexidade visual desnecessária

### Autenticação
- Supabase Auth com perfis (roles)
- Verificar role no servidor antes de ações sensíveis
- Separar lógica por perfil quando apropriado

---

## Ordenação operacional (atendimento)

Ordem esperada dos cards na fila:

1. **Em exame** (actively in progress)
2. **Chamado** (called, waiting to begin)
3. **Aguardando ser chamado** (waiting in queue)
4. **Concluído** (finished)
5. **Cancelado** (if shown)

---

## Fluxo principal

```
recepção
  ↓ cadastra paciente
  ↓ informa exames, prioridade, observações
  ↓
atendimento
  ↓ chama pela fila
  ↓ inicia exame
  ↓ conclui exame
  ↓
admin (acompanha, relatórios, ações sensíveis)
```

---

## Checklist antes de implementar

- [ ] Problema ou feature já existe no código?
- [ ] Afeta admin, recepção, atendimento, realtime, timezone ou histórico?
- [ ] Precisa de RLS ou proteção no backend?
- [ ] É uma ação sensível (editar, deletar)? Deve estar no admin.
- [ ] Como será testado operacionalmente?
- [ ] Respeitei os padrões do projeto (componentes, tipos, queries)?

---

## Bugs e pontos críticos já conhecidos

Antes de tocar nestes, converse com o time:

- Loop infinito ao concluir etapa com prioridade
- Credenciais de admin falhando em produção (ok em local)
- Horários operacionais sumindo do admin em alguns fluxos
- Ordenação dos cards nem sempre priorizando itens ativos
- Inconsistências visuais em status e labels
- Timezone precisa ser consistente (America/Manaus)

---

## Como testar implementações

### Local
```bash
npm run dev
# http://localhost:3000
```

### Checklist de teste
1. **Recepção**: Cadastra rápido? Interface é clara?
2. **Atendimento**: Fila exibe corretamente? Prioridade funciona?
3. **Admin**: Acompanha operação e histórico? Filtros funcionam?
4. **Realtime**: Atualizações aparecem sem delay?
5. **Mobile/Tablet**: Layout responde bem?

### Exemplo de teste de feature
Se implementou "busca de pacientes":
- [ ] Busca por nome funciona?
- [ ] Busca por número de cadastro funciona?
- [ ] Filtra por período?
- [ ] Admin e recepção conseguem acessar?
- [ ] Histórico é preservado?

---

## Entregáveis esperados

Ao completar uma tarefa, inclua:

1. **Código** funcionando e testado
2. **Descrição clara** do que foi feito
3. **Plano de teste** (como verificar)
4. **Screenshots/demo** se for UI
5. **Qualquer mudança** em estrutura ou padrão documentada

---

## Referências rápidas

- **Perfis**: `recepção`, `atendimento`, `admin`
- **Exames**: Fotografia, Escaneamento, Periapical, Interproximal, Panorâmica, Telerradiografia, Tomografia
- **Salas**: Fotos/Escaneamento, Radiografia intra-oral, Radiografia extra-oral, Tomografia
- **Status**: `aguardando`, `chamado`, `em_exame`, `concluido`, `cancelado`
- **Timezone**: `America/Manaus`

---

## Contato e dúvidas

Em caso de ambiguidade, revise [CLAUDE.md](CLAUDE.md) ou peça esclarecimento antes de começar.
