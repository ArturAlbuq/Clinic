"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import {
  ATTENDANCE_STATUS_LABELS,
  ROOM_BY_SLUG,
  ROOM_ORDER,
  type RoomSlug,
} from "@/lib/constants";
import type {
  AttendanceRecord,
  AttendanceOverallStatus,
  AttendanceWithQueueItems,
  ExamRoomRecord,
  QueueItemRecord,
} from "@/lib/database.types";
import {
  formatClock,
  formatDate,
  formatDateInputValue,
  formatDateTime,
  formatMinuteLabel,
  formatMonthYear,
} from "@/lib/date";
import { StatusBadge } from "@/components/status-badge";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  combineQueueItemsWithAttendances,
  getAttendanceTotalMinutes,
  getAttendanceOverallStatus,
  getAverageWaitMinutes,
  getQueueWaitMinutes,
  getQueueStageExecutionMinutes,
  getQueueStageTotalMinutes,
  getQueueStageWaitMinutes,
  groupAttendancesWithQueueItems,
  parseDateInput,
  type QueueDateRange,
  type QueuePeriod,
  sortAttendanceQueueItemsByFlow,
  sortRoomQueueItems,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";
import { useEffect, useState } from "react";

type AdminDashboardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  initialPeriod: QueuePeriod;
  initialSelectedDate: string;
  range: QueueDateRange;
  rooms: ExamRoomRecord[];
};

