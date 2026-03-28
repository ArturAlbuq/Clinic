"use client";

import { useMemo, useState } from "react";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import {
  ATTENDANCE_STATUS_LABELS,
  EXAM_LABELS,
  PRIORITY_LABELS,
  RECEPTION_STATUS_FILTERS,
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
import { formatClock, formatDateTime } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  getAttendanceOverallStatus,
  groupAttendancesWithQueueItems,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";

type ReceptionDashboardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  rooms: ExamRoomRecord[];
};

type StatusFilter = AttendanceOverallStatus | "todos";

const FILTER_LABELS: Record<StatusFilter, string> = {
  todos: "Todos",
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const PRIORITY_OPTIONS: AttendancePriority[] = [
  "normal",
  "sessenta_mais_outras",
  "oitenta_mais",
];

export function ReceptionDashboard({
  initialAttendances,
  initialItems,
  rooms,
}: ReceptionDashboardProps) {
  const {
    attendances,
    queueItems,
    realtimeError,
    realtimeStatus,
    setAttendances,
    setQueueItems,
  } = useRealtimeClinicData({
    initialAttendances,
    initialQueueItems: initialItems,
  });
  const [patientName, setPatientName] = useState("");
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
        patientName,
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
      setFormError(payload.error || "Não foi possível salvar o atendimento.");
      setIsSubmitting(false);
      return;
    }

    setAttendances((current) => [payload.attendance as AttendanceRecord, ...current]);
    setQueueItems((current) => [
      ...current,
      ...((payload.queueItems ?? []) as QueueItemRecord[]),
    ]);
    setPatientName("");
    setSelectedExams([]);
    setExamQuantities({});
    setPriority("normal");
    setNotes("");
    setFormSuccess("Atendimento enviado para os exames selecionados.");
    setIsSubmitting(false);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Recepção
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                Cadastro rápido por exame
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                A recepção escolhe os exames, informa a quantidade quando fizer
                sentido e o sistema direciona cada etapa para a sala correta.
              </p>
            </div>
            <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
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

            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Exames
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                {rooms.map((room) => {
                  const checked = selectedExams.includes(room.exam_type);
                  const quantity = examQuantities[room.exam_type] ?? 1;

                  return (
                    <label
                      key={room.slug}
                      className={
                        checked
                          ? "rounded-[22px] border border-cyan-300 bg-cyan-50 px-4 py-4"
                          : "rounded-[22px] border border-slate-200 bg-white px-4 py-4"
                      }
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExam(room.exam_type)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {EXAM_LABELS[room.exam_type]}
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
                                  updateExamQuantity(
                                    room.exam_type,
                                    event.target.value,
                                  )
                                }
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

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
                Observação
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                placeholder="Opcional. Ex.: encaixe, retorno, prioridade clínica."
              />
            </label>

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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="Aguardando"
            value={String(totalWaiting)}
            helper="Atendimentos sem etapa iniciada."
            accent="amber"
          />
          <MetricCard
            label="Em andamento"
            value={String(totalInProgress)}
            helper="Atendimentos com alguma etapa em fluxo."
            accent="teal"
          />
          <MetricCard
            label="Finalizados"
            value={String(totalFinished)}
            helper="Atendimentos com todas as etapas concluídas."
          />
          <MetricCard
            label="Cancelados"
            value={String(totalCanceled)}
            helper="Atendimentos encerrados com motivo registrado."
          />
        </div>
      </section>

      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Lista do dia
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              Visão geral da recepção
            </h3>
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
          <div className="mt-6 space-y-3">
            {filteredAttendances.map((attendance) => (
              <AttendanceRow key={attendance.id} attendance={attendance} />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="Nenhum atendimento nesse filtro"
              description="Assim que a recepção cadastrar um paciente, o atendimento aparece aqui com os exames direcionados automaticamente."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function AttendanceRow({ attendance }: { attendance: AttendanceWithQueueItems }) {
  const overallStatus = getAttendanceOverallStatus(attendance, attendance.queueItems);
  const completedSteps = attendance.queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;
  const requestedQuantity = attendance.queueItems.reduce(
    (total, item) => total + item.requested_quantity,
    0,
  );

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)]">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.7fr_0.8fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-slate-950">
              {attendance.patient_name}
            </p>
            <PriorityBadge priority={attendance.priority} />
            <AttendanceOverallBadge status={overallStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {attendance.notes || "Sem observação"}
          </p>
          {attendance.cancellation_reason ? (
            <p className="mt-2 text-sm font-medium text-rose-700">
              Motivo do cancelamento: {attendance.cancellation_reason}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Entrada
          </p>
          <p className="mt-1 font-mono text-sm text-slate-700">
            {formatClock(attendance.created_at)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {requestedQuantity} exame
            {requestedQuantity === 1 ? "" : "s"} solicitados
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Andamento
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {completedSteps} de {attendance.queueItems.length} etapas concluídas
          </p>
          {attendance.canceled_at ? (
            <p className="mt-2 text-sm text-slate-600">
              Cancelado em {formatDateTime(attendance.canceled_at)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <AttendanceTimeline items={attendance.queueItems} title="Etapas do atendimento" />
      </div>
    </div>
  );
}

function AttendanceOverallBadge({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-300 bg-amber-100 text-amber-950",
    em_andamento: "border-cyan-200 bg-cyan-50 text-cyan-800",
    finalizado: "border-slate-200 bg-slate-100 text-slate-700",
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
