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
  ROOM_EXAM_TYPES,
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
  formatClock,
  formatDateInputValue,
  formatDateTime,
  formatMinuteLabel,
  shiftClinicDate,
} from "@/lib/date";
import { readJsonResponse } from "@/lib/fetch-json";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  getAttendanceOverallStatus,
  getAttendanceTotalMinutes,
  getAverageWaitMinutes,
  getQueueStageExecutionMinutes,
  getQueueStageTotalMinutes,
  getQueueStageWaitMinutes,
  getQueueWaitMinutes,
  groupAttendancesWithQueueItems,
  isQueueItemReturnPending,
  sortAttendanceQueueItemsByFlow,
  sortAttendancesByPriorityAndCreatedAt,
  type QueueDateRange,
  type QueuePeriod,
} from "@/lib/queue";

type Props = {
  initialAttendances: AttendanceRecord[];
  initialDeletedAttendances: AttendanceWithQueueItems[];
  initialItems: QueueItemRecord[];
  initialPeriod: QueuePeriod;
  initialSelectedDate: string;
  profiles: ProfileRecord[];
  range: QueueDateRange;
  rooms: ExamRoomRecord[];
};

type OrderFilter = "asc" | "desc";
type AdminTab = "operacao" | "busca" | "relatorios" | "exclusoes";
type PageSize = 5 | 10 | 15;
type Option = readonly [label: string, value: string];

