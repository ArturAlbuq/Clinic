# Prompt Codex: Adicionar Número de Cadastro na Tela de Atendimento

## Projeto
Clinic - Sistema de fila digital para clínica de radiologia

## Spec Aprovada
`docs/superpowers/specs/2026-04-14-patient-registration-in-attendance.md`

## Tarefa
Adicionar número de cadastro do paciente em todas as seções da tela de atendimento

## Contexto
- Arquivo principal: `src/app/(app)/atendimento/[roomSlug]/room-queue-board.tsx`
- O número de cadastro já está disponível em `QueueItemWithAttendance`
- Padrão visual deve ser idêntico ao de recepção
- Deve aparecer em 3 seções: cards principais, retornos pendentes e cancelamentos

## Implementação

### 1. Cards Principais (linhas ~365-526)
Adicionar após observações (depois da linha ~399):

```tsx
{item.attendance?.patient_registration_number || item.patient_registration_number ? (
  <p className="mt-2 text-sm font-medium text-cyan-800">
    Cadastro {item.attendance?.patient_registration_number || item.patient_registration_number}
  </p>
) : null}
```

### 2. Seção Retornos Pendentes (linhas ~551-595)
Adicionar após nome/badges (depois da linha ~570):

```tsx
{item.attendance?.patient_registration_number || item.patient_registration_number ? (
  <p className="mt-1 text-sm font-medium text-cyan-800">
    Cadastro {item.attendance?.patient_registration_number || item.patient_registration_number}
  </p>
) : null}
```

### 3. Seção Cancelamentos (linhas ~615-644)
Adicionar após nome/badges (depois da linha ~628):

```tsx
{item.attendance?.patient_registration_number || item.patient_registration_number ? (
  <p className="mt-1 text-sm font-medium text-cyan-800">
    Cadastro {item.attendance?.patient_registration_number || item.patient_registration_number}
  </p>
) : null}
```

## Critérios de Aceite
- ✅ Número exibe em todos os 3 contextos (cards principais, retornos, cancelados)
- ✅ Formato/cor/tamanho idêntico a recepção
- ✅ Renderização condicional (só aparece se preenchido)
- ✅ Sem regressions visuais
- ✅ Realtime atualiza corretamente

## Referência de Padrão
Ver implementação em recepção: `src/app/(app)/recepcao/reception-dashboard.tsx` (linhas 587-591)

## Plano de Teste
1. Abrir tela de atendimento (`/atendimento/[roomSlug]`)
2. Verificar que número de cadastro aparece em todos os cards
3. Testar com paciente sem número de cadastro (não deve renderizar a linha)
4. Verificar atualização em tempo real quando número é editado no admin
5. Validar consistência visual com recepção
