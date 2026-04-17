# Reorganização do Layout da Recepção - Plano de Implementação

> **Para trabalhadores agentos:** USE OBRIGATORIAMENTE: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Reorganizar a página de recepção movendo o formulário de cadastro rápido para layout horizontal full-width no topo, com cards de métricas em linha abaixo, e reformular o formulário em seções lógicas com campo de quantidade de exames.

**Arquitetura:** O layout será reorganizado em três seções principais:
1. **Cabeçalho com data em foco** - exibe data atual e status realtime
2. **Formulário de cadastro rápido** - em seções horizontais: paciente, exames por sala, prioridade + observação
3. **Cards de métricas** - linha horizontal com 5 cards: Aguardando, Chamados, Em Exame, Salas Ocupadas, Salas Livres

**Stack de Tecnologia:** Next.js, React, TypeScript, Tailwind CSS, Supabase Realtime

---

## Estrutura de Arquivos

**Arquivos a modificar:**
- `src/app/(app)/recepcao/reception-dashboard.tsx` - componente principal de recepção (refatoração do layout)
- `src/components/metric-card.tsx` - nenhuma mudança necessária (componente já existe)

**Nenhum arquivo novo será criado** - reutilizamos componentes existentes e reorganizamos o layout do ReceptionDashboard.

---

## Task 1: Extrair Seção de Paciente em Componente Separado

**Arquivos:**
- Criar: `src/app/(app)/recepcao/patient-section.tsx`
- Modificar: `src/app/(app)/recepcao/reception-dashboard.tsx`

Vamos extrair a seção de paciente (nome + cadastro) em um componente reutilizável para deixar o ReceptionDashboard mais limpo.

- [ ] **Passo 1: Criar o componente PatientSection**

Cria o arquivo `src/app/(app)/recepcao/patient-section.tsx`:

```typescript
import React from "react";

type PatientSectionProps = {
  patientName: string;
  patientRegistrationNumber: string;
  onPatientNameChange: (name: string) => void;
  onRegistrationNumberChange: (number: string) => void;
};

export function PatientSection({
  patientName,
  patientRegistrationNumber,
  onPatientNameChange,
  onRegistrationNumberChange,
}: PatientSectionProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <label className="block col-span-2">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Nome do paciente
        </span>
        <input
          type="text"
          required
          minLength={2}
          value={patientName}
          onChange={(event) => onPatientNameChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          placeholder="Ex.: Maria Aparecida"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Nº do cadastro
        </span>
        <input
          type="text"
          required
          value={patientRegistrationNumber}
          onChange={(event) => onRegistrationNumberChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          placeholder="Obrigatório. Ex.: 548921"
        />
      </label>
    </div>
  );
}
```

- [ ] **Passo 2: Importar e usar PatientSection no ReceptionDashboard**

Modifica `src/app/(app)/recepcao/reception-dashboard.tsx` linha 1-12 (imports):

Adiciona após os outros imports:
```typescript
import { PatientSection } from "./patient-section";
```

Depois, na seção do formulário (por volta da linha 298-326), substitui:

```typescript
// ANTES - remover esta seção de <label> elementos
<label className="block col-span-2">
  <span className="mb-2 block text-sm font-semibold text-slate-700">
    Nome do paciente
  </span>
  <input
    type="text"
    required
    minLength={2}
    value={patientName}
    onChange={(event) => setPatientName(event.target.value)}
    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
    placeholder="Ex.: Maria Aparecida"
  />
</label>

<label className="block">
  <span className="mb-2 block text-sm font-semibold text-slate-700">
    Nº do cadastro
  </span>
  <input
    type="text"
    required
    value={patientRegistrationNumber}
    onChange={(event) => setPatientRegistrationNumber(event.target.value)}
    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
    placeholder="Obrigatorio. Ex.: 548921"
  />
</label>
```

Por:

```typescript
// DEPOIS - usar o novo componente
<PatientSection
  patientName={patientName}
  patientRegistrationNumber={patientRegistrationNumber}
  onPatientNameChange={setPatientName}
  onRegistrationNumberChange={setPatientRegistrationNumber}
/>
```