export function AdminDashboard({
  initialAttendances,
  initialDeletedAttendances,
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
  const [deletedAttendances, setDeletedAttendances] = useState(initialDeletedAttendances);
  const [deletedPatientSearchName, setDeletedPatientSearchName] = useState("");
  const [deletedPatientRegistration, setDeletedPatientRegistration] = useState("");
  const [deletedAdminFilter, setDeletedAdminFilter] = useState("todos");
  const [reportRoomFilter, setReportRoomFilter] = useState<RoomSlug | "todas">("todas");
  const [reportPatientSearch, setReportPatientSearch] = useState("");
  const [patientSearchName, setPatientSearchName] = useState("");
  const [patientSearchRegistration, setPatientSearchRegistration] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNowMs(Date.now()));
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setDeletedAttendances(initialDeletedAttendances);
  }, [initialDeletedAttendances]);

  const periodLabel = getAdminPeriodLabel(initialPeriod, initialSelectedDate);
  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const reportAttendances = useMemo(
    () =>
      attendances.filter((attendance) => {
        const createdAtMs = new Date(attendance.created_at).getTime();
        return (
          createdAtMs >= new Date(range.startIso).getTime() &&
          createdAtMs < new Date(range.endIso).getTime()
        );
      }),
    [attendances, range.endIso, range.startIso],
  );
  const reportQueueItems = useMemo(
    () =>
      queueItems.filter((item) => {
        const createdAtMs = new Date(item.created_at).getTime();
        return (
          createdAtMs >= new Date(range.startIso).getTime() &&
          createdAtMs < new Date(range.endIso).getTime()
        );
      }),
    [queueItems, range.endIso, range.startIso],
  );
  const groupedAttendances = useMemo(
    () => sortAttendancesByPriorityAndCreatedAt(groupAttendancesWithQueueItems(attendances, queueItems)),
    [attendances, queueItems],
  );
  const roomSummaries = useMemo(
    () => buildRoomSummaries({ attendances, queueItems, rooms }),
    [attendances, queueItems, rooms],
  );
  const attendantReport = useMemo(
    () => buildAttendantReport({ attendances: reportAttendances, profiles, queueItems: reportQueueItems }),
    [profiles, reportAttendances, reportQueueItems],
  );
  const receptionReport = useMemo(
    () => buildReceptionReport({ attendances: reportAttendances, profiles }),
    [profiles, reportAttendances],
  );
  const roomReportItems = useMemo(
    () => buildRoomReportItems({ attendances: reportAttendances, queueItems: reportQueueItems, roomFilter: reportRoomFilter }),
    [reportAttendances, reportQueueItems, reportRoomFilter],
  );
  const filteredRoomReportItems = useMemo(() => {
    const normalizedSearch = reportPatientSearch.trim().toLocaleLowerCase("pt-BR");

    if (!normalizedSearch) {
      return roomReportItems;
    }

    return roomReportItems.filter((item) =>
      (item.attendance?.patient_name ?? item.patient_name ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedSearch),
    );
  }, [reportPatientSearch, roomReportItems]);
  const examReportItems = useMemo(
    () => groupRoomReportItemsByExam(filteredRoomReportItems, reportRoomFilter),
    [filteredRoomReportItems, reportRoomFilter],
  );
  const searchAttendances = useMemo(() => {
    const normalizedName = patientSearchName.trim().toLocaleLowerCase("pt-BR");
    const normalizedRegistration =
      patientSearchRegistration.trim().toLocaleLowerCase("pt-BR");

    return groupAttendancesWithQueueItems(reportAttendances, reportQueueItems)
      .filter((attendance) => {
        const matchesName =
          !normalizedName ||
          attendance.patient_name
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedName);
        const registration =
          attendance.patient_registration_number?.toLocaleLowerCase("pt-BR") ?? "";
        const matchesRegistration =
          !normalizedRegistration || registration.includes(normalizedRegistration);

        return matchesName && matchesRegistration;
      })
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      );
  }, [
    patientSearchName,
    patientSearchRegistration,
    reportAttendances,
    reportQueueItems,
  ]);
  const deletedAdminOptions = useMemo(() => {
    const uniqueAdmins = Array.from(
      new Set(
        deletedAttendances
          .map((attendance) => attendance.deleted_by)
          .filter((value): value is string => Boolean(value)),
      ),
    )
      .sort((left, right) =>
        (profileMap.get(left)?.full_name ?? "Sem identificacao").localeCompare(
          profileMap.get(right)?.full_name ?? "Sem identificacao",
          "pt-BR",
        ),
      )
      .map(
        (profileId) =>
          [
            profileMap.get(profileId)?.full_name ?? "Sem identificacao",
            profileId,
          ] as const,
      );

    return [["Todos", "todos"] as const, ...uniqueAdmins];
  }, [deletedAttendances, profileMap]);
  const filteredDeletedAttendances = useMemo(() => {
    const normalizedName = deletedPatientSearchName.trim().toLocaleLowerCase("pt-BR");
    const normalizedRegistration =
      deletedPatientRegistration.trim().toLocaleLowerCase("pt-BR");

    return [...deletedAttendances]
      .filter((attendance) => {
        const matchesName =
          !normalizedName ||
          attendance.patient_name
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedName);
        const registration =
          attendance.patient_registration_number?.toLocaleLowerCase("pt-BR") ?? "";
        const matchesRegistration =
          !normalizedRegistration || registration.includes(normalizedRegistration);
        const matchesAdmin =
          deletedAdminFilter === "todos" || attendance.deleted_by === deletedAdminFilter;

        return matchesName && matchesRegistration && matchesAdmin;
      })
      .sort(
        (left, right) =>
          new Date(right.deleted_at ?? right.created_at).getTime() -
          new Date(left.deleted_at ?? left.created_at).getTime(),
      );
  }, [
    deletedAdminFilter,
    deletedAttendances,
    deletedPatientRegistration,
    deletedPatientSearchName,
  ]);

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
  const canceledStages = queueItems.filter((item) => item.status === "cancelado").length;
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
    ...(reportPatientSearch.trim() ? { patientName: reportPatientSearch.trim() } : {}),
    ...(reportRoomFilter !== "todas" ? { roomSlug: reportRoomFilter } : {}),
  }).toString()}`;

  function updateRange(next: { date?: string; period?: QueuePeriod }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", next.date ?? initialSelectedDate);
    params.set("period", next.period ?? initialPeriod);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleAttendanceSaved(
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) {
    setAttendances((currentAttendances) =>
      currentAttendances.map((attendance) =>
        attendance.id === updatedAttendance.id ? updatedAttendance : attendance,
      ),
    );
    setQueueItems((currentQueueItems) => {
      const nextItems = currentQueueItems.filter(
        (queueItem) => queueItem.attendance_id !== updatedAttendance.id,
      );
      return [...nextItems, ...updatedQueueItems].sort(
        (left, right) =>
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime(),
      );
    });
  }

  function handleAttendanceDeleted(deletedAttendance: AttendanceWithQueueItems) {
    setAttendances((currentAttendances) =>
      currentAttendances.filter((attendance) => attendance.id !== deletedAttendance.id),
    );
    setQueueItems((currentQueueItems) =>
      currentQueueItems.filter(
        (queueItem) => queueItem.attendance_id !== deletedAttendance.id,
      ),
    );
    setDeletedAttendances((currentAttendances) =>
      [...currentAttendances.filter((attendance) => attendance.id !== deletedAttendance.id), deletedAttendance].sort(
        (left, right) =>
          new Date(right.deleted_at ?? right.created_at).getTime() -
          new Date(left.deleted_at ?? left.created_at).getTime(),
      ),
    );
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
    ["Pendente de retorno", "pendente_retorno"],
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
        <MetricCard label="Cadastros" value={String(reportAttendances.length)} helper="Atendimentos criados no recorte." accent="teal" />
        <MetricCard label="Etapas" value={String(reportQueueItems.length)} helper="Itens distribuidos nas salas." accent="slate" />
        <MetricCard label="Aguardando" value={String(waitingAttendances)} helper="Atendimentos sem etapa iniciada." accent="amber" />
        <MetricCard label="80+ esperando" value={String(topPriorityWaiting)} helper="Maior prioridade ainda na fila." accent="amber" />
        <MetricCard label="Etapas canceladas" value={String(canceledStages)} helper="Cancelamentos registrados no recorte." accent="rose" />
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
          <MetricCard label="Normal" value={String(reportAttendances.filter((a) => a.priority === "normal").length)} helper="Prioridade base." />
          <MetricCard label="60+ e outras" value={String(reportAttendances.filter((a) => a.priority === "sessenta_mais_outras").length)} helper="Prioridade intermediaria." accent="teal" />
          <MetricCard label="80+" value={String(reportAttendances.filter((a) => a.priority === "oitenta_mais").length)} helper="Maior prioridade operacional." accent="amber" />
        </div>
      </section>

      <section className="app-panel rounded-[30px] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Navegacao</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Operacao, busca, relatorios e exclusoes</h3>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <TabButton active={activeTab === "operacao"} label="Operacao" onClick={() => setActiveTab("operacao")} />
            <TabButton active={activeTab === "busca"} label="Busca de pacientes" onClick={() => setActiveTab("busca")} />
            <TabButton active={activeTab === "relatorios"} label="Relatorios" onClick={() => setActiveTab("relatorios")} />
            <TabButton active={activeTab === "exclusoes"} label="Registro de exclusoes" onClick={() => setActiveTab("exclusoes")} />
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
                <div className="mt-6 space-y-3">
                  {paginatedAttendances.map((attendance) => (
                    <AttendanceRow
                      key={attendance.id}
                      attendance={attendance}
                      nowMs={nowMs}
                      onAttendanceDeleted={handleAttendanceDeleted}
                      onAttendanceSaved={handleAttendanceSaved}
                      profileMap={profileMap}
                      rooms={rooms}
                    />
                  ))}
                </div>
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
      ) : activeTab === "busca" ? (
        <section className="space-y-4">
          <section className="app-panel rounded-[30px] px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Busca de pacientes</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">Consulta por nome e cadastro</h3>
                <p className="mt-2 text-sm text-slate-600">Recorte atual: {periodLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-[220px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nome do paciente</span>
                  <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="search" value={patientSearchName} onChange={(event) => setPatientSearchName(event.target.value)} placeholder="Buscar por nome" />
                </label>
                <label className="flex min-w-[220px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nº do cadastro</span>
                  <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="search" value={patientSearchRegistration} onChange={(event) => setPatientSearchRegistration(event.target.value)} placeholder="Buscar por cadastro" />
                </label>
              </div>
            </div>
          </section>

          <section className="app-panel rounded-[30px] px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resultados</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Atendimentos localizados</h3>
              <p className="mt-2 text-sm text-slate-600">{searchAttendances.length} resultado{searchAttendances.length === 1 ? "" : "s"} no recorte atual.</p>
            </div>
            {searchAttendances.length ? (
              <div className="mt-6 space-y-3">
                {searchAttendances.map((attendance) => (
                  <PatientSearchCard key={attendance.id} attendance={attendance} />
                ))}
              </div>
            ) : (
              <div className="mt-6"><EmptyState title="Nenhum paciente encontrado" description="Ajuste o nome, o cadastro ou o periodo para revisar outro conjunto." /></div>
            )}
          </section>
        </section>
      ) : activeTab === "relatorios" ? (
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
                <label className="flex min-w-[220px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Paciente</span>
                  <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="search" value={reportPatientSearch} onChange={(event) => setReportPatientSearch(event.target.value)} placeholder="Buscar por nome" />
                </label>
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
                {filteredRoomReportItems.length ? (
                  <div className="mt-6 space-y-3">
                    {filteredRoomReportItems.map((item) => (
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
                  <div className="mt-6"><EmptyState title="Nenhum registro nesta sala" description="Ajuste o filtro de sala, o nome do paciente ou o recorte de data para revisar outro conjunto." /></div>
                )}
              </div>
            </div>
          </section>
        </section>
      ) : (
        <section className="space-y-4">
          <section className="app-panel rounded-[30px] px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Registro de exclusoes</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">Exclusoes feitas por admin</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Recorte atual por data de exclusao: {periodLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-[220px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nome do paciente</span>
                  <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="search" value={deletedPatientSearchName} onChange={(event) => setDeletedPatientSearchName(event.target.value)} placeholder="Buscar por nome" />
                </label>
                <label className="flex min-w-[220px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nº do cadastro</span>
                  <input className="bg-transparent text-sm font-medium text-slate-900 outline-none" type="search" value={deletedPatientRegistration} onChange={(event) => setDeletedPatientRegistration(event.target.value)} placeholder="Buscar por cadastro" />
                </label>
                <SelectField label="Admin" value={deletedAdminFilter} onChange={setDeletedAdminFilter} options={deletedAdminOptions} />
              </div>
            </div>
          </section>

          <section className="app-panel rounded-[30px] px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resultados</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Registros encontrados</h3>
              <p className="mt-2 text-sm text-slate-600">{filteredDeletedAttendances.length} registro{filteredDeletedAttendances.length === 1 ? "" : "s"} no recorte atual.</p>
            </div>
            {filteredDeletedAttendances.length ? (
              <div className="mt-6 space-y-3">
                {filteredDeletedAttendances.map((attendance) => (
                  <DeletionRecordCard key={attendance.id} attendance={attendance} profileMap={profileMap} />
                ))}
              </div>
            ) : (
              <div className="mt-6"><EmptyState title="Nenhuma exclusao localizada" description="Ajuste o nome, cadastro, admin ou o recorte de data para revisar outro conjunto." /></div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

function AttendanceRow({
  attendance,
  nowMs,
  onAttendanceDeleted,
  onAttendanceSaved,
  profileMap,
  rooms,
}: {
  attendance: AttendanceWithQueueItems;
  nowMs: number;
  onAttendanceDeleted: (attendance: AttendanceWithQueueItems) => void;
  onAttendanceSaved: (
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) => void;
  profileMap: Map<string, ProfileRecord>;
  rooms: ExamRoomRecord[];
}) {
  const overallStatus = getAttendanceOverallStatus(attendance, attendance.queueItems);
  const orderedItems = sortAttendanceQueueItemsByFlow(attendance.queueItems);
  const lockedExamTypes = useMemo(
    () =>
      new Set(
        attendance.queueItems
          .filter(
            (item) => item.status !== "aguardando" || Boolean(item.return_pending_at),
          )
          .map((item) => item.exam_type),
      ),
    [attendance.queueItems],
  );
  const initialSelectedExams = useMemo(
    () => Array.from(new Set(attendance.queueItems.map((item) => item.exam_type))),
    [attendance.queueItems],
  );
  const initialExamQuantities = useMemo(
    () =>
      attendance.queueItems.reduce<Partial<Record<ExamType, number>>>((acc, item) => {
        acc[item.exam_type] = item.requested_quantity;
        return acc;
      }, {}),
    [attendance.queueItems],
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isCancelFormOpen, setIsCancelFormOpen] = useState(false);
  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [isReturnFormOpen, setIsReturnFormOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingReturn, setIsUpdatingReturn] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [selectedStageItemId, setSelectedStageItemId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState(attendance.patient_name);
  const [patientRegistrationNumber, setPatientRegistrationNumber] = useState(
    attendance.patient_registration_number ?? "",
  );
  const [notes, setNotes] = useState(attendance.notes ?? "");
  const [returnReason, setReturnReason] = useState("");
  const [selectedExams, setSelectedExams] = useState<ExamType[]>(initialSelectedExams);
  const [examQuantities, setExamQuantities] =
    useState<Partial<Record<ExamType, number>>>(initialExamQuantities);

  const stepSummary = orderedItems
    .map((item) => {
      const roomLabel =
        ROOM_BY_SLUG[item.room_slug as RoomSlug]?.shortName ?? item.room_slug;

      return item.requested_quantity > 1
        ? `${roomLabel} x${item.requested_quantity}`
        : roomLabel;
    })
    .join(" + ");
  const waitingItems = attendance.queueItems.filter(
    (item) =>
      item.status === "aguardando" &&
      !isQueueItemReturnPending({ ...item, attendance }, new Date(nowMs)),
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
    ? profileMap.get(attendance.created_by)?.full_name ?? "Sem identificacao"
    : "Sem identificacao";
  const actionableStageItems = orderedItems.filter(
    (item) => item.status !== "finalizado" && item.status !== "cancelado",
  );
  const effectiveSelectedStageItemId =
    selectedStageItemId &&
    actionableStageItems.some((item) => item.id === selectedStageItemId)
      ? selectedStageItemId
      : actionableStageItems[0]?.id ?? null;
  const selectedStageItem =
    actionableStageItems.find((item) => item.id === effectiveSelectedStageItemId) ??
    null;
  const selectedStageLabel = selectedStageItem
    ? `${EXAM_LABELS[selectedStageItem.exam_type]} · ${
        ROOM_BY_SLUG[selectedStageItem.room_slug as RoomSlug]?.roomName ??
        selectedStageItem.room_slug
      }`
    : "Sem etapa aberta";
  const selectedStageIsReturnPending = selectedStageItem
    ? isQueueItemReturnPending({ ...selectedStageItem, attendance }, new Date(nowMs))
    : false;
  const rowTone =
    overallStatus === "aguardando"
      ? "border-amber-300 bg-amber-50/40"
      : overallStatus === "pendente_retorno"
        ? "border-fuchsia-200 bg-fuchsia-50/40"
      : overallStatus === "cancelado"
        ? "border-rose-200 bg-rose-50/40"
        : "border-slate-200 bg-white/85";

  function toggleExam(examType: ExamType) {
    if (lockedExamTypes.has(examType)) {
      return;
    }

    setSelectedExams((current) => {
      if (current.includes(examType)) {
        setExamQuantities((currentQuantities) => {
          const next = { ...currentQuantities };
          delete next[examType];
          return next;
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

  async function submitEdit() {
    setMutationError("");

    if (patientName.trim().length < 2) {
      setMutationError("Informe um nome de paciente valido.");
      return;
    }

    if (!selectedExams.length) {
      setMutationError("Selecione ao menos um exame.");
      return;
    }

    setIsSaving(true);

    const selectedExamQuantities = selectedExams.reduce<
      Partial<Record<ExamType, number>>
    >((accumulator, examType) => {
      accumulator[examType] = examQuantities[examType] ?? 1;
      return accumulator;
    }, {});

    const response = await fetch("/api/clinic/attendances", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "update",
        attendanceId: attendance.id,
        examQuantities: selectedExamQuantities,
        notes,
        patientName,
        patientRegistrationNumber,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      error?: string;
      queueItems?: QueueItemRecord[];
    }>(response)) ?? {};

    if (!response.ok || !payload.attendance) {
      setMutationError(payload.error || "Nao foi possivel atualizar o cadastro.");
      setIsSaving(false);
      return;
    }

    onAttendanceSaved(
      payload.attendance as AttendanceRecord,
      (payload.queueItems ?? []) as QueueItemRecord[],
    );
    setIsEditing(false);
    setIsSaving(false);
  }

  async function submitDelete() {
    setMutationError("");

    if (deleteReason.trim().length < 3) {
      setMutationError("Informe o motivo da exclusao com pelo menos 3 caracteres.");
      return;
    }

    setIsDeleting(true);

    const response = await fetch("/api/clinic/attendances", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        attendanceId: attendance.id,
        reason: deleteReason,
      }),
    });
    const payload =
      (await readJsonResponse<{ attendance?: AttendanceRecord; error?: string }>(response)) ?? {};

    if (!response.ok || !payload.attendance) {
      setMutationError(payload.error || "Nao foi possivel excluir o cadastro.");
      setIsDeleting(false);
      return;
    }

    onAttendanceDeleted({
      ...payload.attendance,
      queueItems: attendance.queueItems,
    });
    setDeleteReason("");
    setIsDeleteFormOpen(false);
    setIsDeleting(false);
  }

  async function submitCancellation() {
    setMutationError("");

    if (!selectedStageItem) {
      setMutationError("Selecione uma etapa aberta para cancelar.");
      return;
    }

    if (cancelReason.trim().length < 3) {
      setMutationError("Informe o motivo do cancelamento.");
      return;
    }

    setIsCanceling(true);

    const response = await fetch(`/api/clinic/queue-items/${selectedStageItem.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "cancel",
        reason: cancelReason,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      error?: string;
      queueItem?: QueueItemRecord;
      queueItems?: QueueItemRecord[];
    }>(response)) ?? {};

    if (!response.ok || !payload.attendance) {
      setMutationError(payload.error || "Nao foi possivel cancelar a etapa.");
      setIsCanceling(false);
      return;
    }

    onAttendanceSaved(
      payload.attendance as AttendanceRecord,
      (payload.queueItems ?? []) as QueueItemRecord[],
    );
    setIsEditing(false);
    setIsCancelFormOpen(false);
    setIsReturnFormOpen(false);
    setCancelReason("");
    setIsCanceling(false);
  }

  async function submitReturnPending(nextIsPending: boolean) {
    setMutationError("");
    if (!selectedStageItem) {
      setMutationError("Selecione uma etapa aberta para atualizar a pendencia.");
      return;
    }

    if (nextIsPending && returnReason.trim().length < 3) {
      setMutationError("Informe o motivo da pendencia de retorno.");
      return;
    }

    setIsUpdatingReturn(true);

    const response = await fetch(`/api/clinic/queue-items/${selectedStageItem.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "return-pending",
        isPending: nextIsPending,
        reason: returnReason,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      error?: string;
      queueItem?: QueueItemRecord;
      queueItems?: QueueItemRecord[];
    }>(response)) ?? {};

    if (!response.ok || !payload.attendance) {
      setMutationError(
        payload.error || "Nao foi possivel atualizar a marcacao de retorno.",
      );
      setIsUpdatingReturn(false);
      return;
    }

    onAttendanceSaved(
      payload.attendance as AttendanceRecord,
      (payload.queueItems ?? attendance.queueItems) as QueueItemRecord[],
    );
    setIsReturnFormOpen(false);
    if (!nextIsPending) {
      setReturnReason("");
    }
    setIsUpdatingReturn(false);
  }

  return (
    <div className={`rounded-[24px] border px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)] ${rowTone}`}>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.7fr_0.8fr_0.9fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-slate-950">{attendance.patient_name}</p>
            <PriorityBadge priority={attendance.priority} />
            <StatusPill status={overallStatus} />
          </div>
          {attendance.patient_registration_number ? (
            <p className="mt-1 text-sm font-medium text-cyan-800">
              Cadastro {attendance.patient_registration_number}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-slate-600">
            {attendance.notes || "Sem observacao"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Cadastro por {createdByName}
          </p>
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
            {stepSummary || "Sem etapa"} · {completedSteps} de{" "}
            {attendance.queueItems.length} concluidas
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
          {orderedItems.map((item) => (
            <StageTimingRow
              key={item.id}
              attendance={attendance}
              item={item}
              isReturnPending={isQueueItemReturnPending({ ...item, attendance }, new Date(nowMs))}
              nowMs={nowMs}
              profileMap={profileMap}
            />
          ))}
          {actionableStageItems.length ? (
            <label className="flex min-w-[280px] flex-1 flex-col gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Etapa em foco</span>
              <select
                className="bg-transparent text-sm text-slate-900 outline-none"
                value={effectiveSelectedStageItemId ?? ""}
                onChange={(event) => {
                  const nextStageId = event.target.value || null;
                  const nextStageItem =
                    actionableStageItems.find((item) => item.id === nextStageId) ?? null;

                  setSelectedStageItemId(nextStageId);
                  setReturnReason(nextStageItem?.return_pending_reason ?? "");
                  setIsCancelFormOpen(false);
                  setIsReturnFormOpen(false);
                  setMutationError("");
                }}
              >
                {actionableStageItems.map((item) => {
                  const roomLabel =
                    ROOM_BY_SLUG[item.room_slug as RoomSlug]?.roomName ?? item.room_slug;

                  return (
                    <option key={item.id} value={item.id}>
                      {EXAM_LABELS[item.exam_type]} · {roomLabel}
                    </option>
                  );
                })}
              </select>
              <span className="text-xs text-slate-500">{selectedStageLabel}</span>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {selectedStageItem && !attendance.canceled_at ? (
              <button
                className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  setMutationError("");
                  setIsReturnFormOpen(false);
                  setIsCancelFormOpen((current) => !current);
                }}
                disabled={isCanceling}
              >
                {isCancelFormOpen ? "Fechar cancelamento" : "Cancelar etapa"}
              </button>
            ) : null}
            <button
              className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
              type="button"
              onClick={() => {
                setMutationError("");
                setIsDeleteFormOpen(false);
                setIsEditing((current) => !current);
              }}
            >
              {isEditing ? "Fechar edicao" : "Editar cadastro"}
            </button>
            {selectedStageItem ? (
              <button
                className="rounded-[18px] border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-semibold text-fuchsia-800 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  setMutationError("");
                  setIsDeleteFormOpen(false);
                  if (selectedStageIsReturnPending) {
                    void submitReturnPending(false);
                    return;
                  }

                  setReturnReason(selectedStageItem?.return_pending_reason ?? "");
                  setIsCancelFormOpen(false);
                  setIsReturnFormOpen((current) => !current);
                }}
                disabled={isUpdatingReturn}
              >
                {isUpdatingReturn
                  ? "Atualizando retorno..."
                  : selectedStageIsReturnPending
                    ? "Retomar etapa"
                    : "Marcar pendencia da etapa"}
              </button>
            ) : null}
            <button
              className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                setMutationError("");
                setIsCancelFormOpen(false);
                setIsReturnFormOpen(false);
                setIsDeleteFormOpen((current) => !current);
              }}
              disabled={isDeleting}
            >
              {isDeleteFormOpen ? "Fechar exclusao" : "Excluir cadastro"}
            </button>
          </div>
          {isCancelFormOpen ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50/80 px-4 py-4">
              <p className="text-sm font-semibold text-rose-900">
                Cancelar apenas a etapa selecionada
              </p>
              <p className="mt-2 text-sm text-rose-700">
                Etapa: {selectedStageLabel}. O restante do atendimento permanece intacto.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-2 lg:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Motivo do cancelamento
                  </span>
                  <textarea
                    rows={3}
                    className="min-h-[110px] rounded-[18px] border border-rose-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Ex.: pedido cancelado, documentacao incorreta, paciente desistiu."
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-[18px] bg-rose-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={submitCancellation}
                  disabled={isCanceling}
                >
                  {isCanceling ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
                <button
                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setIsCancelFormOpen(false);
                    setMutationError("");
                    setCancelReason("");
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
          {isReturnFormOpen ? (
            <div className="rounded-[20px] border border-fuchsia-200 bg-fuchsia-50/80 px-4 py-4">
              <p className="text-sm font-semibold text-fuchsia-900">
                Marcar etapa em pendencia de retorno
              </p>
              <p className="mt-2 text-sm text-fuchsia-800">
                Etapa: {selectedStageLabel}. Ela sai da fila normal sem afetar as demais.
              </p>
              <div className="mt-4 grid gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Motivo da pendencia
                  </span>
                  <textarea
                    rows={3}
                    className="min-h-[110px] rounded-[18px] border border-fuchsia-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    value={returnReason}
                    onChange={(event) => setReturnReason(event.target.value)}
                    placeholder="Ex.: equipamento indisponivel, paciente remarcado, etapa restante para outro dia."
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-[18px] bg-fuchsia-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => void submitReturnPending(true)}
                  disabled={isUpdatingReturn}
                >
                  {isUpdatingReturn ? "Salvando..." : "Confirmar pendencia"}
                </button>
                <button
                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setIsReturnFormOpen(false);
                    setMutationError("");
                    setReturnReason(selectedStageItem?.return_pending_reason ?? "");
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
          {isDeleteFormOpen ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50/80 px-4 py-4">
              <p className="text-sm font-semibold text-rose-900">
                Excluir cadastro completo
              </p>
              <p className="mt-2 text-sm text-rose-700">
                Atendimento: {attendance.patient_name}. Esta acao remove o cadastro do fluxo operacional.
              </p>
              <div className="mt-4 grid gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Motivo da exclusao
                  </span>
                  <textarea
                    rows={3}
                    className="min-h-[110px] rounded-[18px] border border-rose-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                    placeholder="Obrigatorio. Ex.: cadastro duplicado, erro de registro."
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-[18px] bg-rose-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={submitDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Excluindo..." : "Confirmar exclusao"}
                </button>
                <button
                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setIsDeleteFormOpen(false);
                    setMutationError("");
                    setDeleteReason("");
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
          {mutationError ? (
            <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {mutationError}
            </div>
          ) : null}
          {isEditing ? (
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Nome do paciente</span>
                  <input
                    className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    type="text"
                    value={patientName}
                    onChange={(event) => setPatientName(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Nº do cadastro</span>
                  <input
                    className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    type="text"
                    value={patientRegistrationNumber}
                    onChange={(event) => setPatientRegistrationNumber(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2 lg:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Observacao</span>
                  <textarea
                    className="min-h-[110px] rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-4">
                {rooms.map((room) => (
                  <div key={room.slug} className="rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">{room.name}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {ROOM_EXAM_TYPES[room.slug as keyof typeof ROOM_EXAM_TYPES].map((examType) => {
                        const checked = selectedExams.includes(examType);
                        const locked = lockedExamTypes.has(examType);
                        const quantity = examQuantities[examType] ?? 1;

                        return (
                          <label key={examType} className={checked ? "rounded-[18px] border border-cyan-200 bg-cyan-50 px-4 py-4" : "rounded-[18px] border border-slate-200 bg-white px-4 py-4"}>
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={() => toggleExam(examType)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600"
                              />
                              <div className="min-w-0 flex-1 space-y-2">
                                <p className="text-sm font-semibold text-slate-900">{EXAM_LABELS[examType]}</p>
                                {locked ? (
                                  <p className="text-xs font-medium text-fuchsia-700">
                                    Etapa ja iniciada, em pendencia ou concluida. So nome e observacao continuam editaveis.
                                  </p>
                                ) : null}
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
                                      disabled={locked}
                                      onChange={(event) => updateExamQuantity(examType, event.target.value)}
                                      className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none disabled:bg-slate-100"
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
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={submitEdit}
                  disabled={isSaving}
                >
                  {isSaving ? "Salvando..." : "Salvar alteracoes"}
                </button>
                <button
                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setMutationError("");
                    setPatientName(attendance.patient_name);
                    setPatientRegistrationNumber(attendance.patient_registration_number ?? "");
                    setNotes(attendance.notes ?? "");
                    setSelectedExams(initialSelectedExams);
                    setExamQuantities(initialExamQuantities);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function StageTimingRow({
  attendance,
  item,
  isReturnPending,
  nowMs,
  profileMap,
}: {
  attendance: AttendanceRecord;
  item: QueueItemRecord;
  isReturnPending: boolean;
  nowMs: number;
  profileMap: Map<string, ProfileRecord>;
}) {
  const executionMinutes = getQueueStageExecutionMinutes({ ...item, attendance }, nowMs);
  const totalMinutes = getQueueStageTotalMinutes({ ...item, attendance }, nowMs);
  const waitMinutes = getQueueStageWaitMinutes({ ...item, attendance }, nowMs);
  const roomLabel =
    ROOM_BY_SLUG[item.room_slug as RoomSlug]?.roomName ?? item.room_slug;
  const operatorSummary = [
    item.called_by
      ? `Chamado por ${profileMap.get(item.called_by)?.full_name ?? "desconhecido"}`
      : null,
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
            <p className="text-sm font-semibold text-slate-950">{roomLabel}</p>
            <StatusBadge status={item.status} />
            {isReturnPending ? (
              <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-800">
                Retorno pendente
              </span>
            ) : null}
            {item.requested_quantity > 1 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                qtd. {item.requested_quantity}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">{EXAM_LABELS[item.exam_type]}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-700">
            <span>Chamado {item.called_at ? `as ${formatClock(item.called_at)}` : "--"}</span>
            <span>Iniciado {item.started_at ? `as ${formatClock(item.started_at)}` : "--"}</span>
            <span>Finalizado {item.finished_at ? `as ${formatClock(item.finished_at)}` : "--"}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-700">
            <span>Espera: {formatMinuteLabel(waitMinutes)}</span>
            <span>
              {item.started_at && !item.finished_at && !item.canceled_at
                ? `Em execucao ha ${formatMinuteLabel(executionMinutes)}`
                : `Execucao: ${executionMinutes === null ? "--" : formatMinuteLabel(executionMinutes)}`}
            </span>
            <span>Total da etapa: {formatMinuteLabel(totalMinutes)}</span>
          </div>
          {operatorSummary ? (
            <p className="mt-2 text-sm text-slate-600">{operatorSummary}</p>
          ) : null}
          {item.return_pending_reason ? (
            <p className="mt-2 text-sm font-medium text-fuchsia-800">
              Motivo da pendencia: {item.return_pending_reason}
            </p>
          ) : null}
          {item.cancellation_reason ? (
            <p className="mt-2 text-sm font-medium text-rose-700">
              Motivo do cancelamento: {item.cancellation_reason}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Info label="Chamado" value={item.called_at ? formatClock(item.called_at) : "--"} />
          <Info label="Inicio" value={item.started_at ? formatClock(item.started_at) : "--"} />
          <Info label="Execucao" value={executionMinutes === null ? "--" : formatMinuteLabel(executionMinutes)} />
        </div>
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

function PatientSearchCard({ attendance }: { attendance: AttendanceWithQueueItems }) {
  const overallStatus = getAttendanceOverallStatus(attendance, attendance.queueItems);
  const orderedItems = sortAttendanceQueueItemsByFlow(attendance.queueItems);
  const requestedQuantity = attendance.queueItems.reduce(
    (total, item) => total + item.requested_quantity,
    0,
  );
  const examSummary = orderedItems.length
    ? orderedItems
        .map((item) =>
          item.requested_quantity > 1
            ? `${EXAM_LABELS[item.exam_type]} x${item.requested_quantity}`
            : EXAM_LABELS[item.exam_type],
        )
        .join(" · ")
    : "Sem exames vinculados.";

  return (
    <details className="rounded-[24px] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)]">
      <summary className="list-none cursor-pointer">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-slate-950">{attendance.patient_name}</p>
              <PriorityBadge priority={attendance.priority} />
              <StatusPill status={overallStatus} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
              <span>Cadastro {attendance.patient_registration_number ?? "Nao informado"}</span>
              <span>Entrada {formatDateTime(attendance.created_at)}</span>
              <span>{requestedQuantity} exame{requestedQuantity === 1 ? "" : "s"} solicitado{requestedQuantity === 1 ? "" : "s"}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">{examSummary}</p>
          </div>
          <span className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Ver detalhes
          </span>
        </div>
      </summary>
      <div className="mt-4 border-t border-slate-100 pt-4">
        {attendance.notes ? (
          <p className="mb-4 text-sm text-slate-600">Observacao: {attendance.notes}</p>
        ) : null}
        {orderedItems.length ? (
          <AttendanceTimeline items={orderedItems} title="Etapas vinculadas" />
        ) : (
          <p className="text-sm text-slate-600">Sem etapas vinculadas neste atendimento.</p>
        )}
      </div>
    </details>
  );
}

function DeletionRecordCard({
  attendance,
  profileMap,
}: {
  attendance: AttendanceWithQueueItems;
  profileMap: Map<string, ProfileRecord>;
}) {
  const orderedItems = sortAttendanceQueueItemsByFlow(attendance.queueItems);
  const requestedQuantity = attendance.queueItems.reduce(
    (total, item) => total + item.requested_quantity,
    0,
  );
  const deletedByName = attendance.deleted_by
    ? profileMap.get(attendance.deleted_by)?.full_name ?? "Sem identificacao"
    : "Sem identificacao";
  const previousStatus = getAttendanceOverallStatus(
    { ...attendance, deleted_at: null },
    attendance.queueItems,
  );
  const examSummary = orderedItems.length
    ? orderedItems
        .map((item) =>
          item.requested_quantity > 1
            ? `${EXAM_LABELS[item.exam_type]} x${item.requested_quantity}`
            : EXAM_LABELS[item.exam_type],
        )
        .join(" · ")
    : "Sem exames vinculados.";

  return (
    <details className="rounded-[24px] border border-rose-200 bg-rose-50/40 px-5 py-4 shadow-[0_18px_32px_rgba(15,23,42,0.04)]">
      <summary className="list-none cursor-pointer">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-slate-950">{attendance.patient_name}</p>
              <PriorityBadge priority={attendance.priority} />
              <StatusPill status={previousStatus} />
              <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700">
                Excluido
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
              <span>Cadastro {attendance.patient_registration_number ?? "Nao informado"}</span>
              <span>Exclusao {attendance.deleted_at ? formatDateTime(attendance.deleted_at) : "--"}</span>
              <span>Admin {deletedByName}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">{examSummary}</p>
            {attendance.deletion_reason ? (
              <p className="mt-2 text-sm font-medium text-rose-700">
                Motivo: {attendance.deletion_reason}
              </p>
            ) : null}
          </div>
          <span className="rounded-[18px] border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700">
            Ver detalhes
          </span>
        </div>
      </summary>
      <div className="mt-4 grid gap-4 border-t border-rose-100 pt-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Situacao antes" value={ATTENDANCE_STATUS_LABELS[previousStatus]} />
            <Info label="Qtd. total" value={String(requestedQuantity)} />
            <Info label="Criado em" value={formatDateTime(attendance.created_at)} />
            <Info label="Excluido em" value={attendance.deleted_at ? formatDateTime(attendance.deleted_at) : "--"} />
          </div>
          {attendance.notes ? (
            <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Observacao</p>
              <p className="mt-2 text-sm text-slate-700">{attendance.notes}</p>
            </div>
          ) : null}
          <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resumo do registro</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>Admin responsavel: {deletedByName}</p>
              <p>Cadastro: {attendance.patient_registration_number ?? "Nao informado"}</p>
              <p>Exames vinculados: {orderedItems.length}</p>
            </div>
          </div>
        </div>
        <div>
          {orderedItems.length ? (
            <AttendanceTimeline items={orderedItems} title="Exames vinculados na exclusao" />
          ) : (
            <p className="text-sm text-slate-600">Sem etapas vinculadas neste atendimento.</p>
          )}
        </div>
      </div>
    </details>
  );
}

function StatusPill({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-300 bg-amber-100 text-amber-950",
    pendente_retorno: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
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
    <button type="button" onClick={onClick} className={active ? "whitespace-nowrap rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white" : "whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"}>
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
