"use client";

import { useMemo, useState } from "react";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { AttendanceRowCompact } from "@/components/attendance-row-compact";
import { AttendanceRowExpanded } from "@/components/attendance-row-expanded";
import { DayFilterControls } from "@/components/day-filter-controls";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { ReceptionReturnActionCard } from "@/components/reception-return-action-card";
import { StatusBadge } from "@/components/status-badge";
import { PatientSection } from "./patient-section";
import { ExamsSection } from "./exams-section";
import { PriorityNotesSection } from "./priority-notes-section";
import {
  ATTENDANCE_STATUS_LABELS,
  EXAM_LABELS,
  PRIORITY_LABELS,
  RECEPTION_STATUS_FILTERS,
  ROOM_EXAM_TYPES,
} from "@/lib/constants";
import type {
  AttendanceOverallStatus,
  AttendancePriority,
  AttendanceRecord,
  AttendanceWithQueueItems,
  ExamRoomRecord,
  ExamType,
  QueueItemRecord,
} from "@/lib/database.types";
import {
  formatClock,
  formatDate,
  formatDateInputValue,
  formatDateTime,
} from "@/lib/date";
import { readJsonResponse } from "@/lib/fetch-json";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  getAttendanceOverallStatus,
  groupAttendancesWithQueueItems,
  isQueueItemReturnPending,
  sortAttendanceQueueItemsByFlow,
  sortAttendancesByPriorityAndCreatedAt,
  type QueueDateRange,
} from "@/lib/queue";

type ReceptionDashboardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  range: QueueDateRange;
  rooms: ExamRoomRecord[];
  selectedDate: string;
};

type StatusFilter = AttendanceOverallStatus | "todos";

