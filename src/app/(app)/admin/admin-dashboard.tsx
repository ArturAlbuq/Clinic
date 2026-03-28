"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { StatusBadge } from "@/components/status-badge";
import {
  ATTENDANCE_STATUS_LABELS,
  EXAM_LABELS,
  PRIORITY_LABELS,
  ROOM_BY_SLUG,
  ROOM_ORDER,
  type RoomSlug,
} from "@/lib/constants";
import type {
  AttendanceOverallStatus,
  AttendancePriority,
  AttendanceRecord,
  AttendanceWithQueueItems,
  ExamRoomRecord,
  ExamType,
  ProfileRecord,
  QueueItemRecord,
} from "@/lib/database.types";
import {
  formatDate,
  formatDateInputValue,
  formatDateTime,
  formatMinuteLabel,
  formatMonthYear,
  getClinicQuarter,
  getClinicYear,
  shiftClinicDate,
} from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  combineQueueItemsWithAttendances,
  getAttendanceOverallStatus,
  getAttendanceTotalMinutes,
  getAverageWaitMinutes,
  getQueueStageExecutionMinutes,
  getQueueStageTotalMinutes,
  getQueueStageWaitMinutes,
  getQueueWaitMinutes,
  groupAttendancesWithQueueItems,
  sortAttendanceQueueItemsByFlow,
  sortRoomQueueItems,
  sortAttendancesByPriorityAndCreatedAt,
  type QueueDateRange,
  type QueuePeriod,
} from "@/lib/queue";

type AdminDashboardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  initialPeriod: QueuePeriod;
  initialSelectedDate: string;
  profiles: ProfileRecord[];
  range: QueueDateRange;
  rooms: ExamRoomRecord[];
};

type OrderFilter = "asc" | "desc";

