# Design: Pipeline Flags no Formulário de Cadastro da Recepção

**Data:** 2026-04-19  
**Status:** Aprovado

---

## Objetivo

Adicionar ao formulário de cadastro da recepção os 4 campos booleanos que controlam a abertura automática das esteiras pós-atendimento:

- `com_laudo`
- `com_cefalometria`
- `com_impressao_fotografia`
- `com_laboratorio_externo_escaneamento`

---

## Contexto do código atual

| Arquivo | Papel |
|---|---|
| `src/app/(app)/recepcao/reception-dashboard.tsx` | Estado do formulário + submissão via `POST /api/clinic/attendances` |
| `src/app/(app)/recepcao/exams-section.tsx` | Renderiza checkboxes de exame por sala |
| `src/app/api/clinic/attendances/route.ts` | Handler da API — chama RPC `create_attendance_with_queue_items()` |
| `src/lib/database.types.ts` | Tipos já incluem os 4 flags (Row e Insert), e o RPC já aceita `p_com_laudo`, `p_com_cefalometria`, `p_com_impressao_fotografia`, `p_com_laboratorio_externo_escaneamento` |

Os 4 flags **existem** no banco e no RPC mas **não são passados** pela UI nem pelo payload hoje.

---

## Approach escolhido

**Campos condicionais embutidos em `exams-section.tsx`**, logo abaixo do checkbox do exame correspondente. Sem novo componente, sem nova seção separada.

---

## Design detalhado

### 1. Tipo auxiliar (dentro de `reception-dashboard.tsx`)

```ts
type PipelineFlags = {
  com_laudo: boolean;
  com_cefalometria: boolean;
  com_impressao_fotografia: boolean;
  com_laboratorio_externo_escaneamento: boolean;
};
```

### 2. Estado em `reception-dashboard.tsx`

Adicionar ao componente:

```ts
const [pipelineFlags, setPipelineFlags] = useState<PipelineFlags>({
  com_laudo: false,
  com_cefalometria: false,
  com_impressao_fotografia: false,
  com_laboratorio_externo_escaneamento: false,
});
```

**Reset automático ao desmarcar exame:**  
Na função `toggleExam`, quando `alreadySelected === true`:
- Se nenhum dos exames que ativa `com_laudo` (`periapical`, `interproximal`, `panoramica`, `tomografia`) restar selecionado → setar `com_laudo: false`
- Se `telerradiografia` for desmarcada → `com_cefalometria: false`
- Se `fotografia` for desmarcada → `com_impressao_fotografia: false`
- Se `escaneamento_intra_oral` for desmarcado → `com_laboratorio_externo_escaneamento: false`

**Reset no submit bem-sucedido:**  
Após `setSelectedExams([])` e demais resets, incluir explicitamente:
```ts
setPipelineFlags({
  com_laudo: false,
  com_cefalometria: false,
  com_impressao_fotografia: false,
  com_laboratorio_externo_escaneamento: false,
});
```

### 3. Props adicionais em `ExamsSectionProps`

```ts
pipelineFlags: PipelineFlags;
onTogglePipelineFlag: (flag: keyof PipelineFlags, value: boolean) => void;
```

### 4. Renderização condicional em `exams-section.tsx`

Mapeamento exame → flag:

| Exame selecionado | Flag exibida | Label |
|---|---|---|
| `periapical` OU `interproximal` OU `panoramica` OU `tomografia` | `com_laudo` | "Laudo" |
| `telerradiografia` | `com_cefalometria` | "Cefalometria" |
| `fotografia` | `com_impressao_fotografia` | "Com impressão" |
| `escaneamento_intra_oral` | `com_laboratorio_externo_escaneamento` | "Laboratório externo" |

`com_laudo` pode ser ativado por exames de salas diferentes (`periapical`/`interproximal` estão em Intra-oral, `panoramica` em Extra-oral, `tomografia` em Tomografia). Para evitar que apareça múltiplas vezes (uma por sala), **`com_laudo` deve ser renderizado em uma área comum abaixo de todos os cards de exames**, antes do campo de observação, condicionado a `selectedExams` conter qualquer um dos 4 exames correspondentes.

Os outros três flags (`com_cefalometria`, `com_impressao_fotografia`, `com_laboratorio_externo_escaneamento`) são de sala única — esses ficam dentro do card da sala correspondente, logo após o grid de exames daquela sala.

**Visual:** Checkbox pequeno (`h-4 w-4`) + label em `text-sm text-slate-700`, dentro de um `flex items-center gap-2`, sem borda extra. Mesma paleta Tailwind do formulário.

### 5. Payload de submissão em `reception-dashboard.tsx`

Adicionar os 4 flags ao body do fetch:

```ts
body: JSON.stringify({
  examQuantities,
  notes,
  patientName: trimmedPatientName,
  patientRegistrationNumber: patientRegistrationNumber.trim() || null,
  priority,
  selectedExams,
  comLaudo: pipelineFlags.com_laudo,
  comCefalometria: pipelineFlags.com_cefalometria,
  comImpressaoFotografia: pipelineFlags.com_impressao_fotografia,
  comLaboratorioExternoEscaneamento: pipelineFlags.com_laboratorio_externo_escaneamento,
}),
```

### 6. API route `route.ts`

**`CreateAttendanceBody`** — adicionar campos:

```ts
comLaudo?: boolean;
comCefalometria?: boolean;
comImpressaoFotografia?: boolean;
comLaboratorioExternoEscaneamento?: boolean;
```

**Chamada RPC** — adicionar parâmetros:

```ts
p_com_laudo: body.comLaudo ?? false,
p_com_cefalometria: body.comCefalometria ?? false,
p_com_impressao_fotografia: body.comImpressaoFotografia ?? false,
p_com_laboratorio_externo_escaneamento: body.comLaboratorioExternoEscaneamento ?? false,
```

**RPC confirmado no staging:** a versão mais recente de `create_attendance_with_queue_items` já inclui os 4 parâmetros (`p_com_laudo`, `p_com_cefalometria`, `p_com_impressao_fotografia`, `p_com_laboratorio_externo_escaneamento`) com `DEFAULT false`. Sem necessidade de nova migration. O fallback legacy (overload sem esses parâmetros) continua existindo — os novos parâmetros não quebram a detecção de assinatura legacy na route.

---

## Restrições

- Não alterar lógica de direcionamento para sala
- Não alterar campos existentes (nome, número, exames, quantidade, prioridade, observação)
- Não criar nova tela ou novo componente de cadastro
- Campos condicionais visíveis apenas quando o exame correspondente está ativo
- Sem inline style — apenas Tailwind
- TypeScript estrito, sem `any`

---

## Critérios de aceite

- [ ] Selecionar PANORÂMICA → aparece checkbox "Laudo"
- [ ] Selecionar TELERRADIOGRAFIA → aparece checkbox "Cefalometria"
- [ ] Selecionar FOTOGRAFIA → aparece checkbox "Com impressão"
- [ ] Selecionar ESCANEAMENTO INTRA-ORAL → aparece checkbox "Laboratório externo"
- [ ] Desmarcar exame → campo correspondente desaparece e retorna `false`
- [ ] Attendance salvo no banco com os flags corretos
- [ ] Sem regressão nos campos existentes

---

## Arquivos a modificar

1. `src/app/(app)/recepcao/reception-dashboard.tsx`
2. `src/app/(app)/recepcao/exams-section.tsx`
3. `src/app/api/clinic/attendances/route.ts`
