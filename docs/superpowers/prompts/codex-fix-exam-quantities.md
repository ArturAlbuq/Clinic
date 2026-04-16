# 🐛 Bug: Quantidades de Exame Perdidas na Criação de Atendimento

## Contexto
Sistema Clinic - fila de radiologia. Quando recepção cadastra um paciente com múltiplos exames e quantidades (ex: 2x Fotografia, 3x Periapical), as quantidades viram sempre 1x para cada exame. O problema está na função SQL que cria o atendimento e as filas.

## Análise do Problema

**Arquivo**: `supabase/migrations/20260411221000_require_registration_number_on_create.sql`

**Função**: `create_attendance_with_queue_items()`

**Causa**: Linhas 62-66, a lógica CASE WHEN que tenta ler as quantidades do JSONB:

```sql
case
  when jsonb_typeof(p_exam_quantities -> distinct_exam.exam_type::text) = 'number'
    then greatest(1, (p_exam_quantities ->> distinct_exam.exam_type::text)::integer)
  else 1
end
```

O problema é que `jsonb_typeof()` nunca retorna `'number'` (ou o casting não funciona como esperado), então sempre cai no `else 1`.

## Solução

Reescrever a lógica para usar casting mais robusto:

**Opção 1** (simples):
```sql
case
  when (p_exam_quantities ->> distinct_exam.exam_type::text) is not null
    then greatest(1, (p_exam_quantities ->> distinct_exam.exam_type::text)::integer)
  else 1
end
```

**Opção 2** (mais segura - recomendada):
```sql
case
  when p_exam_quantities ? distinct_exam.exam_type::text
    then greatest(1, (p_exam_quantities ->> distinct_exam.exam_type::text)::integer)
  else 1
end
```

(O operador `?` do JSONB verifica se a chave existe)

## Entregáveis

### 1. Criar nova migration
- **Local**: `supabase/migrations/`
- **Nome padrão**: `YYYYMMDDHHMMSS_fix_exam_quantities_casting.sql`
- **Conteúdo**: `CREATE OR REPLACE FUNCTION` que reimplementa `create_attendance_with_queue_items` com a lógica corrigida
- **Garantir**: função mantém a mesma assinatura de parâmetros

### 2. Testar localmente
Se houver Supabase local:
- Criar um atendimento com exames e quantidades variadas
- Verificar que os `queue_items` salvam com `requested_quantity` correto
- Confirmar que a recepção exibe as quantidades certas

### 3. Verificar impacto
- Rodar `git diff supabase/migrations/` para confirmar que só a migration foi alterada
- Nenhuma mudança em TypeScript, componentes React ou APIs

## Critérios de Aceite

- ✅ Migration criada com fix de casting JSONB
- ✅ Função SQL mantém mesma assinatura
- ✅ Lógica trata quantidades nullas como 1
- ✅ Quantidades são persistidas corretamente no `queue_items.requested_quantity`
- ✅ Função retorna payload correto com `queueItems` contendo as quantidades certas

## Notas Importantes

- **Projeto**: Clinic (Next.js + Supabase)
- **Stack**: PostgreSQL/PL/pgSQL
- **Branches**: Não precisa de branch nova, merge direto no `codex/gerencia-prod-compat`
- **Migrations futuras**: Sempre testar casting de JSONB com operador `?` (mais robusto que `jsonb_typeof()`)

## Fluxo de Teste

1. Após a migration ser aplicada
2. Acessa `/recepcao`
3. Cadastra um paciente com:
   - Nome: qualquer
   - Cadastro: qualquer
   - Exames: 2x Fotografia + 3x Periapical (ou similar)
   - Prioridade: normal
4. Clica "Salvar atendimento"
5. **Esperado**: Na lista operacional da recepção, deve exibir "Foto x2" e "Perio x3" na timeline
6. **Antes do fix**: Exibia "Foto x1" e "Perio x1"

## Como Saber se Funcionou

Na recepção, quando você expande um atendimento e vê a timeline (Exames do atendimento), as quantidades devem aparecer corretas:
- `Fotografia x2` (não `Fotografia x1`)
- `Periapical x3` (não `Periapical x1`)

E no atendimento, quando abre a fila da sala, deve mostrar os exames com as quantidades corretas também.