export function AdminDashboard({
  initialAttendances,
  initialItems,
  initialPeriod,
  initialSelectedDate,
  range,
  rooms,
}: AdminDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [priorityFilter, setPriorityFilter] = useState<
    AttendanceRecord["priority"] | "todas"
  >("todas");
  const [statusFilter, setStatusFilter] = useState<
    AttendanceOverallStatus | "todos"
  >("todos");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { attendances, queueItems, realtimeError, realtimeStatus } = useRealtimeClinicData({
    initialAttendances,
    initialQueueItems: initialItems,
    range,
  });
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNowMs(Date.now()));
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const referenceNow = nowMs;
  const selectedDate = parseDateInput(initialSelectedDate);
  const periodLabel = getPeriodLabel(initialPeriod, selectedDate);

  const groupedAttendances = sortAttendancesByPriorityAndCreatedAt(
    groupAttendancesWithQueueItems(attendances, queueItems),
  );

  const totalAttendances = attendances.length;
  const totalQueueItems = queueItems.length;
  const averageWait = getAverageWaitMinutes(queueItems);
  const waitingItems = queueItems.filter((item) => item.status === "aguardando");
  const activeItems = queueItems.filter(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  );
  const urgentWaitingAttendances = groupedAttendances.filter(
    (attendance) =>
      attendance.priority === "urgente" &&
      attendance.queueItems.some((item) => item.status === "aguardando"),
  );
  const longestWaitingItem = waitingItems.reduce<QueueItemRecord | null>(
    (currentLongest, item) => {
      if (!currentLongest) {
        return item;
      }

      return getQueueWaitMinutes(item, referenceNow) >
        getQueueWaitMinutes(currentLongest, referenceNow)
        ? item
        : currentLongest;
    },
    null,
  );
  const roomsWithBacklog = ROOM_ORDER.map((roomSlug) => {
    const roomItems = queueItems.filter((item) => item.room_slug === roomSlug);
    const waitingByRoom = roomItems.filter((item) => item.status === "aguardando");

    return {
      room: rooms.find((entry) => entry.slug === roomSlug),
      roomSlug,
      waitingCount: waitingByRoom.length,
    };
  })
    .filter((room) => room.waitingCount > 0)
    .sort((left, right) => right.waitingCount - left.waitingCount);
  const filteredAttendances = groupedAttendances.filter((attendance) => {
    const overallStatus = getAttendanceOverallStatus(attendance.queueItems);

    const matchesPriority =
      priorityFilter === "todas" || attendance.priority === priorityFilter;
    const matchesStatus =
      statusFilter === "todos" || overallStatus === statusFilter;

    return matchesPriority && matchesStatus;
  });
  const visibleAttendances = filteredAttendances;

  const priorityCounts = {
    alta: attendances.filter((attendance) => attendance.priority === "alta").length,
    normal: attendances.filter((attendance) => attendance.priority === "normal").length,
    urgente: attendances.filter((attendance) => attendance.priority === "urgente").length,
  };
  const finishedAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance.queueItems) === "finalizado",
  ).length;
  const activeAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance.queueItems) === "em_andamento",
  ).length;
  const waitingAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance.queueItems) === "aguardando",
  ).length;
  const activeRooms = ROOM_ORDER.filter((roomSlug) =>
    queueItems.some(
      (item) =>
        item.room_slug === roomSlug &&
        (item.status === "chamado" || item.status === "em_atendimento"),
    ),
  ).length;

  function updateRange(next: { date?: string; period?: QueuePeriod }) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("date", next.date ?? initialSelectedDate);
    params.set("period", next.period ?? initialPeriod);

    router.push(`${pathname}?${params.toString()}`);
  }

  function shiftPeriod(step: -1 | 1) {
    const nextDate = new Date(selectedDate);

    if (initialPeriod === "day") {
      nextDate.setDate(nextDate.getDate() + step);
    }

    if (initialPeriod === "month") {
      nextDate.setMonth(nextDate.getMonth() + step);
    }

    if (initialPeriod === "quarter") {
      nextDate.setMonth(nextDate.getMonth() + step * 3);
    }

    if (initialPeriod === "year") {
      nextDate.setFullYear(nextDate.getFullYear() + step);
    }

    updateRange({ date: formatDateInputValue(nextDate) });
  }

  return (
    <div className="space-y-6">
      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Período de análise
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {periodLabel}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Use o filtro para revisar outro dia ou abrir a visão acumulada do
              mês, trimestre ou ano.
            </p>
          </div>
          <div className="space-y-3">
            <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
            <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Período"
              value={initialPeriod}
              onChange={(value) => updateRange({ period: value as QueuePeriod })}
              options={[
                { label: "Dia", value: "day" },
                { label: "Mês", value: "month" },
                { label: "Trimestre", value: "quarter" },
                { label: "Ano", value: "year" },
              ]}
            />
            <label className="flex min-w-[170px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Data-base
              </span>
              <input
                className="bg-transparent text-sm font-medium text-slate-900 outline-none"
                type="date"
                value={initialSelectedDate}
                onChange={(event) => updateRange({ date: event.target.value })}
              />
            </label>
            <div className="flex items-stretch gap-2">
              <NavButton label="Anterior" onClick={() => shiftPeriod(-1)} />
              <NavButton
                label="Hoje"
                onClick={() =>
                  updateRange({
                    date: formatDateInputValue(new Date()),
                    period: initialPeriod,
                  })
                }
              />
              <NavButton label="Próximo" onClick={() => shiftPeriod(1)} />
            </div>
          </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Admin
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Resumo operacional
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Visão consolidada para identificar fila, prioridades e gargalos sem
            navegar pelas salas.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <HighlightPill
              label="Ativos agora"
              value={`${activeAttendances} atendimento${activeAttendances === 1 ? "" : "s"}`}
              tone="teal"
            />
            <HighlightPill
              label="Aguardando"
              value={`${waitingAttendances} paciente${waitingAttendances === 1 ? "" : "s"}`}
              tone="amber"
            />
            <HighlightPill
              label="Finalizados"
              value={`${finishedAttendances} concluído${finishedAttendances === 1 ? "" : "s"}`}
              tone="slate"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="Atendimentos"
            value={String(totalAttendances)}
            helper="Cadastros únicos do período."
            accent="teal"
          />
          <MetricCard
            label="Itens de fila"
            value={String(totalQueueItems)}
            helper="Total de etapas distribuidas nas salas."
            accent="amber"
          />
          <MetricCard
            label="Urgentes esperando"
            value={String(urgentWaitingAttendances.length)}
            helper="Pacientes urgentes ainda não chamados."
          />
          <MetricCard
            label="Maior espera"
            value={
              longestWaitingItem
                ? formatMinuteLabel(getQueueWaitMinutes(longestWaitingItem, referenceNow))
                : "--"
            }
            helper="Maior fila aberta neste momento."
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Alertas do período
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                O que pede atenção agora
              </h3>
            </div>
            <p className="text-sm text-slate-500">{activeRooms} salas com atendimento ativo</p>
          </div>
          <div className="mt-6 grid gap-3">
            <AlertRow
              label="Urgentes aguardando"
              value={
                urgentWaitingAttendances.length
                  ? `${urgentWaitingAttendances.length} na fila`
                  : "Sem urgência pendente"
              }
              tone={urgentWaitingAttendances.length ? "rose" : "slate"}
            />
            <AlertRow
              label="Salas com maior fila"
              value={
                roomsWithBacklog.length
                  ? roomsWithBacklog
                      .slice(0, 2)
                      .map((room) => `${room.room?.name ?? room.roomSlug} (${room.waitingCount})`)
                      .join(" | ")
                  : "Sem fila acumulada"
              }
              tone={roomsWithBacklog.length ? "amber" : "slate"}
            />
            <AlertRow
              label="Itens em andamento"
              value={
                activeItems.length
                  ? `${activeItems.length} etapa${activeItems.length === 1 ? "" : "s"} ativa${activeItems.length === 1 ? "" : "s"}`
                  : "Nenhum exame em andamento"
              }
              tone={activeItems.length ? "teal" : "slate"}
            />
            <AlertRow
              label="Espera média do período"
              value={formatMinuteLabel(averageWait)}
              tone="slate"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <MetricCard
            label="Normal"
            value={String(priorityCounts.normal)}
            helper="Atendimentos do período."
          />
          <MetricCard
            label="Alta"
            value={String(priorityCounts.alta)}
            helper="Demandas com destaque operacional."
            accent="teal"
          />
          <MetricCard
            label="Urgente"
            value={String(priorityCounts.urgente)}
            helper="Passam na frente na fila."
            accent="amber"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {ROOM_ORDER.map((roomSlug) => {
          return (
            <RoomSummaryCard
              key={roomSlug}
              roomSlug={roomSlug}
              room={rooms.find((entry) => entry.slug === roomSlug)}
              queueItems={queueItems}
              attendances={attendances}
            />
          );
        })}
      </section>

      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Lista operacional
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              Atendimentos do período
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {visibleAttendances.length} resultado{visibleAttendances.length === 1 ? "" : "s"} no filtro atual.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Prioridade"
              value={priorityFilter}
              onChange={(value) =>
                setPriorityFilter(value as AttendanceRecord["priority"] | "todas")
              }
              options={[
                { label: "Todas", value: "todas" },
                { label: "Urgente", value: "urgente" },
                { label: "Alta", value: "alta" },
                { label: "Normal", value: "normal" },
              ]}
            />
            <FilterSelect
              label="Situação"
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as AttendanceOverallStatus | "todos")
              }
              options={[
                { label: "Todas", value: "todos" },
                { label: "Aguardando", value: "aguardando" },
                { label: "Em andamento", value: "em_andamento" },
                { label: "Finalizado", value: "finalizado" },
              ]}
            />
          </div>
        </div>

        {visibleAttendances.length ? (
          <div className="mt-6 space-y-3">
            {visibleAttendances.map((attendance) => (
              <AttendanceAdminRow
                key={attendance.id}
                attendance={attendance}
                nowMs={referenceNow}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="Sem movimentação neste período"
              description="Ajuste a data ou o período para revisar outro recorte da operação."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function NavButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function HighlightPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "slate" | "teal";
  value: string;
}) {
  const styles = {
    amber: "border-amber-200/80 bg-amber-50/80 text-amber-900",
    slate: "border-slate-200 bg-white/90 text-slate-900",
    teal: "border-cyan-200/80 bg-cyan-50/80 text-cyan-900",
  } as const;

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${styles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function AlertRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "rose" | "slate" | "teal";
  value: string;
}) {
  const styles = {
    amber: "border-amber-200/80 bg-amber-50/80 text-amber-900",
    rose: "border-rose-200/80 bg-rose-50/80 text-rose-900",
    slate: "border-slate-200 bg-slate-50/80 text-slate-800",
    teal: "border-emerald-200/80 bg-emerald-50/80 text-emerald-900",
  } as const;

  return (
    <div className={`rounded-[22px] border px-4 py-4 ${styles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        className="bg-transparent text-sm font-medium text-slate-900 outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RoomSummaryCard({
  attendances,
  queueItems,
  room,
  roomSlug,
}: {
  attendances: AttendanceRecord[];
  queueItems: QueueItemRecord[];
  room: ExamRoomRecord | undefined;
  roomSlug: RoomSlug;
}) {
  const roomItems = queueItems.filter((item) => item.room_slug === roomSlug);
  const roomQueue = sortRoomQueueItems(
    combineQueueItemsWithAttendances(roomItems, attendances),
  );
  const waitingByRoom = roomItems.filter((item) => item.status === "aguardando").length;
  const activeByRoom = roomItems.filter(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  ).length;
  const finishedByRoom = roomItems.filter((item) => item.status === "finalizado").length;
  const nextPatient = roomQueue.find((item) => item.status !== "finalizado");
  const longestWait = roomItems
    .filter((item) => item.status === "aguardando")
    .reduce<number | null>((longest, item) => {
      const currentWait = getQueueWaitMinutes(item);

      if (longest === null || currentWait > longest) {
        return currentWait;
      }

      return longest;
    }, null);

  return (
    <div className="app-panel rounded-[30px] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Sala
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {room?.name ?? roomSlug}
      </h3>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <SmallMetric label="Fila" tone="amber" value={waitingByRoom} />
        <SmallMetric label="Ativos" tone="teal" value={activeByRoom} />
        <SmallMetric label="Final" tone="slate" value={finishedByRoom} />
      </div>
      <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Próximo da fila
        </p>
        {nextPatient?.attendance ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-950">
                {nextPatient.attendance.patient_name}
              </p>
              <PriorityBadge priority={nextPatient.attendance.priority} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={nextPatient.status} />
              <span className="text-sm text-slate-600">
                Entrada {formatClock(nextPatient.attendance.created_at)}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Sem paciente pendente.</p>
        )}
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Maior espera: {longestWait === null ? "--" : formatMinuteLabel(longestWait)}
      </p>
    </div>
  );
}

function SmallMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "slate" | "teal";
  value: number;
}) {
  const styles = {
    amber: "border-amber-200/80 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    teal: "border-emerald-200/80 bg-emerald-50 text-emerald-900",
  } as const;

  return (
    <div className={`rounded-[18px] border px-3 py-3 ${styles[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AttendanceAdminRow({
  attendance,
  nowMs,
}: {
  attendance: AttendanceWithQueueItems;
  nowMs: number;
}) {
  const overallStatus = getAttendanceOverallStatus(attendance.queueItems);
  const rooms = sortAttendanceQueueItemsByFlow(attendance.queueItems)
    .map(
      (item) =>
        ROOM_BY_SLUG[item.room_slug as keyof typeof ROOM_BY_SLUG]?.shortName ??
        item.room_slug,
    )
    .join(" + ");
  const waitingItems = attendance.queueItems.filter(
    (item) => item.status === "aguardando",
  );
  const completedSteps = attendance.queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;
  const longestWait = waitingItems.reduce<number | null>((longest, item) => {
    const currentWait = getQueueWaitMinutes(item, nowMs);

    if (longest === null || currentWait > longest) {
      return currentWait;
    }

    return longest;
  }, null);
  const totalAttendanceMinutes = getAttendanceTotalMinutes(
    attendance,
    attendance.queueItems,
    nowMs,
  );

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)]">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.7fr_0.7fr_0.9fr] lg:items-start">
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
          <AttendanceStatusBadge status={overallStatus} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Tempo total
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatMinuteLabel(totalAttendanceMinutes)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Entrada {formatDateTime(attendance.created_at)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Resumo
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {rooms} · {completedSteps} de {attendance.queueItems.length} concluídas
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <AttendanceTimeline items={attendance.queueItems} title="Fluxo entre salas" />
        <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Fila aberta
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {waitingItems.length
              ? `${waitingItems.length} etapa${waitingItems.length === 1 ? "" : "s"} aguardando`
              : "Sem espera aberta"}
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Maior espera
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {longestWait === null ? "--" : formatMinuteLabel(longestWait)}
          </p>
        </div>
      </div>
      <details className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/60 px-4 py-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
          Ver tempos por exame
        </summary>
          <div className="mt-4 space-y-3">
          {sortAttendanceQueueItemsByFlow(attendance.queueItems).map((item) => (
            <StageTimingRow key={item.id} item={item} nowMs={nowMs} />
          ))}
        </div>
      </details>
    </div>
  );
}

function StageTimingRow({
  item,
  nowMs,
}: {
  item: QueueItemRecord;
  nowMs: number;
}) {
  const waitMinutes = getQueueStageWaitMinutes(item, nowMs);
  const executionMinutes = getQueueStageExecutionMinutes(item, nowMs);
  const totalMinutes = getQueueStageTotalMinutes(item, nowMs);
  const highWait = waitMinutes >= 20;
  const highExecution = (executionMinutes ?? 0) >= 20;
  const waitOngoing = !item.started_at;
  const executionOngoing = Boolean(item.started_at && !item.finished_at);
  const totalOngoing = !item.finished_at;
  const roomLabel =
    ROOM_BY_SLUG[item.room_slug as keyof typeof ROOM_BY_SLUG]?.shortName ??
    item.room_slug;

  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">
              {roomLabel}
            </p>
            <StatusBadge status={item.status} />
            {highWait ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Espera alta
              </span>
            ) : null}
            {highExecution ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">
                Execução longa
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TimeMetric
            emphasis={highWait}
            label="Espera"
            ongoing={waitOngoing}
            value={formatMinuteLabel(waitMinutes)}
          />
          <TimeMetric
            emphasis={highExecution}
            label="Execução"
            ongoing={executionOngoing}
            value={executionMinutes === null ? "--" : formatMinuteLabel(executionMinutes)}
          />
          <TimeMetric
            label="Total"
            ongoing={totalOngoing}
            value={formatMinuteLabel(totalMinutes)}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <TimeStampField label="Entrada na fila" value={item.created_at} />
        <TimeStampField label="Chamado" value={item.called_at} />
        <TimeStampField label="Início" value={item.started_at} />
        <TimeStampField label="Fim" value={item.finished_at} />
      </div>
    </div>
  );
}

function TimeMetric({
  emphasis = false,
  label,
  ongoing = false,
  value,
}: {
  emphasis?: boolean;
  label: string;
  ongoing?: boolean;
  value: string;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-3"
          : "rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3"
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {value}
        {ongoing && value !== "--" ? " correndo" : ""}
      </p>
    </div>
  );
}

function TimeStampField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-900">
        {value ? formatDateTime(value) : "--"}
      </p>
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-200 bg-amber-50 text-amber-800",
    em_andamento: "border-cyan-200 bg-cyan-50 text-cyan-800",
    finalizado: "border-slate-200 bg-slate-100 text-slate-700",
  } as const;

  return (
    <span
      className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}

function getPeriodLabel(period: QueuePeriod, selectedDate: Date) {
  if (period === "day") {
    return formatDate(selectedDate);
  }

  if (period === "month") {
    return capitalize(formatMonthYear(selectedDate));
  }

  if (period === "quarter") {
    const quarter = Math.floor(selectedDate.getMonth() / 3) + 1;
    return `${quarter}º trimestre de ${selectedDate.getFullYear()}`;
  }

  return String(selectedDate.getFullYear());
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
