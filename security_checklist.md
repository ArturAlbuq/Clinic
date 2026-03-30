# Checklist de Seguranca - Clinic

## 1. Chaves e Segredos
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Manter segredos apenas no servidor e em variaveis de ambiente.
- Garantir que `.env.local`, `.env.production` e similares estejam no `.gitignore`.
- Nao copiar segredos para README, prints, logs ou comentarios.
- Rotacionar chaves se houver suspeita de vazamento.

## 2. Uso correto da Supabase Anon Key
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` pode existir no cliente, mas sem confiar nela para autorizacao.
- Toda protecao sensivel deve depender de RLS e validacao server-side.
- Policies da `anon key` devem ser restritivas por padrao.
- Nenhuma operacao privilegiada deve depender so do frontend.

## 3. Autenticacao e Autorizacao
- Exigir login para todas as areas internas do sistema.
- Validar role no servidor para rotas de `recepcao`, `atendimento` e `admin`.
- Garantir que usuario de atendimento veja apenas a sala autorizada.
- Garantir que recepcao nao acesse acoes administrativas.
- Garantir que admin tenha acesso ampliado apenas onde necessario.

## 4. Fluxo Front -> Back -> Banco
- Evitar logica sensivel diretamente no cliente.
- Preferir `frontend -> /api -> Supabase`.
- Centralizar operacoes criticas no backend da aplicacao.
- Nunca confiar em role, sala ou status enviados pelo browser sem revalidacao.

## 5. Banco de Dados e RLS
- Ativar RLS em todas as tabelas operacionais.
- Revisar policies de `attendances`, `queue_items`, `profiles` e `profile_room_access`.
- Bloquear leitura ampla para usuarios sem escopo.
- Permitir update apenas para quem realmente pode operar aquela etapa.
- Revisar qualquer uso de `service_role` para evitar bypass de autorizacao.

## 6. SQL Seguro
- Usar RPCs e queries parametrizadas.
- Nunca concatenar entrada do usuario em SQL dinamico.
- Validar dados antes de enviar ao banco.
- Tratar texto do usuario como dado, nunca como comando.

## 7. Dados Sensiveis
- Nao expor informacoes sensiveis em query string ou URL.
- Nao colocar dados internos em logs do navegador.
- Evitar mensagens cruas de erro do banco para o usuario final.
- Minimizar dados pessoais trafegando para o cliente quando nao forem necessarios.

## 8. Ambiente e Deploy
- Separar ambiente de producao e ambiente de testes.
- Nunca testar com banco real de producao.
- Usar variaveis de ambiente diferentes por ambiente.
- Garantir que seeds de teste nao atinjam producao.

## 9. Logs e Auditoria
- Registrar acoes criticas no servidor.
- Auditar cancelamentos, alteracoes de status e acessos administrativos quando fizer sentido.
- Nao registrar senhas, tokens ou segredos em logs.
- Sanitizar erros antes de mostrar no frontend.

## 10. Frontend
- Nao armazenar segredos no codigo cliente.
- Proteger rotas internas tambem no servidor, nao so no layout ou UI.
- Evitar expor detalhes de implementacao em requests e responses.
- Revisar se headers de seguranca estao ativos.

## 11. Realtime
- Garantir que eventos em tempo real respeitem escopo por usuario e sala.
- Confirmar que um usuario nao recebe dados de salas que nao deveria ver.
- Revisar subscriptions para evitar vazamento cruzado entre perfis.

## 12. Revisao Continua
- Revisar policies sempre que criar tabela nova.
- Revisar seguranca sempre que criar rota `/api` nova.
- Validar permissoes antes de subir feature critica.
- Testar cenarios de acesso indevido entre `recepcao`, `atendimento` e `admin`.

## Verificacao Rapida das RLS

### Resultado geral
- As RLS estao, no geral, mais restritivas do que permissivas.
- As policies mais importantes usam `to authenticated`, nao `to anon`.
- O controle principal de escopo fica centralizado em `current_app_role()`, `user_has_room_access(...)` e `user_can_access_attendance(...)`.

### Pontos fortes
- `profiles`: leitura so do proprio usuario ou `admin`.
- `profile_room_access`: leitura so do proprio usuario ou `admin`.
- `attendances`: leitura condicionada a `user_can_access_attendance(id)`.
- `queue_items`: leitura e update condicionados por role e por sala autorizada.
- Criacao de atendimento e cancelamento critico passam por RPC com validacao server-side no banco.

### Pontos de atencao
- `exam_rooms` esta aberto para qualquer usuario autenticado. Isso nao parece critico, mas e a policy mais ampla do schema atual.
- `cancel_attendance` e `create_attendance_with_queue_items` usam `security definer`. Isso e valido aqui, mas exige cuidado continuo para nao virar bypass de autorizacao em mudancas futuras.
- A tabela `manager_approval_attempts` existe no schema, mas ja houve descompasso com banco remoto. Sempre confirmar que migrations foram aplicadas no ambiente real antes de depender da policy.

### Parecer
- Para `anon key`: restritivo.
- Para usuario autenticado: moderadamente restritivo e bem segmentado por papel e sala.
- Nao apareceu, nesta revisao rapida, uma policy obviamente permissiva demais nas tabelas operacionais principais.
