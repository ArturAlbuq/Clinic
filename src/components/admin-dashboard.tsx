"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AttendanceTimeline } from "@/components/attendance-timeline";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { StatusBadge } from "@/components/status-badge";
import {
  buildAttendantReport,
  buildReceptionReport,
  buildRoomReportItems,
  buildRoomSummaries,
  getAdminPeriodLabel,
  groupRoomReportItemsByExam,
} from "@/lib/admin-report";
import {
  ATTENDANCE_STATUS_LABELS,
  EXAM_LABELS,
  EXAM_ORDER,
  PRIORITY_LABELS,
  ROOM_BY_SLUG,
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
  formatDateInputValue,
  formatDateTime,
  formatMinuteLabel,
  shiftClinicDate,
} from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  getAttendanceOverallStatus,
  getAverageWaitMinutes,
  getQueueWaitMinutes,
  groupAttendancesWithQueueItems,
  sortAttendanceQueueItemsByFlow,
  sortAttendancesByPriorityAndCreatedAt,
  type QueueDateRange,
  type QueuePeriod,
} from "@/lib/queue";

type Props = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  initialPeriod: QueuePeriod;
  initialSelectedDate: string;
  profiles: ProfileRecord[];
  range: QueueDateRange;
  rooms: ExamRoomRecord[];
};

type OrderFilter = "asc" | "desc";
type AdminTab = "operacao" | "relatorios";
type PageSize = 5 | 10 | 15;
type Option = readonly [label: string, value: string];

