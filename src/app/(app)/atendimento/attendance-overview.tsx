"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AttentionAlertControl } from "@/components/attention-alert-control";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { PwaInstallControl } from "@/components/pwa-install-control";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { useAttentionAlert } from "@/hooks/use-attention-alert";
import { ROOM_BY_SLUG } from "@/lib/constants";
import type {
  AttendanceRecord,
  ExamRoomRecord,
  QueueItemRecord,
} from "@/lib/database.types";
import { formatClock } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  combineQueueItemsWithAttendances,
  isQueueItemNew,
  sortRoomQueueItems,
} from "@/lib/queue";

type AttendanceOverviewProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  rooms: ExamRoomRecord[];
};

export function AttendanceOverview({
  initialAttendances,
  initialItems,
  rooms,
}: AttendanceOverviewProps) {
  const { attendances, queueItems, realtimeError, realtimeStatus } =
    useRealtimeClinicData({
      initialAttendances,
      initialQueueItems: initialItems,
    });

  const enrichedItems = combineQueueItemsWithAttendances(queueItems, attendances);
  const newWaitingItems = useMemo(
    () => queueItems.filter((item) => isQueueItemNew(item)),
    [queueItems],
  );
  const { notificationPermission, requestNotificationPermission } = useAttentionAlert({
    alertIds: newWaitingItems.map((item) => item.id),
    body:
      newWaitingItems.length === 1
        ? "Existe 1 novo paciente aguardando em uma das salas."
        : `Existem ${newWaitingItems.length} novos pacientes aguardando nas salas.`,
    count: newWaitingItems.length,
    title:
      newWaitingItems.length === 1
        ? "Novo paciente aguardando"
        : `${newWaitingItems.length} novos pacientes aguardando`,
  });

  const waitingCount = queueItems.filter((item) => item.status === "aguardando").length;
  const activeCount = queueItems.filter(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  ).length;
  const topPriorityCount = attendances.filter(
    (attendance) => attendance.priority === "oitenta_mais",
  ).length;

  if (!rooms.length) {
    return (
      <EmptyState
        title="Nenhuma sala liberada"
        description="Sua conta ainda não foi vinculada a uma sala de atendimento."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Atendimento
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                Abra a sua sala e acompanhe a fila operacional.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Cada sala vê apenas os próprios pacientes, com prioridade e ordem
                de chegada preservadas.
              </p>
          </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PwaInstallControl />
              <AttentionAlertControl
                notificationPermission={notificationPermission}
                onRequestPermission={requestNotificationPermission}
              />
              <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Na fila"
            value={String(waitingCount)}
            helper="Pacientes aguardando chamada."
            accent="amber"
          />
          <MetricCard
            label="Em exame"
            value={String(activeCount)}
            helper="Pacientes chamados ou em sala."
            accent="teal"
          />
          <MetricCard
            label="80+"
            value={String(topPriorityCount)}
            helper="Pacientes com prioridade máxima hoje."
          />
        </div>
      </section>

      <section
        className={`grid gap-4 ${
          rooms.length === 1 ? "lg:grid-cols-1" : "lg:grid-cols-2 2xl:grid-cols-4"
        }`}
      >
        {rooms.map((roomEntry) => {
          const room = ROOM_BY_SLUG[roomEntry.slug as keyof typeof ROOM_BY_SLUG];
          const roomItems = sortRoomQueueItems(
            enrichedItems.filter((item) => item.room_slug === roomEntry.slug),
          );
          const nextItem =
            roomItems.find((item) => item.status === "aguardando") ?? null;
          const hasNewPatient = roomItems.some((item) => isQueueItemNew(item));

          return (
            <Link
              key={roomEntry.slug}
              href={room.route}
              className={
                hasNewPatient
                  ? "app-panel group rounded-[30px] border-amber-300 bg-gradient-to-br from-amber-50 via-white to-white px-6 py-6 shadow-[0_24px_56px_rgba(245,158,11,0.14)] hover:-translate-y-1 hover:border-amber-400"
                  : "app-panel group rounded-[30px] px-6 py-6 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_26px_60px_rgba(15,23,42,0.1)]"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Sala
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {room.shortName}
                  </h3>
                </div>
                {hasNewPatient ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    Novo aguardando
                  </span>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-amber-200/80 bg-amber-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Na fila
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-amber-900">
                    {roomItems.filter((item) => item.status === "aguardando").length}
                  </p>
                </div>
                <div className="rounded-[22px] border border-emerald-200/80 bg-emerald-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Em exame
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-900">
                    {
                      roomItems.filter(
                        (item) =>
                          item.status === "chamado" ||
                          item.status === "em_atendimento",
                      ).length
                    }
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Próximo paciente
                </p>
                {nextItem ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {nextItem.attendance?.patient_name}
                      </span>
                      {nextItem.attendance ? (
                        <PriorityBadge priority={nextItem.attendance.priority} />
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-600">
                      desde{" "}
                      {formatClock(
                        nextItem.attendance?.created_at ?? nextItem.created_at,
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">
                    Nenhum paciente aguardando nesta sala.
                  </p>
                )}
              </div>

              <div className="mt-5 text-sm font-semibold text-cyan-800 group-hover:text-cyan-900">
                Abrir operação da sala
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