- [ ] **Passo 3: Salvar e fazer commit**

```bash
git add src/app/\(app\)/recepcao/patient-section.tsx src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "refactor: extract patient section into separate component"
```

---

## Task 2: Extrair Seção de Exames em Componente Separado

**Arquivos:**
- Criar: `src/app/(app)/recepcao/exams-section.tsx`
- Modificar: `src/app/(app)/recepcao/reception-dashboard.tsx`

Vamos extrair a seção de exames organizados por sala em um componente separado.

- [ ] **Passo 1: Criar o componente ExamsSection**

Cria o arquivo `src/app/(app)/recepcao/exams-section.tsx`:

```typescript
import { cn } from "@/lib/utils";
import {
  EXAM_LABELS,
  ROOM_EXAM_TYPES,
} from "@/lib/constants";
import type {
  ExamRoomRecord,
  ExamType,
} from "@/lib/database.types";

type ExamsSectionProps = {
  rooms: ExamRoomRecord[];
  selectedExams: ExamType[];
  examQuantities: Partial<Record<ExamType, number>>;
  onToggleExam: (examType: ExamType) => void;
  onUpdateExamQuantity: (examType: ExamType, quantity: string) => void;
};

export function ExamsSection({
  rooms,
  selectedExams,
  examQuantities,
  onToggleExam,
  onUpdateExamQuantity,
}: ExamsSectionProps) {
  return (
    <div>
      <span className="mb-4 block text-sm font-semibold text-slate-700">
        Exames
      </span>
      <div className="space-y-4">
        {rooms.map((room) => (
          <div
            key={room.slug}
            className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{room.name}</p>
              <p className="mt-1 text-xs text-slate-600">
                Selecione os exames que entram nesta sala.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ROOM_EXAM_TYPES[room.slug as keyof typeof ROOM_EXAM_TYPES].map(
                (examType) => {
                  const checked = selectedExams.includes(examType);
                  const quantity = examQuantities[examType] ?? 1;

                  return (
                    <label
                      key={examType}
                      className={cn(
                        checked
                          ? "rounded-[22px] border border-cyan-300 bg-cyan-50 px-4 py-4"
                          : "rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4",
                        "flex items-start gap-3 cursor-pointer"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleExam(examType)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {EXAM_LABELS[examType]}
                          </p>
                          <p className="text-xs text-slate-600">
                            Vai para {room.name}
                          </p>
                        </div>
                        {checked ? (
                          <div className="flex max-w-[160px] flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Quantidade
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={quantity}
                              onChange={(event) =>
                                onUpdateExamQuantity(examType, event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                            />
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                }
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Passo 2: Importar e usar ExamsSection no ReceptionDashboard**

Modifica `src/app/(app)/recepcao/reception-dashboard.tsx` linha 1-12 (imports):

Adiciona após os outros imports:
```typescript
import { ExamsSection } from "./exams-section";
```

Depois, na seção do formulário (por volta da linha 328-403), substitui toda a seção `<div>` com "Exames" por:

```typescript
<ExamsSection
  rooms={rooms}
  selectedExams={selectedExams}
  examQuantities={examQuantities}
  onToggleExam={toggleExam}
  onUpdateExamQuantity={updateExamQuantity}
/>
```

- [ ] **Passo 3: Salvar e fazer commit**

```bash
git add src/app/\(app\)/recepcao/exams-section.tsx src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "refactor: extract exams section into separate component"
```

---

## Task 3: Extrair Seção de Prioridade e Observação em Componente Separado

**Arquivos:**
- Criar: `src/app/(app)/recepcao/priority-notes-section.tsx`
- Modificar: `src/app/(app)/recepcao/reception-dashboard.tsx`

Vamos extrair a seção de prioridade e observação em um componente separado.

- [ ] **Passo 1: Criar o componente PriorityNotesSection**

Cria o arquivo `src/app/(app)/recepcao/priority-notes-section.tsx`:

```typescript
import {
  PRIORITY_LABELS,
} from "@/lib/constants";
import type { AttendancePriority } from "@/lib/database.types";