export function AdminDashboard({
  initialAttendances,
  initialItems,
  initialPeriod,
  initialSelectedDate,
  profiles,
  range,
  rooms,
}: AdminDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [priorityFilter, setPriorityFilter] = useState<
    AttendancePriority | "todas"
  >("todas");
  const [statusFilter, setStatusFilter] = useState<
    AttendanceOverallStatus | "todos"
  >("todos");
  const [examFilter, setExamFilter] = useState<ExamType | "todos">("todos");
  const [roomFilter, setRoomFilter] = useState<RoomSlug | "todas">("todas");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("desc");
  const [reportRoomFilter, setReportRoomFilter] = useState<RoomSlug | "todas">(
    "todas",
  );
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

  const periodLabel = getPeriodLabel(initialPeriod, initialSelectedDate);
  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

  const groupedAttendances = useMemo(
    () =>
      sortAttendancesByPriorityAndCreatedAt(
        groupAttendancesWithQueueItems(attendances, queueItems),
      ),
    [attendances, queueItems],
  );

  const attendanceStatusMap = useMemo(
    () =>
      new Map(
        groupedAttendances.map((attendance) => [
          attendance.id,
          getAttendanceOverallStatus(attendance, attendance.queueItems),
        ]),
      ),
    [groupedAttendances],
  );

  const totalAttendances = attendances.length;
  const totalQueueItems = queueItems.length;
  const averageWait = getAverageWaitMinutes(
    queueItems.filter((item) => item.status !== "cancelado"),
  );
  const waitingItems = queueItems.filter((item) => item.status === "aguardando");
  const canceledAttendances = groupedAttendances.filter(
    (attendance) => attendanceStatusMap.get(attendance.id) === "cancelado",
  ).length;
  const waitingAttendances = groupedAttendances.filter(
    (attendance) => attendanceStatusMap.get(attendance.id) === "aguardando",
  ).length;
  const activeAttendances = groupedAttendances.filter(
    (attendance) => attendanceStatusMap.get(attendance.id) === "em_andamento",
  ).length;
  const finishedAttendances = groupedAttendances.filter(
    (attendance) => attendanceStatusMap.get(attendance.id) === "finalizado",
  ).length;
  const topPriorityWaiting = groupedAttendances.filter(
    (attendance) =>
      attendance.priority === "oitenta_mais" &&
      attendanceStatusMap.get(attendance.id) === "aguardando",
  ).length;
  const longestWaitingItem = waitingItems.reduce<QueueItemRecord | null>(
    (currentLongest, item) => {
      if (!currentLongest) {
        return item;
      }

      return getQueueWaitMinutes(item, nowMs) >
        getQueueWaitMinutes(currentLongest, nowMs)
        ? item
        : currentLongest;
    },
    null,
  );

  const roomSummaries = ROOM_ORDER.map((roomSlug) => {
    const roomItems = queueItems.filter((item) => item.room_slug === roomSlug);
    const enrichedItems = sortRoomQueueItems(
      combineQueueItemsWithAttendances(roomItems, attendances),
    );

    return {
      nextItem:
        enrichedItems.find((item) => item.status === "aguardando") ?? null,
      room: rooms.find((entry) => entry.slug === roomSlug),
      roomSlug,
      activeCount: roomItems.filter(
        (item) => item.status === "chamado" || item.status === "em_atendimento",
      ).length,
      canceledCount: roomItems.filter(
        (item) =>
          item.status === "cancelado" ||
          Boolean(attendances.find((attendance) => attendance.id === item.attendance_id)?.canceled_at),
      ).length,
      waitingCount: roomItems.filter((item) => item.status === "aguardando").length,
    };
  });

  const visibleAttendances = useMemo(() => {
    const filtered = groupedAttendances.filter((attendance) => {
      const overallStatus = attendanceStatusMap.get(attendance.id) ?? "aguardando";
      const matchesPriority =
        priorityFilter === "todas" || attendance.priority === priorityFilter;
      const matchesStatus =
        statusFilter === "todos" || overallStatus === statusFilter;
      const matchesExam =
        examFilter === "todos" ||
        attendance.queueItems.some((item) => item.exam_type === examFilter);
      const matchesRoom =
        roomFilter === "todas" ||
        attendance.queueItems.some((item) => item.room_slug === roomFilter);

      return matchesPriority && matchesStatus && matchesExam && matchesRoom;
    });

    return [...filtered].sort((left, right) => {
      const diff =
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime();

      return orderFilter === "asc" ? diff : diff * -1;
    });
  }, [
    attendanceStatusMap,
    examFilter,
    groupedAttendances,
    orderFilter,
    priorityFilter,
    roomFilter,
    statusFilter,
  ]);

  const attendantReport = useMemo(
    () =>
      profiles
        .filter((profile) => profile.role === "atendimento")
        .map((profile) => {
          const calledItems = queueItems.filter(
            (item) => item.called_by === profile.id && item.called_at,
          );
          const executedItems = queueItems.filter(
            (item) =>
              item.started_by === profile.id && item.started_at && item.finished_at,
          );
          const totalStageItems = queueItems.filter(
            (item) =>
              item.started_by === profile.id &&
              item.started_at &&
              (item.finished_at || item.canceled_at),
          );
          const canceledByAttendant = attendances.filter(
            (attendance) => attendance.canceled_by === profile.id,
          ).length;

          return {
            profile,
            avgCallMinutes: averageMinutes(
              calledItems.map((item) =>
                diffMinutes(item.called_at as string, item.created_at),
              ),
            ),
            avgExecutionMinutes: averageMinutes(
              executedItems.map((item) =>
                diffMinutes(item.finished_at as string, item.started_at as string),
              ),
            ),
            avgStageTotalMinutes: averageMinutes(
              totalStageItems.map((item) =>
                diffMinutes(
                  (item.finished_at ?? item.canceled_at) as string,
                  item.created_at,
                ),
              ),
            ),
            calledCount: calledItems.length,
            finishedCount: executedItems.length,
            canceledCount: canceledByAttendant,
          };
        })
        .sort((left, right) =>
          left.profile.full_name.localeCompare(right.profile.full_name, "pt-BR"),
        ),
    [attendances, profiles, queueItems],
  );

  const receptionReport = useMemo(
    () =>
      profiles
        .filter((profile) => profile.role === "recepcao")
        .map((profile) => ({
          profile,
          createdCount: attendances.filter(
            (attendance) => attendance.created_by === profile.id,
          ).length,
        }))
        .sort((left, right) => right.createdCount - left.createdCount),
    [attendances, profiles],
  );

  const roomReportItems = useMemo(() => {
    const filteredItems =
      reportRoomFilter === "todas"
        ? queueItems
        : queueItems.filter((item) => item.room_slug === reportRoomFilter);

    return sortRoomQueueItems(
      combineQueueItemsWithAttendances(filteredItems, attendances),
    );
  }, [attendances, queueItems, reportRoomFilter]);

  function updateRange(next: { date?: string; period?: QueuePeriod }) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("date", next.date ?? initialSelectedDate);
    params.set("period", next.period ?? initialPeriod);

    router.push(`${pathname}?${params.toString()}`);
  }

  function shiftPeriod(step: -1 | 1) {
    const nextDate =
      initialPeriod === "day"
        ? shiftClinicDate(initialSelectedDate, "day", step)
        : initialPeriod === "month"
          ? shiftClinicDate(initialSelectedDate, "month", step)
          : initialPeriod === "quarter"
            ? shiftClinicDate(initialSelectedDate, "month", step * 3)
            : shiftClinicDate(initialSelectedDate, "year", step);

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
              Use os filtros para revisar outro recorte do dia, mês, trimestre ou
              ano mantendo o timezone da clínica em America/Manaus.
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Cadastros"
          value={String(totalAttendances)}
          helper="Atendimentos criados no recorte."
          accent="teal"
        />
        <MetricCard
          label="Etapas"
          value={String(totalQueueItems)}
          helper="Itens de fila distribuídos nas salas."
          accent="slate"
        />
        <MetricCard
          label="Aguardando"
          value={String(waitingAttendances)}
          helper="Atendimentos sem etapa iniciada."
          accent="amber"
        />
        <MetricCard
          label="80+ esperando"
          value={String(topPriorityWaiting)}
          helper="Maior prioridade ainda na fila."
          accent="amber"
        />
        <MetricCard
          label="Cancelados"
          value={String(canceledAttendances)}
          helper="Atendimentos encerrados com motivo."
          accent="rose"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Resumo operacional
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                O que pede atenção agora
              </h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
              Espera média {formatMinuteLabel(averageWait)}
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <HighlightPill
              label="Em andamento"
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
            <HighlightPill
              label="Maior espera"
              value={
                longestWaitingItem
                  ? formatMinuteLabel(getQueueWaitMinutes(longestWaitingItem, nowMs))
                  : "--"
              }
              tone="amber"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <MetricCard
            label="Normal"
            value={String(
              attendances.filter((attendance) => attendance.priority === "normal").length,
            )}
            helper="Prioridade base."
          />
          <MetricCard
            label="60+ e outras"
            value={String(
              attendances.filter(
                (attendance) => attendance.priority === "sessenta_mais_outras",
              ).length,
            )}
            helper="Prioridade intermediária."
            accent="teal"
          />
          <MetricCard
            label="80+"
            value={String(
              attendances.filter(
                (attendance) => attendance.priority === "oitenta_mais",
              ).length,
            )}
            helper="Maior prioridade operacional."
            accent="amber"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {roomSummaries.map((roomSummary) => (
          <RoomSummaryCard
            key={roomSummary.roomSlug}
            room={roomSummary.room}
            roomSlug={roomSummary.roomSlug}
            nextItem={roomSummary.nextItem}
            waitingCount={roomSummary.waitingCount}
            activeCount={roomSummary.activeCount}
            canceledCount={roomSummary.canceledCount}
          />
        ))}
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
              {visibleAttendances.length} resultado
              {visibleAttendances.length === 1 ? "" : "s"} no filtro atual.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Prioridade"
              value={priorityFilter}
              onChange={(value) =>
                setPriorityFilter(value as AttendancePriority | "todas")
              }
              options={[
                { label: "Todas", value: "todas" },
                { label: PRIORITY_LABELS.oitenta_mais, value: "oitenta_mais" },
                {
                  label: PRIORITY_LABELS.sessenta_mais_outras,
                  value: "sessenta_mais_outras",
                },
                { label: PRIORITY_LABELS.normal, value: "normal" },
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
                { label: "Cancelado", value: "cancelado" },
              ]}
            />
            <FilterSelect
              label="Exame"
              value={examFilter}
              onChange={(value) => setExamFilter(value as ExamType | "todos")}
              options={[
                { label: "Todos", value: "todos" },
                ...rooms.map((room) => ({
                  label: EXAM_LABELS[room.exam_type],
                  value: room.exam_type,
                })),
              ]}
            />
            <FilterSelect
              label="Sala"
              value={roomFilter}
              onChange={(value) => setRoomFilter(value as RoomSlug | "todas")}
              options={[
                { label: "Todas", value: "todas" },
                ...rooms.map((room) => ({
                  label: room.name,
                  value: room.slug,
                })),
              ]}
            />
            <FilterSelect
              label="Ordem"
              value={orderFilter}
              onChange={(value) => setOrderFilter(value as OrderFilter)}
              options={[
                { label: "Mais recentes", value: "desc" },
                { label: "Mais antigos", value: "asc" },
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
                nowMs={nowMs}
                profileMap={profileMap}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="Sem movimentação neste recorte"
              description="Ajuste os filtros acima para revisar outro conjunto de atendimentos."
            />
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Relatório
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                Atendimento por operador
              </h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
              {attendantReport.length} atendente{attendantReport.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-6 space-y-3">
            {attendantReport.map((entry) => (
              <div
                key={entry.profile.id}
                className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4"
              >
                <p className="text-lg font-semibold text-slate-950">
                  {entry.profile.full_name}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SmallReportCard
                    label="Tempo para chamar"
                    value={formatMinuteLabel(entry.avgCallMinutes)}
                  />
                  <SmallReportCard
                    label="Tempo em exame"
                    value={formatMinuteLabel(entry.avgExecutionMinutes)}
                  />
                  <SmallReportCard
                    label="Tempo total da etapa"
                    value={formatMinuteLabel(entry.avgStageTotalMinutes)}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {entry.calledCount} chamada{entry.calledCount === 1 ? "" : "s"} ·{" "}
                  {entry.finishedCount} etapa
                  {entry.finishedCount === 1 ? "" : "s"} concluída
                  {entry.finishedCount === 1 ? "" : "s"} ·{" "}
                  {entry.canceledCount} cancelamento
                  {entry.canceledCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Relatório
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
            Cadastros da recepção
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Quantidade de atendimentos criados por usuário no recorte atual.
          </p>
          <div className="mt-6 space-y-3">
            {receptionReport.map((entry) => (
              <div
                key={entry.profile.id}
                className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4"
              >
                <div>
                  <p className="text-lg font-semibold text-slate-950">
                    {entry.profile.full_name}
                  </p>
                  <p className="text-sm text-slate-600">Usuário da recepção</p>
                </div>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-800">
                  {entry.createdCount} cadastro{entry.createdCount === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Relatório
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                Sala e data
              </h3>
            </div>
            <FilterSelect
              label="Sala"
              value={reportRoomFilter}
              onChange={(value) => setReportRoomFilter(value as RoomSlug | "todas")}
              options={[
                { label: "Todas", value: "todas" },
                ...rooms.map((room) => ({
                  label: room.name,
                  value: room.slug,
                })),
              ]}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Recorte atual: {periodLabel}
          </p>

          {roomReportItems.length ? (
            <div className="mt-6 space-y-3">
              {roomReportItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-950">
                      {item.attendance?.patient_name ?? item.patient_name}
                    </p>
                    {item.attendance ? (
                      <PriorityBadge priority={item.attendance.priority} />
                    ) : null}
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {EXAM_LABELS[item.exam_type]} · {ROOM_BY_SLUG[item.room_slug as RoomSlug]?.roomName ?? item.room_slug} · qtd.{" "}
                    {item.requested_quantity}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Entrada {formatDateTime(item.created_at)}
                  </p>
                  {item.attendance?.cancellation_reason ? (
                    <p className="mt-2 text-sm text-rose-700">
                      Motivo: {item.attendance.cancellation_reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                title="Nenhum registro nesta sala"
                description="Ajuste o filtro de sala ou o recorte de data para revisar outro conjunto."
              />
            </div>
          )}
        </div>
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

function HighlightPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "rose" | "slate" | "teal";
  value: string;
}) {
  const styles = {
    amber:
      "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 text-amber-950",
    rose:
      "border-rose-300 bg-gradient-to-br from-rose-100 via-rose-50 to-pink-100 text-rose-950",
    slate:
      "border-slate-300 bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-950",
    teal:
      "border-cyan-300 bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-100 text-cyan-950",
  } as const;

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${styles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function RoomSummaryCard({
  activeCount,
  canceledCount,
  nextItem,
  room,
  roomSlug,
  waitingCount,
}: {
  activeCount: number;
  canceledCount: number;
  nextItem: ReturnType<typeof combineQueueItemsWithAttendances>[number] | null;
  room: ExamRoomRecord | undefined;
  roomSlug: RoomSlug;
  waitingCount: number;
}) {
  return (
    <div className="app-panel rounded-[30px] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Sala
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {room?.name ?? roomSlug}
      </h3>
      <div className="mt-5 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
        <SmallReportCard
          label="Fila"
          value={String(waitingCount)}
          tone="amber"
        />
        <SmallReportCard
          label="Ativos"
          value={String(activeCount)}
          tone="teal"
        />
        <SmallReportCard
          label="Cancelados"
          value={String(canceledCount)}
          tone="rose"
        />
      </div>
      <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Próximo da fila
        </p>
        {nextItem?.attendance ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-950">
                {nextItem.attendance.patient_name}
              </p>
              <PriorityBadge priority={nextItem.attendance.priority} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={nextItem.status} />
              <span className="text-sm text-slate-600">
                Entrada {formatDateTime(nextItem.attendance.created_at)}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Sem paciente pendente.</p>
        )}
      </div>
    </div>
  );
}

function AttendanceAdminRow({
  attendance,
  nowMs,
  profileMap,
}: {
  attendance: AttendanceWithQueueItems;
  nowMs: number;
  profileMap: Map<string, ProfileRecord>;
}) {
  const overallStatus = getAttendanceOverallStatus(attendance, attendance.queueItems);
  const stepLabels = sortAttendanceQueueItemsByFlow(attendance.queueItems)
    .map((item) => {
      const roomLabel =
        ROOM_BY_SLUG[item.room_slug as RoomSlug]?.shortName ?? item.room_slug;

      return item.requested_quantity > 1
        ? `${roomLabel} x${item.requested_quantity}`
        : roomLabel;
    })
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
  const createdByName = attendance.created_by
    ? profileMap.get(attendance.created_by)?.full_name ?? "Sem identificação"
    : "Sem identificação";
  const rowTone =
    overallStatus === "aguardando"
      ? "border-amber-300 bg-amber-50/40"
      : overallStatus === "cancelado"
        ? "border-rose-200 bg-rose-50/40"
        : "border-slate-200 bg-white/85";

  return (
    <div className={`rounded-[24px] border px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)] ${rowTone}`}>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-slate-950">
              {attendance.patient_name}
            </p>
            <PriorityBadge priority={attendance.priority} />
            <AttendanceStatusBadge status={overallStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {attendance.notes || "Sem observação"}
          </p>
          <p className="mt-2 text-sm text-slate-600">Cadastro por {createdByName}</p>
          {attendance.cancellation_reason ? (
            <p className="mt-2 text-sm font-medium text-rose-700">
              Motivo do cancelamento: {attendance.cancellation_reason}
            </p>
          ) : null}
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
          {attendance.canceled_at ? (
            <p className="mt-1 text-sm text-slate-600">
              Cancelado em {formatDateTime(attendance.canceled_at)}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Resumo
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {stepLabels} · {completedSteps} de {attendance.queueItems.length} concluídas
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Fila aberta
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {waitingItems.length
              ? `${waitingItems.length} etapa${waitingItems.length === 1 ? "" : "s"} aguardando`
              : "Sem espera aberta"}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Maior espera {longestWait === null ? "--" : formatMinuteLabel(longestWait)}
          </p>
        </div>
      </div>
      <details className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/60 px-4 py-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
          Ver fluxo e tempos por exame
        </summary>
        <div className="mt-4 space-y-4">
          <AttendanceTimeline items={attendance.queueItems} title="Fluxo entre salas" />
          {sortAttendanceQueueItemsByFlow(attendance.queueItems).map((item) => (
            <StageTimingRow
              key={item.id}
              item={item}
              nowMs={nowMs}
              profileMap={profileMap}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function StageTimingRow({
  item,
  nowMs,
  profileMap,
}: {
  item: QueueItemRecord;
  nowMs: number;
  profileMap: Map<string, ProfileRecord>;
}) {
  const waitMinutes = getQueueStageWaitMinutes(item, nowMs);
  const executionMinutes = getQueueStageExecutionMinutes(item, nowMs);
  const totalMinutes = getQueueStageTotalMinutes(item, nowMs);
  const roomLabel =
    ROOM_BY_SLUG[item.room_slug as RoomSlug]?.roomName ?? item.room_slug;
  const actorSummary = [
    item.called_by ? `Chamado por ${profileMap.get(item.called_by)?.full_name ?? "desconhecido"}` : null,
    item.started_by
      ? `Iniciado por ${profileMap.get(item.started_by)?.full_name ?? "desconhecido"}`
      : null,
    item.finished_by
      ? `Finalizado por ${profileMap.get(item.finished_by)?.full_name ?? "desconhecido"}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">
              {roomLabel}
            </p>
            <StatusBadge status={item.status} />
            {item.requested_quantity > 1 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                qtd. {item.requested_quantity}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {EXAM_LABELS[item.exam_type]}
          </p>
          {actorSummary ? (
            <p className="mt-2 text-sm text-slate-600">{actorSummary}</p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SmallReportCard
            label="Espera"
            value={formatMinuteLabel(waitMinutes)}
          />
          <SmallReportCard
            label="Execução"
            value={executionMinutes === null ? "--" : formatMinuteLabel(executionMinutes)}
          />
          <SmallReportCard
            label="Total"
            value={formatMinuteLabel(totalMinutes)}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        <TimeStampField label="Entrada" value={item.created_at} />
        <TimeStampField label="Chamado" value={item.called_at} />
        <TimeStampField label="Início" value={item.started_at} />
        <TimeStampField label="Fim" value={item.finished_at} />
        <TimeStampField label="Cancelado" value={item.canceled_at} />
      </div>
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status: AttendanceOverallStatus }) {
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

function SmallReportCard({
  label,
  tone = "slate",
  value,
}: {
  label: string;
  tone?: "amber" | "rose" | "slate" | "teal";
  value: string;
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    teal: "border-cyan-200 bg-cyan-50 text-cyan-950",
  } as const;

  const labelStyles = {
    amber: "text-amber-700",
    rose: "text-rose-700",
    slate: "text-slate-500",
    teal: "text-cyan-700",
  } as const;

  return (
    <div className={`min-w-0 rounded-[18px] border px-3 py-3 ${styles[tone]}`}>
      <p
        className={`min-w-0 whitespace-normal break-words text-[10px] font-semibold uppercase tracking-[0.08em] leading-4 ${labelStyles[tone]}`}
      >
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-none">{value}</p>
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

function averageMinutes(values: number[]) {
  if (!values.length) {
    return null;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function diffMinutes(end: string, start: string) {
  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
  );
}

function getPeriodLabel(period: QueuePeriod, selectedDate: string) {
  const referenceDate = `${selectedDate}T12:00:00.000Z`;

  if (period === "day") {
    return formatDate(referenceDate);
  }

  if (period === "month") {
    return capitalize(formatMonthYear(referenceDate));
  }

  if (period === "quarter") {
    return `${getClinicQuarter(referenceDate)}º trimestre de ${getClinicYear(referenceDate)}`;
  }

  return String(getClinicYear(referenceDate));
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
