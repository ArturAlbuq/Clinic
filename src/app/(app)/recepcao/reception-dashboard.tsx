"use client";

import { useMemo, useState } from "react";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { AttendanceRowCompact } from "@/components/attendance-row-compact";
import { AttendanceRowExpanded } from "@/components/attendance-row-expanded";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { ReceptionReturnActionCard } from "@/components/reception-return-action-card";
import { StatusBadge } from "@/components/status-badge";
import { ReceptionHeader } from "./reception-header";
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
  PipelineFlags,
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

const PIPELINE_FLAGS_DEFAULT: PipelineFlags = {
  com_laudo: false,
  com_cefalometria: false,
  com_impressao_fotografia: false,
  com_laboratorio_externo_escaneamento: false,
};

const LAUDO_EXAMS = new Set<ExamType>([
  "periapical",
  "interproximal",
  "panoramica",
  "tomografia",
]);

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
  const [pipelineFlags, setPipelineFlags] = useState<PipelineFlags>(PIPELINE_FLAGS_DEFAULT);
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

        const nextSelected = current.filter((entry) => entry !== examType);

        setPipelineFlags((flags) => {
          const next = { ...flags };
          if (LAUDO_EXAMS.has(examType) && !nextSelected.some((e) => LAUDO_EXAMS.has(e))) {
            next.com_laudo = false;
          }
          if (examType === "telerradiografia") next.com_cefalometria = false;
          if (examType === "fotografia") next.com_impressao_fotografia = false;
          if (examType === "escaneamento_intra_oral") next.com_laboratorio_externo_escaneamento = false;
          return next;
        });

        return nextSelected;
      }

      setExamQuantities((currentQuantities) => ({
        ...currentQuantities,
        [examType]: currentQuantities[examType] ?? 1,
      }));

      return [...current, examType];
    });
  }

  function togglePipelineFlag(flag: keyof PipelineFlags, value: boolean) {
    setPipelineFlags((current) => ({ ...current, [flag]: value }));
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
    setPipelineFlags(PIPELINE_FLAGS_DEFAULT);
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

  function applyAttendanceMutation(
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) {
    setAttendances((currentAttendances) =>
      currentAttendances.map((attendance) =>
        attendance.id === updatedAttendance.id ? updatedAttendance : attendance,
      ),
    );
    setQueueItems((currentQueueItems) => {
      const remainingItems = currentQueueItems.filter(
        (queueItem) => queueItem.attendance_id !== updatedAttendance.id,
      );

      return [...remainingItems, ...updatedQueueItems].sort(
        (left, right) =>
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime(),
      );
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <ReceptionHeader
            isToday={isToday}
            selectedDate={selectedDate}
            realtimeStatus={realtimeStatus}
            realtimeError={realtimeError}
          />

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
                pipelineFlags={pipelineFlags}
                onTogglePipelineFlag={togglePipelineFlag}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                      rooms={rooms}
                      onAttendanceSaved={applyAttendanceMutation}
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