export function AdminDashboard({
  initialAttendances,
  initialItems,
  initialPeriod,
  initialSelectedDate,
  profiles,
  range,
  rooms,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [priorityFilter, setPriorityFilter] = useState<AttendancePriority | "todas">("todas");
  const [statusFilter, setStatusFilter] = useState<AttendanceOverallStatus | "todos">("todos");
  const [examFilter, setExamFilter] = useState<ExamType | "todos">("todos");
  const [roomFilter, setRoomFilter] = useState<RoomSlug | "todas">("todas");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("desc");
  const [activeTab, setActiveTab] = useState<AdminTab>("operacao");
  const [pageSize, setPageSize] = useState<PageSize>(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [reportRoomFilter, setReportRoomFilter] = useState<RoomSlug | "todas">("todas");

  const { attendances, queueItems, realtimeError, realtimeStatus } = useRealtimeClinicData({
    initialAttendances,
    initialQueueItems: initialItems,
    range,
  });

  const periodLabel = getAdminPeriodLabel(initialPeriod, initialSelectedDate);
  const groupedAttendances = useMemo(
    () => sortAttendancesByPriorityAndCreatedAt(groupAttendancesWithQueueItems(attendances, queueItems)),
    [attendances, queueItems],
  );
  const roomSummaries = useMemo(
    () => buildRoomSummaries({ attendances, queueItems, rooms }),
    [attendances, queueItems, rooms],
  );
  const attendantReport = useMemo(
    () => buildAttendantReport({ attendances, profiles, queueItems }),
    [attendances, profiles, queueItems],
  );
  const receptionReport = useMemo(
    () => buildReceptionReport({ attendances, profiles }),
    [attendances, profiles],
  );
  const roomReportItems = useMemo(
    () => buildRoomReportItems({ attendances, queueItems, roomFilter: reportRoomFilter }),
    [attendances, queueItems, reportRoomFilter],
  );
  const examReportItems = useMemo(
    () => groupRoomReportItemsByExam(roomReportItems, reportRoomFilter),
    [reportRoomFilter, roomReportItems],
  );

  const visibleAttendances = useMemo(() => {
    const filtered = groupedAttendances.filter((attendance) => {
      const overallStatus = getAttendanceOverallStatus(attendance, attendance.queueItems);
      return (
        (priorityFilter === "todas" || attendance.priority === priorityFilter) &&
        (statusFilter === "todos" || overallStatus === statusFilter) &&
        (examFilter === "todos" || attendance.queueItems.some((item) => item.exam_type === examFilter)) &&
        (roomFilter === "todas" || attendance.queueItems.some((item) => item.room_slug === roomFilter))
      );
    });

    return filtered.sort((left, right) => {
      const diff = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      return orderFilter === "asc" ? diff : diff * -1;
    });
  }, [examFilter, groupedAttendances, orderFilter, priorityFilter, roomFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleAttendances.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedAttendances = visibleAttendances.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );

  const waitingAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance, attendance.queueItems) === "aguardando",
  ).length;
  const activeAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance, attendance.queueItems) === "em_andamento",
  ).length;
  const finishedAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance, attendance.queueItems) === "finalizado",
  ).length;
  const canceledAttendances = groupedAttendances.filter(
    (attendance) => getAttendanceOverallStatus(attendance, attendance.queueItems) === "cancelado",
  ).length;
  const topPriorityWaiting = groupedAttendances.filter(
    (attendance) =>
      attendance.priority === "oitenta_mais" &&
      getAttendanceOverallStatus(attendance, attendance.queueItems) === "aguardando",
  ).length;
  const longestWaitingItem =
    queueItems
      .filter((item) => item.status === "aguardando")
      .sort((a, b) => getQueueWaitMinutes(b) - getQueueWaitMinutes(a))[0] ?? null;

  const reportPdfUrl = `/api/clinic/reports/pdf?${new URLSearchParams({
    date: initialSelectedDate,
    period: initialPeriod,
    ...(reportRoomFilter !== "todas" ? { roomSlug: reportRoomFilter } : {}),
  }).toString()}`;

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

  const periodOptions = [
    ["Dia", "day"],
    ["Mes", "month"],
    ["Trimestre", "quarter"],
    ["Ano", "year"],
  ] as const satisfies readonly Option[];
  const priorityOptions = [
    ["Todas", "todas"],
    [PRIORITY_LABELS.oitenta_mais, "oitenta_mais"],
    [PRIORITY_LABELS.sessenta_mais_outras, "sessenta_mais_outras"],
    [PRIORITY_LABELS.normal, "normal"],
  ] as const satisfies readonly Option[];
  const statusOptions = [
    ["Todas", "todos"],
    ["Aguardando", "aguardando"],
    ["Em andamento", "em_andamento"],
    ["Finalizado", "finalizado"],
    ["Cancelado", "cancelado"],
  ] as const satisfies readonly Option[];
  const examOptions = [
    ["Todos", "todos"],
    ...EXAM_ORDER.map((value) => [EXAM_LABELS[value], value] as const),
  ] as const;
  const roomOptions = [
    ["Todas", "todas"],
    ...rooms.map((room) => [room.name, room.slug] as const),
  ] as const;
  const orderOptions = [
    ["Mais recentes", "desc"],
    ["Mais antigos", "asc"],
  ] as const satisfies readonly Option[];
  const pageSizeOptions = [
    ["5", "5"],
    ["10", "10"],
    ["15", "15"],
  ] as const satisfies readonly Option[];

  return (
    <div className="space-y-6">
      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Periodo de analise
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {periodLabel}
            </h2>
          </div>
          <div className="space-y-3">
            <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
            <div className="flex flex-wrap gap-2">
              <SelectField label="Periodo" value={initialPeriod} onChange={(value) => updateRange({ period: value as QueuePeriod })} options={periodOptions} />
              <label className="flex min-w-[170px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Data-base</span>
                <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="date" value={initialSelectedDate} onChange={(event) => updateRange({ date: event.target.value })} />
              </label>
              <div className="flex items-stretch gap-2">
                <NavButton label="Anterior" onClick={() => shiftPeriod(-1)} />
                <NavButton label="Hoje" onClick={() => updateRange({ date: formatDateInputValue(new Date()), period: initialPeriod })} />
                <NavButton label="Proximo" onClick={() => shiftPeriod(1)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Cadastros" value={String(attendances.length)} helper="Atendimentos criados no recorte." accent="teal" />
        <MetricCard label="Etapas" value={String(queueItems.length)} helper="Itens distribuidos nas salas." accent="slate" />
        <MetricCard label="Aguardando" value={String(waitingAttendances)} helper="Atendimentos sem etapa iniciada." accent="amber" />
        <MetricCard label="80+ esperando" value={String(topPriorityWaiting)} helper="Maior prioridade ainda na fila." accent="amber" />
        <MetricCard label="Cancelados" value={String(canceledAttendances)} helper="Atendimentos encerrados com motivo." accent="rose" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Resumo operacional</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">O que pede atencao agora</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
              Espera media {formatMinuteLabel(getAverageWaitMinutes(queueItems.filter((item) => item.status !== "cancelado")))}
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Pill label="Em andamento" value={`${activeAttendances} atendimento${activeAttendances === 1 ? "" : "s"}`} tone="teal" />
            <Pill label="Aguardando" value={`${waitingAttendances} paciente${waitingAttendances === 1 ? "" : "s"}`} tone="amber" />
            <Pill label="Finalizados" value={`${finishedAttendances} concluido${finishedAttendances === 1 ? "" : "s"}`} tone="slate" />
            <Pill label="Maior espera" value={longestWaitingItem ? formatMinuteLabel(getQueueWaitMinutes(longestWaitingItem)) : "--"} tone="amber" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <MetricCard label="Normal" value={String(attendances.filter((a) => a.priority === "normal").length)} helper="Prioridade base." />
          <MetricCard label="60+ e outras" value={String(attendances.filter((a) => a.priority === "sessenta_mais_outras").length)} helper="Prioridade intermediaria." accent="teal" />
          <MetricCard label="80+" value={String(attendances.filter((a) => a.priority === "oitenta_mais").length)} helper="Maior prioridade operacional." accent="amber" />
        </div>
      </section>

      <section className="app-panel rounded-[30px] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Navegacao</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Operacao e relatorios</h3>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <TabButton active={activeTab === "operacao"} label="Operacao" onClick={() => setActiveTab("operacao")} />
            <TabButton active={activeTab === "relatorios"} label="Relatorios" onClick={() => setActiveTab("relatorios")} />
          </div>
        </div>
      </section>

      {activeTab === "operacao" ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {roomSummaries.map((summary) => <RoomCard key={summary.roomSlug} summary={summary} />)}
          </section>
          <section className="app-panel rounded-[30px] px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Lista operacional</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">Atendimentos do periodo</h3>
                <p className="mt-2 text-sm text-slate-600">{visibleAttendances.length} resultado{visibleAttendances.length === 1 ? "" : "s"} no filtro atual.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SelectField label="Prioridade" value={priorityFilter} onChange={(value) => { setPriorityFilter(value as AttendancePriority | "todas"); setCurrentPage(1); }} options={priorityOptions} />
                <SelectField label="Situacao" value={statusFilter} onChange={(value) => { setStatusFilter(value as AttendanceOverallStatus | "todos"); setCurrentPage(1); }} options={statusOptions} />
                <SelectField label="Exame" value={examFilter} onChange={(value) => { setExamFilter(value as ExamType | "todos"); setCurrentPage(1); }} options={examOptions} />
                <SelectField label="Sala" value={roomFilter} onChange={(value) => { setRoomFilter(value as RoomSlug | "todas"); setCurrentPage(1); }} options={roomOptions} />
                <SelectField label="Ordem" value={orderFilter} onChange={(value) => { setOrderFilter(value as OrderFilter); setCurrentPage(1); }} options={orderOptions} />
                <SelectField label="Por pagina" value={String(pageSize)} onChange={(value) => { setPageSize(Number(value) as PageSize); setCurrentPage(1); }} options={pageSizeOptions} />
              </div>
            </div>
            {visibleAttendances.length ? (
              <>
                <div className="mt-6 space-y-3">{paginatedAttendances.map((attendance) => <AttendanceRow key={attendance.id} attendance={attendance} />)}</div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-sm text-slate-600">Pagina {safeCurrentPage} de {totalPages}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <NavButton label="Anterior" onClick={() => setCurrentPage((current) => Math.max(1, current - 1))} />
                    <NavButton label="Proximo" onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))} />
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-6"><EmptyState title="Sem movimentacao neste recorte" description="Ajuste os filtros acima para revisar outro conjunto de atendimentos." /></div>
            )}
          </section>
        </>
      ) : (
        <section className="space-y-4">
          <section className="app-panel rounded-[30px] px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatorios</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">Indicadores do periodo</h3>
                <p className="mt-2 text-sm text-slate-600">Recorte atual: {periodLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SelectField label="Sala" value={reportRoomFilter} onChange={(value) => setReportRoomFilter(value as RoomSlug | "todas")} options={roomOptions} />
                <a href={reportPdfUrl} target="_blank" rel="noreferrer" className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50">Baixar PDF</a>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="app-panel rounded-[30px] px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Atendimento por operador</p>
              <div className="mt-6 space-y-3">
                {attendantReport.map((entry) => (
                  <div key={entry.profile.id} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-lg font-semibold text-slate-950">{entry.profile.full_name}</p>
                    <p className="mt-2 text-sm text-slate-600">{entry.calledCount} chamada(s) · {entry.finishedCount} etapa(s) concluida(s)</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="app-panel rounded-[30px] px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Exames realizados</p>
              <div className="mt-6 space-y-3">
                {examReportItems.length ? examReportItems.map((entry) => (
                  <div key={entry.examType} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">{EXAM_LABELS[entry.examType]}</p>
                        <p className="text-sm text-slate-600">{ROOM_BY_SLUG[entry.roomSlug].roomName}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Info label="Itens" value={String(entry.totalItems)} />
                        <Info label="Qtd." value={String(entry.totalQuantity)} />
                        <Info label="Finalizados" value={String(entry.finishedCount)} />
                      </div>
                    </div>
                  </div>
                )) : <EmptyState title="Nenhum exame neste recorte" description="Ajuste a sala ou o periodo para revisar outro conjunto." />}
              </div>
            </div>
            <div className="space-y-4">
              <div className="app-panel rounded-[30px] px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cadastros da recepcao</p>
                <div className="mt-6 space-y-3">
                  {receptionReport.map((entry) => (
                    <div key={entry.profile.id} className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                      <p className="text-lg font-semibold text-slate-950">{entry.profile.full_name}</p>
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-800">{entry.createdCount} cadastro(s)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="app-panel rounded-[30px] px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sala e data</p>
                {roomReportItems.length ? (
                  <div className="mt-6 space-y-3">
                    {roomReportItems.map((item) => (
                      <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-slate-950">{item.attendance?.patient_name ?? item.patient_name}</p>
                          {item.attendance ? <PriorityBadge priority={item.attendance.priority} /> : null}
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{EXAM_LABELS[item.exam_type]} · {ROOM_BY_SLUG[item.room_slug as RoomSlug]?.roomName ?? item.room_slug} · qtd. {item.requested_quantity}</p>
                        <p className="mt-2 text-sm text-slate-600">Entrada {formatDateTime(item.created_at)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6"><EmptyState title="Nenhum registro nesta sala" description="Ajuste o filtro de sala ou o recorte de data para revisar outro conjunto." /></div>
                )}
              </div>
            </div>
          </section>
        </section>
      )}
    </div>
  );
}

function AttendanceRow({ attendance }: { attendance: AttendanceWithQueueItems }) {
  const overallStatus = getAttendanceOverallStatus(attendance, attendance.queueItems);
  const stepSummary = sortAttendanceQueueItemsByFlow(attendance.queueItems)
    .map((item) => EXAM_LABELS[item.exam_type])
    .join(" + ");

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold text-slate-950">{attendance.patient_name}</p>
        <PriorityBadge priority={attendance.priority} />
        <StatusPill status={overallStatus} />
      </div>
      <p className="mt-2 text-sm text-slate-600">{stepSummary || "Sem etapa"}</p>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <AttendanceTimeline items={attendance.queueItems} title="Fluxo entre salas" />
      </div>
    </div>
  );
}

function RoomCard({ summary }: { summary: ReturnType<typeof buildRoomSummaries>[number] }) {
  const cardClassName = summary.hasNewWaiting
    ? "rounded-[30px] border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-white px-5 py-5 shadow-[0_24px_56px_rgba(245,158,11,0.14)]"
    : "app-panel rounded-[30px] px-5 py-5";

  return (
    <div className={cardClassName}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${summary.hasNewWaiting ? "text-amber-700" : "text-slate-500"}`}>Sala</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{summary.room?.name ?? summary.roomSlug}</h3>
        </div>
        {summary.hasNewWaiting ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Novo aguardando
          </span>
        ) : null}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Info
          className={
            summary.hasNewWaiting
              ? "border-amber-200 bg-white/85"
              : "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 text-amber-950"
          }
          labelClassName="text-[9px] tracking-[0.04em] leading-4 text-left"
          label="Fila"
          value={String(summary.waitingCount)}
        />
        <Info
          className={
            summary.hasNewWaiting
              ? "border-amber-200 bg-white/85"
              : "border-cyan-300 bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-100 text-cyan-950"
          }
          labelClassName="text-[9px] tracking-[0.04em] leading-4 text-left"
          label="Ativos"
          value={String(summary.activeCount)}
        />
        <Info
          className={
            summary.hasNewWaiting
              ? "border-amber-200 bg-white/85"
              : "border-slate-300 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-50 text-slate-950"
          }
          labelClassName="text-[8px] tracking-normal leading-3 text-left whitespace-normal break-words"
          label="Finalizados"
          value={String(summary.finishedCount)}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-300 bg-amber-100 text-amber-950",
    em_andamento: "border-sky-200 bg-sky-50 text-sky-800",
    finalizado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}>
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  value: string;
}) {
  return (
    <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select className="bg-transparent text-sm font-medium text-slate-900 outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50" type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={active ? "rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white" : "rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"}>
      {label}
    </button>
  );
}

function Pill({ label, tone, value }: { label: string; tone: "amber" | "rose" | "slate" | "teal"; value: string }) {
  const styles = {
    amber: "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 text-amber-950",
    rose: "border-rose-300 bg-gradient-to-br from-rose-100 via-rose-50 to-pink-100 text-rose-950",
    slate: "border-slate-300 bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-950",
    teal: "border-cyan-300 bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-100 text-cyan-950",
  } as const;

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${styles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Info({
  className = "",
  label,
  labelClassName = "",
  value,
}: {
  className?: string;
  label: string;
  labelClassName?: string;
  value: string;
}) {
  return (
    <div className={`rounded-[18px] border px-3 py-3 ${className || "border-slate-200 bg-slate-50"}`}>
      <p className={`min-h-8 overflow-hidden text-[10px] font-semibold uppercase tracking-[0.08em] leading-4 ${labelClassName}`}>{label}</p>
      <p className="mt-2 text-sm font-semibold leading-none">{value}</p>
    </div>
  );
}
