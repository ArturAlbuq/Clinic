"use client";

import { useMemo, useState } from "react";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import {
  ATTENDANCE_STATUS_LABELS,
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
import { formatClock } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  getAttendanceOverallStatus,
  groupAttendancesWithQueueItems,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

type ReceptionDashboardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  profileId: string;
  rooms: ExamRoomRecord[];
};

type StatusFilter = AttendanceOverallStatus | "todos";

const FILTER_LABELS: Record<StatusFilter, string> = {
  todos: "Todos",
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
};

const PRIORITY_OPTIONS: AttendancePriority[] = ["normal", "alta", "urgente"];

export function ReceptionDashboard({
  initialAttendances,
  initialItems,
  profileId,
  rooms,
}: ReceptionDashboardProps) {
  const { attendances, queueItems, setAttendances, setQueueItems } =
    useRealtimeClinicData({
      initialAttendances,
      initialQueueItems: initialItems,
    });
  const [patientName, setPatientName] = useState("");
  const [selectedExams, setSelectedExams] = useState<ExamType[]>([]);
  const [priority, setPriority] = useState<AttendancePriority>("normal");
  const [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

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
              getAttendanceOverallStatus(attendance.queueItems) === statusFilter,
          ),
    [groupedAttendances, statusFilter],
  );

  const totalWaiting = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance.queueItems) === "aguardando",
  ).length;
  const totalInProgress = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance.queueItems) === "em_andamento",
  ).length;
  const totalFinished = groupedAttendances.filter(
    (attendance) =>
      getAttendanceOverallStatus(attendance.queueItems) === "finalizado",
  ).length;

  function toggleExam(examType: ExamType) {
    setSelectedExams((current) =>
      current.includes(examType)
        ? current.filter((entry) => entry !== examType)
        : [...current, examType],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!selectedExams.length) {
      setFormError("Selecione ao menos uma sala/exame.");
      return;
    }

    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      setFormError("Supabase não configurado.");
      return;
    }

    setIsSubmitting(true);

    const { data: attendance, error: attendanceError } = await supabase
      .from("attendances")
      .insert({
        created_by: profileId,
        notes: notes.trim() || null,
        patient_name: patientName.trim(),
        priority,
      })
      .select("*")
      .single();

    if (attendanceError || !attendance) {
      setFormError(
        attendanceError?.message || "Não foi possível criar o atendimento.",
      );
      setIsSubmitting(false);
      return;
    }

    const createdAttendance = attendance as AttendanceRecord;

    const { data: createdQueueItems, error: queueError } = await supabase
      .from("queue_items")
      .insert(
        selectedExams.map((examType) => ({
          attendance_id: createdAttendance.id,
          exam_type: examType,
        })),
      )
      .select("*");

    if (queueError || !createdQueueItems) {
      setFormError(
        queueError?.message || "Não foi possível criar os itens da fila.",
      );
      setIsSubmitting(false);
      return;
    }

    setAttendances((current) => [createdAttendance, ...current]);
    setQueueItems((current) => [
      ...current,
      ...(createdQueueItems as QueueItemRecord[]),
    ]);
    setPatientName("");
    setSelectedExams([]);
    setPriority("normal");
    setNotes("");
    setIsSubmitting(false);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Recepção
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Cadastro rápido do atendimento
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Cadastre o paciente uma vez, selecione uma ou mais salas, defina a
            prioridade e envie tudo para o fluxo em tempo real.
          </p>

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
                Salas / exames
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                {rooms.map((room) => {
                  const checked = selectedExams.includes(room.exam_type);

                  return (
                    <label
                      key={room.slug}
                      className={
                        checked
                          ? "rounded-[22px] border border-cyan-300 bg-cyan-50 px-4 py-3"
                          : "rounded-[22px] border border-slate-200 bg-white px-4 py-3"
                      }
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExam(room.exam_type)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                        />
                        <span className="text-sm font-medium text-slate-800">
                          {room.name}
                        </span>
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
                    {option}
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
                placeholder="Opcional. Ex.: encaixe, retorno, paciente com prioridade clinica."
              />
            </label>

            {formError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
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

        <div className="grid gap-4 sm:grid-cols-3">
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
              description="Assim que a recepção cadastrar um paciente, o atendimento aparece aqui com todas as salas selecionadas."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function AttendanceRow({ attendance }: { attendance: AttendanceWithQueueItems }) {
  const overallStatus = getAttendanceOverallStatus(attendance.queueItems);
  const completedSteps = attendance.queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)]">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.65fr_0.75fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-slate-950">
              {attendance.patient_name}
            </p>
            <PriorityBadge priority={attendance.priority} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {attendance.notes || "Sem observação"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Situação geral
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {ATTENDANCE_STATUS_LABELS[overallStatus]}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Entrada
          </p>
          <p className="mt-1 font-mono text-sm text-slate-700">
            {formatClock(attendance.created_at)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {completedSteps} de {attendance.queueItems.length} concluídas
          </p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <AttendanceTimeline items={attendance.queueItems} title="Etapas do atendimento" />
      </div>
    </div>
  );
}
