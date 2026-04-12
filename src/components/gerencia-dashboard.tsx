"use client";

import { useMemo } from "react";
import { MetricCard } from "@/components/metric-card";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { PriorityBadge } from "@/components/priority-badge";
import { buildRoomSummaries } from "@/lib/admin-report";
import { ATTENDANCE_STATUS_LABELS, ROOM_BY_SLUG, ROOM_ORDER, type RoomSlug } from "@/lib/constants";
import type {
  AttendanceRecord,
  ExamRoomRecord,
  QueueItemRecord,
} from "@/lib/database.types";
import { formatClock } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  groupAttendancesWithQueueItems,
  getAttendanceOverallStatus,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";

type Props = {
  initialAttendances: AttendanceRecord[];
  initialQueueItems: QueueItemRecord[];
  rooms: ExamRoomRecord[];
};

export function GerenciaDashboard({
  initialAttendances,
  initialQueueItems,
  rooms,
}: Props) {
  const { attendances, queueItems, realtimeStatus, realtimeError } =
    useRealtimeClinicData({
      includePendingReturns: true,
      initialAttendances,
      initialQueueItems,
    });

  const roomSummaries = useMemo(
    () => buildRoomSummaries({ attendances, queueItems, rooms }),
    [attendances, queueItems, rooms],
  );

  const activeQueueItems = useMemo(
    () => queueItems.filter((qi) => qi.status !== "finalizado" && qi.status !== "cancelado" && !qi.deleted_at),
    [queueItems],
  );

  const waitingCount = activeQueueItems.filter((qi) => qi.status === "aguardando").length;
  const calledCount = activeQueueItems.filter((qi) => qi.status === "chamado").length;
  const inProgressCount = activeQueueItems.filter((qi) => qi.status === "em_atendimento").length;

  const occupiedRooms = roomSummaries.filter((rs) => rs.activeCount > 0).length;
  const freeRooms = ROOM_ORDER.length - occupiedRooms;

  const attendancesWithItems = useMemo(() => {
    const active = groupAttendancesWithQueueItems(attendances, queueItems).filter((a) => {
      const status = getAttendanceOverallStatus(a, a.queueItems);
      return status === "aguardando" || status === "em_andamento";
    });
    return sortAttendancesByPriorityAndCreatedAt(active);
  }, [attendances, queueItems]);

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Painel de Operação
        </h1>
        <RealtimeStatusBadge status={realtimeStatus} error={realtimeError} />
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Aguardando"
          value={String(waitingCount)}
          helper="pacientes na fila"
          accent="amber"
        />
        <MetricCard
          label="Chamados"
          value={String(calledCount)}
          helper="aguardando entrada"
          accent="teal"
        />
        <MetricCard
          label="Em exame"
          value={String(inProgressCount)}
          helper="em atendimento agora"
          accent="teal"
        />
        <MetricCard
          label="Salas ocupadas"
          value={String(occupiedRooms)}
          helper={`de ${ROOM_ORDER.length} salas`}
          accent={occupiedRooms === ROOM_ORDER.length ? "rose" : "slate"}
        />
        <MetricCard
          label="Salas livres"
          value={String(freeRooms)}
          helper="disponíveis agora"
          accent={freeRooms === 0 ? "rose" : "slate"}
        />
      </div>

      {/* Visão por salas */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">
          Salas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roomSummaries.map((rs) => {
            const roomConfig = ROOM_BY_SLUG[rs.roomSlug as RoomSlug];
            const isOccupied = rs.activeCount > 0;

            return (
              <div
                key={rs.roomSlug}
                className={`rounded-2xl border px-5 py-4 shadow-sm ${
                  isOccupied
                    ? "border-cyan-200 bg-cyan-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    {roomConfig?.roomName ?? rs.roomSlug}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isOccupied
                        ? "bg-cyan-200 text-cyan-900"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {isOccupied ? "Ocupada" : "Livre"}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p>
                    Em exame:{" "}
                    <span className="font-semibold text-slate-900">
                      {rs.activeCount}
                    </span>
                  </p>
                  <p>
                    Aguardando:{" "}
                    <span className="font-semibold text-slate-900">
                      {rs.waitingCount}
                    </span>
                  </p>
                  <p>
                    Finalizados hoje:{" "}
                    <span className="font-semibold text-slate-900">
                      {rs.finishedCount}
                    </span>
                  </p>
                  {rs.nextItem && (
                    <p className="mt-1 truncate text-amber-700">
                      Próximo: {rs.nextItem.attendance?.patient_name ?? "—"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Fila operacional */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">
          Fila e atendimento em andamento
        </h2>
        {attendancesWithItems.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum paciente ativo no momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-4">Paciente</th>
                  <th className="pb-2 pr-4">Prioridade</th>
                  <th className="pb-2 pr-4">Cadastro</th>
                  <th className="pb-2">Status geral</th>
                </tr>
              </thead>
              <tbody>
                {attendancesWithItems.map((a) => {
                  const overallStatus = getAttendanceOverallStatus(a, a.queueItems);
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {a.patient_name}
                        {a.patient_registration_number && (
                          <span className="ml-2 text-xs text-slate-400">
                            #{a.patient_registration_number}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <PriorityBadge priority={a.priority} />
                      </td>
                      <td className="py-2 pr-4 text-slate-500">
                        {formatClock(a.created_at)}
                      </td>
                      <td className="py-2 text-slate-700">
                        {ATTENDANCE_STATUS_LABELS[overallStatus]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
