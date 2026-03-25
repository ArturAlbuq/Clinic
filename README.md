# Fila Digital da Clínica

Sistema interno de fila digital em tempo real para clínica de radiologia odontológica. Esta versão evolui o MVP inicial para suportar um atendimento principal com múltiplas salas por paciente e prioridade operacional.

## Arquitetura

- `Next.js App Router` para rotas e renderização.
- `Supabase Auth` para login com perfis `recepção`, `atendimento` e `admin`.
- `Supabase Postgres` para `profiles`, `exam_rooms`, `attendances` e `queue_items`.
- `Supabase Realtime` para refletir novos atendimentos e mudanças de status sem refresh.
- `Tailwind CSS` para interface simples, legível e otimizada para desktop e tablet.

## Estrutura de pastas

```text
src/
  app/
    (app)/
      admin/
      atendimento/
      recepcao/
    login/
  components/
  hooks/
  lib/
scripts/
supabase/
```

## Schema SQL

O schema completo está em [supabase/schema.sql](./supabase/schema.sql).

Ele cria ou evolui:

- enums `app_role`, `exam_type`, `queue_status` e `attendance_priority`
- tabela `profiles`
- tabela `exam_rooms`
- tabela `attendances`
- tabela `queue_items`
- migração simples dos itens antigos para um `attendance` principal
- view `attendance_overview` para futura evolução de relatórios e status agregados
- triggers para criar perfil automático, manter `updated_at`, mapear exame -> sala, copiar dados legados do atendimento e travar a ordem de status
- políticas RLS por perfil
- publicação de `attendances` e `queue_items` no realtime

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Setup

1. Instale dependências:

```bash
npm install
```

2. Crie um projeto no Supabase.

3. No SQL Editor do Supabase, rode o conteúdo de `supabase/schema.sql`.

4. Configure `.env.local` com URL, anon key e service role key.

5. Rode o seed:

```bash
npm run seed
```

6. Suba o projeto:

```bash
npm run dev
```

7. Acesse `http://localhost:3000/login`.

## Seed inicial

O script `npm run seed` cria:

- 1 admin
- 3 usuários de recepção
- 4 usuários de atendimento
- 4 salas obrigatórias

Senha padrão para todos os usuários:

```text
Clinic123!
```

Usuários criados:

- `admin@clinic.local`
- `recepcao1@clinic.local`
- `recepcao2@clinic.local`
- `recepcao3@clinic.local`
- `atendimento1@clinic.local`
- `atendimento2@clinic.local`
- `atendimento3@clinic.local`
- `atendimento4@clinic.local`

## Rotas

- `/login`
- `/recepcao`
- `/atendimento`
- `/atendimento/fotografia-escaneamento`
- `/atendimento/periapical`
- `/atendimento/panoramico`
- `/atendimento/tomografia`
- `/admin`

## Fluxo atual

- Login redireciona conforme perfil.
- Recepção cadastra um atendimento com nome do paciente, uma ou mais salas, prioridade e observação opcional.
- O sistema cria um registro principal em `attendances`.
- O sistema cria um `queue_item` para cada sala selecionada.
- Cada sala vê apenas seus itens, ordenados por prioridade e horário de chegada.
- Cada item avança por `aguardando -> chamado -> em_atendimento -> finalizado` com um clique.
- Recepção visualiza a situação geral do atendimento derivada das etapas.
- Admin acompanha atendimentos, itens de fila, prioridades e resumo por sala em tempo real.

## Como testar o fluxo novo

1. Entre em `/login` com `recepcao1@clinic.local` e senha `Clinic123!`.
2. Em `/recepcao`, cadastre um paciente selecionando duas ou mais salas e uma prioridade.
3. Entre com um usuário de atendimento e abra cada sala correspondente.
4. Confirme que o mesmo paciente aparece nas filas certas, com prioridade e progresso de etapas.
5. Avance os status em uma sala e confirme o reflexo em `/recepcao` e `/admin`.

## Próximos passos para V2

- view agregada para relatórios mais pesados
- materialização opcional do status geral do atendimento
- histórico diário exportável simples
- tempos médios por sala e por prioridade
- confirmação visual de reconexão realtime