const FILTER_LABELS: Record<StatusFilter, string> = {
  todos: "Todos",
  aguardando: "Aguardando",
  pendente_retorno: "Pendente de retorno",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export function ReceptionDashboard({
  initialAttendances,
  initialItems,
  range,
  rooms,
  selectedDate,
}: ReceptionDashboardProps) {
  const {
    attendances,
    queueItems,
    realtimeError,
    realtimeStatus,
    setAttendances,
    setQueueItems,
  } = useRealtimeClinicData({
    includePendingReturns: true,
    initialAttendances,
    initialQueueItems: initialItems,
    range,
  });
  const isToday = selectedDate === formatDateInputValue(new Date());
  const [patientName, setPatientName] = useState("");
  const [patientRegistrationNumber, setPatientRegistrationNumber] = useState("");
  const [selectedExams, setSelectedExams] = useState<ExamType[]>([]);
  const [examQuantities, setExamQuantities] = useState<
    Partial<Record<ExamType, number>>
  >({});
  const [priority, setPriority] = useState<AttendancePriority>("normal");
  const [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groupedAttendances = useMemo(() => {
    const grouped = groupAttendancesWithQueueItems(attendances, queueItems);
    return sortAttendancesByPriorityAndCreatedAt(grouped);
  }, [attendances, queueItems]);

  const filteredAttendances = useMemo(
    () =>
      statusFilter === "todos"
        ? groupedAttendances
        : groupedAttendances.filter(
            (attendance) =>
              getAttendanceOverallStatus(attendance, attendance.queueItems) ===
              statusFilter,
          ),
    [groupedAttendances, statusFilter],
  );

  const totalWaiting = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance, attendance.queueItems) ===
      "aguardando",
  ).length;
  const totalInProgress = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance, attendance.queueItems) ===
      "em_andamento",
  ).length;
  const totalFinished = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance, attendance.queueItems) ===
      "finalizado",
  ).length;
  const totalCanceled = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance, attendance.queueItems) ===
      "cancelado",
  ).length;

  function toggleExam(examType: ExamType) {
    setSelectedExams((current) => {
      const alreadySelected = current.includes(examType);

      if (alreadySelected) {
        setExamQuantities((currentQuantities) => {
          const nextQuantities = { ...currentQuantities };
          delete nextQuantities[examType];
          return nextQuantities;
        });

        return current.filter((entry) => entry !== examType);
      }

      setExamQuantities((currentQuantities) => ({
        ...currentQuantities,
        [examType]: currentQuantities[examType] ?? 1,
      }));

      return [...current, examType];
    });
  }

  function updateExamQuantity(examType: ExamType, rawValue: string) {
    const parsed = Number(rawValue);
    const quantity =
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 99) : 1;

    setExamQuantities((current) => ({
      ...current,
      [examType]: quantity,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (isSubmitting) {
      return;
    }

    const trimmedPatientName = patientName.trim();

    if (trimmedPatientName.length < 2) {
      setFormError("Nome do paciente deve ter ao menos 2 caracteres.");
      return;
    }

    if (!selectedExams.length) {
      setFormError("Selecione ao menos um exame.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/clinic/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        examQuantities,
        notes,
        patientName: trimmedPatientName,
        patientRegistrationNumber: patientRegistrationNumber.trim() || null,
        priority,
        selectedExams,
      }),
    });

    const payload = (await response.json()) as {
      attendance?: AttendanceRecord;
      error?: string;
      queueItems?: QueueItemRecord[];
    };

    if (!response.ok || !payload.attendance) {
      setFormError(payload.error || "Nao foi possivel salvar o atendimento.");
      setIsSubmitting(false);
      return;
    }

    setAttendances((current) => [payload.attendance as AttendanceRecord, ...current]);
    setQueueItems((current) => [
      ...current,
      ...((payload.queueItems ?? []) as QueueItemRecord[]),
    ]);
    setPatientName("");
    setPatientRegistrationNumber("");
    setSelectedExams([]);
    setExamQuantities({});
    setPriority("normal");
    setNotes("");
    setFormSuccess("Atendimento enviado para os exames selecionados.");
    setIsSubmitting(false);
  }

  function applyQueueItemMutation(
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems: QueueItemRecord[] = [],
  ) {
    setAttendances((currentAttendances) =>
      currentAttendances.map((attendance) =>
        attendance.id === updatedAttendance.id ? updatedAttendance : attendance,
      ),
    );
    const queueItemMap = new Map(
      (updatedQueueItems.length ? updatedQueueItems : [updatedItem]).map((queueItem) => [
        queueItem.id,
        queueItem,
      ]),
    );

    setQueueItems((currentItems) =>
      currentItems.map(
        (currentItem) => queueItemMap.get(currentItem.id) ?? currentItem,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
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
            <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
          </div>

          <div className="mt-6">
            <DayFilterControls
              historyMessage="Modo consulta ativo. Para cadastrar novos pacientes, volte para Hoje."
              selectedDate={selectedDate}
            />
          </div>

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
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            label="Aguardando"
            value={String(totalWaiting)}
            helper="Atendimentos sem exame iniciado."
            accent="amber"
            compact
          />
          <MetricCard
            label="Em andamento"
            value={String(totalInProgress)}
            helper="Atendimentos com algum exame em fluxo."
            accent="teal"
            compact
          />
          <MetricCard
            label="Finalizados"
            value={String(totalFinished)}
            helper="Atendimentos com todos os exames concluidos."
            compact
          />
          <MetricCard
            label="Cancelados"
            value={String(totalCanceled)}
            helper="Atendimentos encerrados com motivo registrado."
            compact
          />
        </div>
      </section>

      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Lista operacional
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              Visao geral da recepcao
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {isToday ? "Recorte atual: hoje." : `Recorte atual: ${formatDate(selectedDate)}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {RECEPTION_STATUS_FILTERS.map((filter) => {
              const isActive = filter === statusFilter;

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={
                    isActive
                      ? "rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  }
                >
                  {FILTER_LABELS[filter]}
                </button>
              );
            })}
          </div>
        </div>

        {filteredAttendances.length ? (
          <div className="mt-6 space-y-0">
            {filteredAttendances.map((attendance) => {
              const isExpanded = expandedId === attendance.id;
              return (
                <div key={attendance.id}>
                  <AttendanceRowCompact
                    attendance={attendance}
                    onExpandClick={() =>
                      setExpandedId(isExpanded ? null : attendance.id)
                    }
                  />
                  {isExpanded && (
                    <AttendanceRowExpanded
                      attendance={attendance}
                      isToday={isToday}
                      onQueueItemMutation={(updatedAttendance, updatedItem, updatedQueueItems) => {
                        applyQueueItemMutation(
                          updatedAttendance,
                          updatedItem,
                          updatedQueueItems,
                        );
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="Nenhum atendimento nesse filtro"
              description="Ajuste a data ou o filtro para revisar outro conjunto de registros."
            />
          </div>
        )}
      </section>
    </div>
  );
}


function AttendanceOverallBadge({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-300 bg-amber-100 text-amber-950",
    pendente_retorno: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    em_andamento: "border-sky-200 bg-sky-50 text-sky-800",
    finalizado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}
