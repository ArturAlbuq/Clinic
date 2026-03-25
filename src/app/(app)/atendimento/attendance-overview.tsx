"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PriorityBadge } from "@/components/priority-badge";
import { ROOM_BY_SLUG, ROOM_ORDER } from "@/lib/constants";
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
}: AttendanceOverviewProps) {
  const { attendances, queueItems } = useRealtimeClinicData({
    initialAttendances,
    initialQueueItems: initialItems,
  });

  const enrichedItems = combineQueueItemsWithAttendances(queueItems, attendances);

  const waitingCount = queueItems.filter((item) => item.status === "aguardando").length;
  const activeCount = queueItems.filter(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  ).length;
  const urgentCount = attendances.filter(
    (attendance) => attendance.priority === "urgente",
  ).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Atendimento
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Escolha a sala e acompanhe a fila por prioridade.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Cada sala recebe apenas seus itens. A prioridade do atendimento
            aparece na fila e a ordenação respeita urgente, alta e normal.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Aguardando"
            value={String(waitingCount)}
            helper="Itens prontos para chamada."
            accent="amber"
          />
          <MetricCard
            label="Em fluxo"
            value={String(activeCount)}
            helper="Chamados ou em atendimento."
            accent="teal"
          />
          <MetricCard
            label="Urgentes"
            value={String(urgentCount)}
            helper="Atendimentos com prioridade máxima hoje."
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {ROOM_ORDER.map((roomSlug) => {
          const room = ROOM_BY_SLUG[roomSlug];
          const roomItems = sortRoomQueueItems(
            enrichedItems.filter((item) => item.room_slug === roomSlug),
          );
          const latestItem = roomItems[0];
          const hasNewPatient = roomItems.some((item) => isQueueItemNew(item));

          return (
            <Link
              key={roomSlug}
              href={room.route}
              className="app-panel group rounded-[30px] px-6 py-6 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_26px_60px_rgba(15,23,42,0.1)]"
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
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Novo
                  </span>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-amber-200/80 bg-amber-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Aguardando
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-amber-900">
                    {roomItems.filter((item) => item.status === "aguardando").length}
                  </p>
                </div>
                <div className="rounded-[22px] border border-emerald-200/80 bg-emerald-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Em fluxo
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
                  Próximo da fila
                </p>
                {latestItem ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {latestItem.attendance?.patient_name}
                    </span>
                    {latestItem.attendance ? (
                      <PriorityBadge priority={latestItem.attendance.priority} />
                    ) : null}
                    <span className="text-sm text-slate-600">
                      as {formatClock(latestItem.attendance?.created_at ?? latestItem.created_at)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">
                    Nenhum paciente na fila hoje.
                  </p>
                )}
              </div>

              <div className="mt-5 text-sm font-semibold text-cyan-800 group-hover:text-cyan-900">
                Abrir fila da sala
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
