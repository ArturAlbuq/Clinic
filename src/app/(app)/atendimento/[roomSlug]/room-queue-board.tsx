"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PriorityBadge } from "@/components/priority-badge";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { StatusBadge } from "@/components/status-badge";
import { EXAM_LABELS, ROOM_STATUS_LABELS } from "@/lib/constants";
import type {
  AttendanceRecord,
  QueueItemRecord,
  QueueItemWithAttendance,
} from "@/lib/database.types";
import { formatClock, formatDateTime, formatMinuteLabel } from "@/lib/date";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import type { RoomSlug } from "@/lib/constants";
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
  room: {
    roomName: string;
    shortName: string;
  };
  roomSlug: RoomSlug;
};

export function RoomQueueBoard({
  initialAttendances,
  initialItems,
  room,
  roomSlug,
}: RoomQueueBoardProps) {
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
    roomSlug,
  });
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [cancelAttendanceId, setCancelAttendanceId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

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

  const visibleItems = orderedItems.filter(
    (item) => item.status !== "cancelado" && !item.attendance?.canceled_at,
  );
  const canceledItems = orderedItems.filter(
    (item) => item.status === "cancelado" || Boolean(item.attendance?.canceled_at),
  );

  async function advanceStatus(item: QueueItemWithAttendance) {
    const nextStatus = getNextStatus(item.status);

    if (!nextStatus) {
      return;
    }

    setActionError("");
    setPendingItemId(item.id);

    const response = await fetch(`/api/clinic/queue-items/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        status: nextStatus,
      }),
    });

    const payload = (await response.json()) as {
      error?: string;
      queueItem?: QueueItemRecord;
    };

    if (!response.ok || !payload.queueItem) {
      setActionError(payload.error || "Não foi possível avançar a etapa.");
      setPendingItemId(null);
      return;
    }

    setQueueItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id ? (payload.queueItem as QueueItemRecord) : currentItem,
      ),
    );
    setPendingItemId(null);
  }

  async function submitCancellation(item: QueueItemWithAttendance) {
    setCancelError("");

    const reason = cancelReason.trim();
    const managerPassword = cancelPassword.trim();

    if (reason.length < 3) {
      setCancelError("Informe o motivo do cancelamento.");
      return;
    }

    if (!managerPassword) {
      setCancelError("Informe a senha da gerência.");
      return;
    }

    setPendingCancelId(item.attendance_id);

    const response = await fetch(
      `/api/clinic/attendances/${item.attendance_id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          managerPassword,
          reason,
        }),
      },
    );

    const payload = (await response.json()) as {
      attendance?: AttendanceRecord;
      error?: string;
      queueItems?: QueueItemRecord[];
    };

    if (!response.ok || !payload.attendance) {
      setCancelError(payload.error || "Não foi possível cancelar o atendimento.");
      setPendingCancelId(null);
      return;
    }

    const updatedItems = payload.queueItems ?? [];

    setAttendances((currentAttendances) =>
      currentAttendances.map((attendance) =>
        attendance.id === item.attendance_id
          ? (payload.attendance as AttendanceRecord)
          : attendance,
      ),
    );
    setQueueItems((currentItems) =>
      currentItems.map((currentItem) => {
        const updatedItem = updatedItems.find((entry) => entry.id === currentItem.id);
        return updatedItem ?? currentItem;
      }),
    );
    setCancelAttendanceId(null);
    setCancelReason("");
    setCancelPassword("");
    setPendingCancelId(null);
  }

  const waitingCount = visibleItems.filter(
    (item) => item.status === "aguardando",
  ).length;
  const activeCount = visibleItems.filter(
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
              Voltar para as salas
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Operação da sala
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {room.roomName}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Chame o próximo paciente, inicie o exame, conclua a etapa e, se
              necessário, cancele o requerimento inteiro com autorização da gerência.
            </p>
          </div>

          <div className="space-y-3">
            <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-amber-200/80 bg-amber-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Na fila
                </p>
                <p className="mt-2 text-3xl font-semibold text-amber-900">
                  {waitingCount}
                </p>
              </div>
              <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Em exame
                </p>
                <p className="mt-2 text-3xl font-semibold text-emerald-900">
                  {activeCount}
                </p>
              </div>
              <div className="rounded-[24px] border border-rose-200/80 bg-rose-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                  Cancelados
                </p>
                <p className="mt-2 text-3xl font-semibold text-rose-900">
                  {canceledItems.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}

      {visibleItems.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {visibleItems.map((item) => {
            const nextActionLabel = getNextStatusLabel(item.status);
            const referenceNow =
              nowMs ?? new Date(item.attendance?.created_at ?? item.created_at).getTime();
            const waitMinutes = getQueueWaitMinutes(
              { created_at: item.attendance?.created_at ?? item.created_at },
              referenceNow,
            );
            const isNew = isQueueItemNew(item, referenceNow);
            const cancellationOpen = cancelAttendanceId === item.attendance_id;

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

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  <InfoCard
                    label="Entrada"
                    value={formatClock(item.attendance?.created_at ?? item.created_at)}
                  />
                  <InfoCard
                    label="Espera"
                    value={formatMinuteLabel(waitMinutes)}
                  />
                  <InfoCard
                    label="Exame"
                    value={EXAM_LABELS[item.exam_type]}
                  />
                  <InfoCard
                    label="Quantidade"
                    value={String(item.requested_quantity)}
                  />
                </div>

                <div className="mt-6 rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Situação
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {ROOM_STATUS_LABELS[item.status]}
                  </p>
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
                      Etapa concluída
                    </div>
                  )}

                  {item.status !== "finalizado" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError("");
                        setCancelAttendanceId((current) =>
                          current === item.attendance_id ? null : item.attendance_id,
                        );
                      }}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Cancelar atendimento
                    </button>
                  ) : null}
                </div>

                {cancellationOpen ? (
                  <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50/80 px-5 py-5">
                    <p className="text-sm font-semibold text-rose-900">
                      Cancelar o requerimento inteiro do paciente
                    </p>
                    <p className="mt-2 text-sm text-rose-700">
                      O cancelamento tira todas as etapas abertas do fluxo e exige
                      senha da gerência.
                    </p>

                    <div className="mt-4 grid gap-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">
                          Motivo do cancelamento
                        </span>
                        <textarea
                          rows={3}
                          value={cancelReason}
                          onChange={(event) => setCancelReason(event.target.value)}
                          className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                          placeholder="Ex.: pedido cancelado, documentação incorreta, paciente desistiu."
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">
                          Senha da gerência
                        </span>
                        <input
                          type="password"
                          value={cancelPassword}
                          onChange={(event) => setCancelPassword(event.target.value)}
                          className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                          placeholder="Senha de autorização"
                        />
                      </label>

                      {cancelError ? (
                        <div className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">
                          {cancelError}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => submitCancellation(item)}
                          disabled={pendingCancelId === item.attendance_id}
                          className="rounded-2xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingCancelId === item.attendance_id
                            ? "Cancelando..."
                            : "Confirmar cancelamento"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCancelAttendanceId(null);
                            setCancelError("");
                            setCancelPassword("");
                            setCancelReason("");
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="Nenhum paciente nesta sala"
          description="Assim que a recepção enviar um novo atendimento para esta fila, ele aparece aqui automaticamente."
        />
      )}

      {canceledItems.length ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Histórico
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                Cancelamentos desta sala
              </h3>
            </div>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700">
              {canceledItems.length} cancelado{canceledItems.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {canceledItems.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-rose-200 bg-rose-50/60 px-5 py-4"
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
                <p className="mt-2 text-sm text-slate-700">
                  {item.attendance?.cancellation_reason || "Sem motivo informado."}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Cancelado em{" "}
                  {item.attendance?.canceled_at
                    ? formatDateTime(item.attendance.canceled_at)
                    : item.canceled_at
                      ? formatDateTime(item.canceled_at)
                      : "--"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
