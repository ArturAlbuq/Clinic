# Clinic - fila digital interna

Sistema interno de fila digital em tempo real para a clinica de radiologia odontologica.

## Stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Supabase Auth
- Supabase Realtime

## Setup local
1. Instale as dependencias:

```bash
npm install
```

2. Crie `.env.local` a partir de `.env.example`.
3. Configure obrigatoriamente:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MANAGER_APPROVAL_PASSWORD`
- uma senha forte para cada variavel `SEED_*_PASSWORD`

4. Aplique o schema no Supabase local:

```bash
npm run db:push
```

5. Rode o seed:

```bash
npm run seed
```

6. Suba a aplicacao:

```bash
npm run dev
```

## Usuarios gerenciados pelo seed
- `admin@clinic.local` - Admin Clinica
- `recepcao1@clinic.local` - Recepcao 1
- `geovanna@clinic.local` - GEOVANNA
- `clara@clinic.local` - CLARA
- `karol@clinic.local` - KAROL
- `atendimento1@clinic.local` - Atendimento 1
- `diego@clinic.local` - DIEGO
- `ayrton@clinic.local` - AYRTON
- `juliane@clinic.local` - JULIANE

Observacoes:
- o seed cria ou atualiza contas e perfis internos;
- as senhas sao lidas por variavel de ambiente individual;
- o seed nao imprime senhas em log;
- `admin`, `recepcao1` e `atendimento1` sao mantidos junto com os usuarios reais.

## Fluxo operacional
- Recepcao cadastra por exame, nao por sala.
- O sistema direciona automaticamente:
  - `Fotografia` e `Escaneamento intra-oral` -> `Fotos/escaneamento`
  - `Periapical` e `Interproximal` -> `Radiografia intra-oral`
  - `Panoramica` e `Telerradiografia` -> `Radiografia extra-oral`
  - `Tomografia` -> `Tomografia`
- A quantidade por exame e informativa e fica registrada no item da fila.
- Prioridades disponiveis:
  - `Normal`
  - `60+ e outras`
  - `80+`
- O cancelamento exige motivo e a senha predefinida em `MANAGER_APPROVAL_PASSWORD`.
- O atendimento recebe destaque visual em tempo real quando ha novo paciente aguardando.
- O admin separa a rotina em abas `Operacao` e `Relatorios`.
- A lista operacional do admin tem paginacao com `5`, `10` e `15` itens por pagina, com `5` como padrao.
- A aba `Relatorios` permite exportar o recorte atual em PDF.

## Timezone
Toda a interface operacional e os recortes de periodo usam `America/Manaus`.

## Validacao
```bash
npm test
npm run typecheck
npm run lint
```

## Roteiro rapido de teste
1. Entre com `recepcao1@clinic.local` e cadastre um paciente com um ou mais exames.
2. Confira na recepcao se o exame mostra a sala de destino correta e a quantidade informada.
3. Entre com `atendimento1@clinic.local` ou outra conta de atendimento e abra a fila de uma sala.
4. Avance o status de uma etapa e confirme a atualizacao em tempo real no admin.
5. Na sala, cancele um atendimento com motivo e a senha configurada em `MANAGER_APPROVAL_PASSWORD`.
6. Entre com `admin@clinic.local` e valide:
   - filtros por prioridade, situacao, exame e sala;
   - ordenacao mais recentes / mais antigos;
   - paginacao com `5`, `10` e `15`, comecando em `5`;
   - abas `Operacao` e `Relatorios`;
   - relatorios por atendente, recepcao, exame e sala/data;
   - download do PDF da aba `Relatorios`;
   - horarios exibidos no timezone da clinica.

## Reset local
Se precisar recriar o banco local:

```bash
npm run db:reset
```
