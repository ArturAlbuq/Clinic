"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import type {
  AttendanceRecord,
  QueueItemRecord,
  QueueItemWithAttendance,
} from "@/lib/database.types";
import { formatClock, formatMinuteLabel } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import type { RoomSlug } from "@/lib/constants";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  combineQueueItemsWithAttendances,
  getNextStatus,
  getNextStatusLabel,
  getQueueWaitMinutes,
  isQueueItemNew,
  sortRoomQueueItems,
} from "@/lib/queue";

type RoomQueueBoardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  profileId: string;
  room: {
    roomName: string;
    shortName: string;
  };
  roomSlug: RoomSlug;
};

export function RoomQueueBoard({
  initialAttendances,
  initialItems,
  profileId,
  room,
  roomSlug,
}: RoomQueueBoardProps) {
  const { attendances, queueItems, setQueueItems } = useRealtimeClinicData({
    initialAttendances,
    initialQueueItems: initialItems,
  });
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNowMs(Date.now()));
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const queueItemsWithAttendance = useMemo(
    () => combineQueueItemsWithAttendances(queueItems, attendances),
    [queueItems, attendances],
  );

  const orderedItems = useMemo(
    () =>
      sortRoomQueueItems(
        queueItemsWithAttendance.filter((item) => item.room_slug === roomSlug),
      ),
    [queueItemsWithAttendance, roomSlug],
  );

  async function advanceStatus(item: QueueItemWithAttendance) {
    const nextStatus = getNextStatus(item.status);

    if (!nextStatus) {
      return;
    }

    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      setActionError("Supabase não configurado.");
      return;
    }

    setActionError("");
    setPendingItemId(item.id);

    const { data, error } = await supabase
      .from("queue_items")
      .update({
        status: nextStatus,
        updated_by: profileId,
      })
      .eq("id", item.id)
      .select("*")
      .single();

    if (error || !data) {
      setActionError(error?.message || "Não foi possível atualizar o status.");
      setPendingItemId(null);
      return;
    }

    setQueueItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id ? (data as QueueItemRecord) : currentItem,
      ),
    );
    setPendingItemId(null);
  }

  const waitingCount = orderedItems.filter(
    (item) => item.status === "aguardando",
  ).length;
  const activeCount = orderedItems.filter(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  ).length;

  return (
    <div className="space-y-6">
      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/atendimento"
              className="text-sm font-semibold text-cyan-800 hover:text-cyan-900"
            >
              Voltar para seleção de salas
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Fila da sala
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {room.roomName}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Os pacientes entram aqui em tempo real e a fila respeita prioridade
              e horário de chegada do atendimento.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-amber-200/80 bg-amber-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Aguardando
              </p>
              <p className="mt-2 text-3xl font-semibold text-amber-900">
                {waitingCount}
              </p>
            </div>
            <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Em fluxo
              </p>
              <p className="mt-2 text-3xl font-semibold text-emerald-900">
                {activeCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}

      {orderedItems.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {orderedItems.map((item) => {
            const nextActionLabel = getNextStatusLabel(item.status);
            const referenceNow =
              nowMs ?? new Date(item.attendance?.created_at ?? item.created_at).getTime();
            const waitMinutes = getQueueWaitMinutes(
              { created_at: item.attendance?.created_at ?? item.created_at },
              referenceNow,
            );
            const isNew = isQueueItemNew(item, referenceNow);

            return (
              <article
                key={item.id}
                className={
                  isNew
                    ? "rounded-[30px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white px-6 py-6 shadow-[0_28px_60px_rgba(245,158,11,0.12)]"
                    : "app-panel rounded-[30px] px-6 py-6"
                }
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-semibold text-slate-950">
                        {item.attendance?.patient_name ?? item.patient_name}
                      </h3>
                      {item.attendance ? (
                        <PriorityBadge priority={item.attendance.priority} />
                      ) : null}
                      {isNew ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Novo
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {item.attendance?.notes || item.notes || "Sem observação registrada."}
                    </p>
                  </div>

                  <StatusBadge status={item.status} />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Entrada
                    </p>
                    <p className="mt-2 font-mono text-lg text-slate-900">
                      {formatClock(item.attendance?.created_at ?? item.created_at)}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Espera
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatMinuteLabel(waitMinutes)}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Status
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {item.status.replace("_", " ")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {nextActionLabel ? (
                    <button
                      type="button"
                      onClick={() => advanceStatus(item)}
                      disabled={pendingItemId === item.id}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingItemId === item.id ? "Atualizando..." : nextActionLabel}
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      Exame finalizado
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="Nenhum paciente nessa sala"
          description="Assim que a recepção enviar um novo atendimento para esta fila, ele aparece aqui automaticamente."
        />
      )}
    </div>
  );
}