type PriorityNotesSectionProps = {
  priority: AttendancePriority;
  notes: string;
  onPriorityChange: (priority: AttendancePriority) => void;
  onNotesChange: (notes: string) => void;
};

const PRIORITY_OPTIONS: AttendancePriority[] = [
  "normal",
  "sessenta_mais_outras",
  "oitenta_mais",
];

export function PriorityNotesSection({
  priority,
  notes,
  onPriorityChange,
  onNotesChange,
}: PriorityNotesSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Prioridade
        </span>
        <select
          value={priority}
          onChange={(event) =>
            onPriorityChange(event.target.value as AttendancePriority)
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {PRIORITY_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Observação
        </span>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={1}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          placeholder="Opcional. Ex.: encaixe, retorno, prioridade clínica."
        />
      </label>
    </div>
  );
}
```

- [ ] **Passo 2: Importar e usar PriorityNotesSection no ReceptionDashboard**

Modifica `src/app/(app)/recepcao/reception-dashboard.tsx` linha 1-12 (imports):

Adiciona após os outros imports:
```typescript
import { PriorityNotesSection } from "./priority-notes-section";
```

Depois, na seção do formulário (por volta da linha 405-435), substitui:

```typescript
// ANTES - remover esta seção
<label className="block">
  <span className="mb-2 block text-sm font-semibold text-slate-700">
    Prioridade
  </span>
  <select
    value={priority}
    onChange={(event) =>
      setPriority(event.target.value as AttendancePriority)
    }
    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
  >
    {PRIORITY_OPTIONS.map((option) => (
      <option key={option} value={option}>
        {PRIORITY_LABELS[option]}
      </option>
    ))}
  </select>
</label>

<label className="block">
  <span className="mb-2 block text-sm font-semibold text-slate-700">
    Observacao
  </span>
  <textarea
    value={notes}
    onChange={(event) => setNotes(event.target.value)}
    rows={4}
    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
    placeholder="Opcional. Ex.: encaixe, retorno, prioridade clinica."
  />
</label>
```

Por:

```typescript
// DEPOIS - usar o novo componente
<PriorityNotesSection
  priority={priority}
  notes={notes}
  onPriorityChange={setPriority}
  onNotesChange={setNotes}
/>
```

- [ ] **Passo 3: Salvar e fazer commit**

```bash
git add src/app/\(app\)/recepcao/priority-notes-section.tsx src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "refactor: extract priority and notes section into separate component"
```

---

## Task 4: Extrair Componente de Cabeçalho com Data em Foco

**Arquivos:**
- Criar: `src/app/(app)/recepcao/reception-header.tsx`
- Modificar: `src/app/(app)/recepcao/reception-dashboard.tsx`

Vamos criar um componente para o cabeçalho que exibe a data em foco e outras informações.

- [ ] **Passo 1: Criar o componente ReceptionHeader**

Cria o arquivo `src/app/(app)/recepcao/reception-header.tsx`:

```typescript
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { DayFilterControls } from "@/components/day-filter-controls";
import { formatDate } from "@/lib/date";

type ReceptionHeaderProps = {
  isToday: boolean;
  selectedDate: string;
  realtimeStatus: "connected" | "disconnected" | "reconnecting";
  realtimeError: string | null;
};

export function ReceptionHeader({
  isToday,
  selectedDate,
  realtimeStatus,
  realtimeError,
}: ReceptionHeaderProps) {
  return (
    <div className="app-panel rounded-[30px] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Recepcao
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Cadastro rapido por exame
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {isToday
              ? "A recepcao escolhe os exames, informa a quantidade quando fizer sentido e o sistema direciona cada exame para a sala correta."
              : `Consulta dos registros de ${formatDate(selectedDate)}. O cadastro rapido fica liberado apenas no dia atual.`}
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-4">
          <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Data em foco
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {formatDate(selectedDate)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {isToday ? "Hoje" : "Histórico"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <DayFilterControls
          historyMessage="Modo consulta ativo. Para cadastrar novos pacientes, volte para Hoje."
          selectedDate={selectedDate}
        />
      </div>
    </div>
  );
}
```

- [ ] **Passo 2: Importar e usar ReceptionHeader no ReceptionDashboard**

Modifica `src/app/(app)/recepcao/reception-dashboard.tsx` linha 1-12 (imports):

Adiciona após os outros imports:
```typescript
import { ReceptionHeader } from "./reception-header";
```

Depois, em reception-dashboard.tsx, procura pela seção que começa com:

```typescript
<section className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
  <div className="app-panel rounded-[30px] px-6 py-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
          Recepcao
        </p>
        ...
```

Substitui o painel inteiro (da abertura de `<section>` até o fechamento do primeiro `</div>` do app-panel, incluindo DayFilterControls) por:

```typescript
<section className="space-y-6">
  <ReceptionHeader
    isToday={isToday}
    selectedDate={selectedDate}
    realtimeStatus={realtimeStatus}
    realtimeError={realtimeError}
  />
```

E remove as importações agora duplicadas de `DayFilterControls` e `RealtimeStatusBadge` que serão usadas apenas no componente ReceptionHeader.

- [ ] **Passo 3: Salvar e fazer commit**

```bash
git add src/app/\(app\)/recepcao/reception-header.tsx src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "refactor: extract reception header with focus date into separate component"
```

---

## Task 5: Reorganizar Layout do Formulário para Seções

**Arquivos:**
- Modificar: `src/app/(app)/recepcao/reception-dashboard.tsx`

Agora vamos reorganizar o formulário principal para usar as seções extraídas e estruturar o layout de forma horizontal.

- [ ] **Passo 1: Verificar a estrutura atual do formulário**

Abre `src/app/(app)/recepcao/reception-dashboard.tsx` e localiza a seção:

```typescript
{isToday ? (
  <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
```

Esta é a seção que vamos reorganizar. A estrutura atual tem:
- PatientSection
- ExamsSection
- PriorityNotesSection
- Mensagens de erro/sucesso
- Botão submit

- [ ] **Passo 2: Reorganizar o formulário em seções com spacing apropriado**

Substitui a seção do formulário (linhas aproximadamente 297-456) por:

```typescript
{isToday ? (
  <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
    <PatientSection
      patientName={patientName}
      patientRegistrationNumber={patientRegistrationNumber}
      onPatientNameChange={setPatientName}
      onRegistrationNumberChange={setPatientRegistrationNumber}
    />

    <ExamsSection
      rooms={rooms}
      selectedExams={selectedExams}
      examQuantities={examQuantities}
      onToggleExam={toggleExam}
      onUpdateExamQuantity={updateExamQuantity}
    />

    <PriorityNotesSection
      priority={priority}
      notes={notes}
      onPriorityChange={setPriority}
      onNotesChange={setNotes}
    />

    {formError ? (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {formError}
      </div>
    ) : null}

    {formSuccess ? (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {formSuccess}
      </div>
    ) : null}

    <button
      type="submit"
      disabled={isSubmitting}
      className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-base font-semibold text-white hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSubmitting ? "Salvando..." : "Salvar atendimento"}
    </button>
  </form>
) : (
  <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/70 px-5 py-5 text-sm text-amber-900">
    Os cadastros ficam bloqueados fora do dia atual para evitar lancamentos operacionais no recorte errado.
  </div>
)}
```

- [ ] **Passo 3: Salvar e fazer commit**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "refactor: reorganize form into component sections"
```

---

## Task 6: Reorganizar Layout Geral para Exibir Métricas em Linha Horizontal

**Arquivos:**
- Modificar: `src/app/(app)/recepcao/reception-dashboard.tsx`

Vamos reorganizar a estrutura geral do dashboard para que métricas apareçam em uma linha horizontal logo abaixo do formulário.

- [ ] **Passo 1: Verificar estrutura atual**

Abre `src/app/(app)/recepcao/reception-dashboard.tsx` e localiza:

```typescript
return (
  <div className="space-y-6">
    <section className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
      ...
    </section>
```

Esta é a seção que vamos mudar. Atualmente:
- A seção tem `grid` com 2 colunas
- Coluna esquerda: formulário
- Coluna direita: cards de métrica

Vamos mudar para:
- Formulário full-width no topo
- Métricas em linha abaixo

- [ ] **Passo 2: Reorganizar o layout**

Substitui a seção inteira (da linha `<section>` até o fechamento `</section>`) por:

```typescript
return (
  <div className="space-y-6">
    <section className="space-y-6">
      <ReceptionHeader
        isToday={isToday}
        selectedDate={selectedDate}
        realtimeStatus={realtimeStatus}
        realtimeError={realtimeError}
      />

      <div className="app-panel rounded-[30px] px-6 py-6">
        {isToday ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <PatientSection
              patientName={patientName}
              patientRegistrationNumber={patientRegistrationNumber}
              onPatientNameChange={setPatientName}
              onRegistrationNumberChange={setPatientRegistrationNumber}
            />

            <ExamsSection
              rooms={rooms}
              selectedExams={selectedExams}
              examQuantities={examQuantities}
              onToggleExam={toggleExam}
              onUpdateExamQuantity={updateExamQuantity}
            />

            <PriorityNotesSection
              priority={priority}
              notes={notes}
              onPriorityChange={setPriority}
              onNotesChange={setNotes}
            />

            {formError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            ) : null}

            {formSuccess ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {formSuccess}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-base font-semibold text-white hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Salvando..." : "Salvar atendimento"}
            </button>
          </form>
        ) : (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 px-5 py-5 text-sm text-amber-900">
            Os cadastros ficam bloqueados fora do dia atual para evitar lancamentos operacionais no recorte errado.
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        <MetricCard
          label="Aguardando"
          value={String(totalWaiting)}
          helper="pacientes na fila"
          accent="amber"
          compact
        />
        <MetricCard
          label="Chamados"
          value={String(0)}
          helper="aguardando entrada"
          accent="teal"
          compact
        />
        <MetricCard
          label="Em exame"
          value={String(totalInProgress)}
          helper="em atendimento agora"
          accent="teal"
          compact
        />
        <MetricCard
          label="Salas ocupadas"
          value={String(0)}
          helper="de 4 salas"
          accent="slate"
          compact
        />
        <MetricCard
          label="Salas livres"
          value={String(4)}
          helper="disponíveis agora"
          accent="slate"
          compact
        />
      </div>
    </section>
```

**IMPORTANTE:** Remove a seção antiga que tinha o grid com 2 colunas. Certifica-se de que o segundo `</section>` (que vinha depois dos cards) ainda existe para encerrar corretamente a lista de atendimentos abaixo.

- [ ] **Passo 3: Testar o layout**

Roda o app no desenvolvimento:

```bash
npm run dev
```

Abre http://localhost:3000/recepcao e verifica:
- [ ] Cabeçalho com "Data em foco" aparece no topo
- [ ] Formulário aparece full-width abaixo do cabeçalho
- [ ] Formulário tem seções: paciente, exames por sala, prioridade + observação
- [ ] Cards de métrica aparecem em linha horizontal abaixo do formulário (5 colunas)
- [ ] Lista de atendimentos ainda aparece abaixo dos cards
- [ ] Ao clicar em um exame, o campo de quantidade aparece
- [ ] Formulário envia e salva atendimento corretamente

- [ ] **Passo 4: Salvar e fazer commit**

```bash
git add src/app/\(app\)/recepcao/reception-dashboard.tsx
git commit -m "feat: reorganize reception layout to horizontal form with metrics in row"
```

---

## Task 7: Testar Completamente o Layout e Responsividade

**Arquivos:**
- Nenhum arquivo será modificado (apenas testes)

Vamos fazer testes completos no layout.

- [ ] **Passo 1: Testar em Desktop**

Abre http://localhost:3000/recepcao em um navegador desktop (Chrome, Firefox, Safari) e verifica:
- [ ] Cabeçalho aparece corretamente com data e status realtime
- [ ] Formulário ocupa full-width
- [ ] Cards de métrica aparecem em 5 colunas
- [ ] Seções do formulário estão bem espaçadas
- [ ] Ao selecionar um exame, o campo de quantidade aparece inline
- [ ] Ao desselecionar, o campo some

- [ ] **Passo 2: Testar em Tablet**

Redimensiona a janela para tablet (iPad, ~800px) e verifica:
- [ ] Layout mantém responsividade
- [ ] Cards de métrica se reorganizam em grid apropriado (pode ser 2-3 colunas em tablet)
- [ ] Formulário mantém legibilidade

- [ ] **Passo 3: Testar em Mobile**

Redimensiona para mobile (~375px) e verifica:
- [ ] Layout é usável em mobile
- [ ] Cards de métrica empilham verticalmente
- [ ] Formulário é legível
- [ ] Exames ficam em 1-2 colunas

- [ ] **Passo 4: Testar Funcionalidade do Formulário**

No desktop:
- [ ] Digita nome do paciente
- [ ] Digita número de cadastro
- [ ] Seleciona alguns exames
- [ ] Insere quantidade para cada exame
- [ ] Seleciona prioridade
- [ ] Adiciona observação
- [ ] Clica em "Salvar atendimento"
- [ ] Verifica se o atendimento é criado corretamente
- [ ] Verifica se o card "Aguardando" aumenta

- [ ] **Passo 5: Testar com Data Histórica**

- [ ] Muda a data para ontem (clica no filtro de data)
- [ ] Verifica se o formulário desaparece e mostra mensagem de bloqueio
- [ ] Verifica se a lista de atendimentos do dia anterior aparece
- [ ] Volta para "Hoje" e verifica se formulário reaparece

- [ ] **Passo 6: Nenhum commit necessário**

Os testes são apenas para validação.

---

## Task 8: Verificação Final e Validação

**Arquivos:**
- Nenhum arquivo será modificado

Revisão final do que foi implementado.

- [ ] **Passo 1: Comparar com a Design Aprovada**

Abre o arquivo `preview-layout.html` que foi aprovado e compara com o layout implementado:
- [ ] Layout geral é similar (formulário full-width no topo, métricas em linha)
- [ ] Data em foco aparece no topo direito
- [ ] Todos os 7 exames aparecem organizados por sala
- [ ] Campo de quantidade aparece quando exame é selecionado
- [ ] Cards de métrica têm 5 colunas no desktop

- [ ] **Passo 2: Verificar Sem Regredir Outras Funcionalidades**

- [ ] Realtime ainda funciona (atendimentos se atualizam em tempo real)
- [ ] Filtros de status ainda funcionam na lista de atendimentos
- [ ] Expansão de atendimentos ainda funciona
- [ ] Ações sobre atendimentos ainda funcionam

- [ ] **Passo 3: Verificar Performance**

- [ ] Página carrega rapidamente
- [ ] Não há console warnings ou errors significativos
- [ ] Cliques no formulário são responsivos

---

## Resumo

Este plano implementa a reorganização completa do layout da página de recepção, transformando de um layout em 2 colunas (formulário esquerda, métricas direita) para um layout horizontal:

1. **Cabeçalho com data em foco** no topo
2. **Formulário full-width** com seções bem organizadas (paciente, exames por sala com quantidade, prioridade + observação)
3. **Cards de métricas em linha horizontal** (5 colunas) abaixo do formulário
4. **Lista de atendimentos** mantida como estava abaixo

Componentes criados (reutilizáveis):
- `PatientSection` - seção de dados do paciente
- `ExamsSection` - seção de exames organizados por sala
- `PriorityNotesSection` - seção de prioridade e observação
- `ReceptionHeader` - cabeçalho com data em foco e status realtime

Commits serão pequenos e focados, permitindo fácil rastreamento de mudanças.
