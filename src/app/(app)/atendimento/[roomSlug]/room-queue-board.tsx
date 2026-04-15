"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AttentionAlertControl } from "@/components/attention-alert-control";
import { DayFilterControls } from "@/components/day-filter-controls";
import { EmptyState } from "@/components/empty-state";
import { PriorityBadge } from "@/components/priority-badge";
import { PwaInstallControl } from "@/components/pwa-install-control";
import { RealtimeStatusBadge } from "@/components/realtime-status";
import { StatusBadge } from "@/components/status-badge";
import { useAttentionAlert } from "@/hooks/use-attention-alert";
import {
  EXAM_LABELS,
  ROOM_STATUS_LABELS,
} from "@/lib/constants";
import type {
  AttendanceRecord,
  QueueItemRecord,
  QueueItemWithAttendance,
} from "@/lib/database.types";
import {
  formatClock,
  formatDate,
  formatDateInputValue,
  formatDateTime,
  formatMinuteLabel,
} from "@/lib/date";
import { readJsonResponse } from "@/lib/fetch-json";
import type { RoomSlug } from "@/lib/constants";
import { useRealtimeClinicData } from "@/hooks/use-realtime-queue";
import {
  combineQueueItemsWithAttendances,
  getNextStatus,
  getNextStatusLabel,
  getQueueWaitMinutes,
  isQueueItemReturnPending,
  isQueueItemNew,
  sortRoomQueueItems,
  type QueueDateRange,
} from "@/lib/queue";

type RoomQueueBoardProps = {
  initialAttendances: AttendanceRecord[];
  initialItems: QueueItemRecord[];
  range: QueueDateRange;
  room: {
    roomName: string;
    shortName: string;
  };
  roomSlug: RoomSlug;
  selectedDate: string;
};

export function RoomQueueBoard({
  initialAttendances,
  initialItems,
  range,
  room,
  roomSlug,
  selectedDate,
}: RoomQueueBoardProps) {
  const isToday = selectedDate === formatDateInputValue(new Date());
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
    roomSlug,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [actionError, setActionError] = useState("");
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [pendingReturnItemId, setPendingReturnItemId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnError, setReturnError] = useState("");
  const [returnMutationItemId, setReturnMutationItemId] = useState<string | null>(null);

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
    (item) =>
      item.status !== "cancelado" &&
      !item.attendance?.canceled_at &&
      !isQueueItemReturnPending(item, new Date(nowMs)),
  );
  const returnPendingItems = orderedItems.filter(
    (item) =>
      item.status !== "cancelado" &&
      !item.attendance?.canceled_at &&
      isQueueItemReturnPending(item, new Date(nowMs)),
  );
  const canceledItems = orderedItems.filter(
    (item) => item.status === "cancelado" || Boolean(item.attendance?.canceled_at),
  );

  function applyQueueItemMutation(
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems: QueueItemRecord[] = [],
  ) {
    setAttendances((currentAttendances) =>
      currentAttendances.map((attendance) =>
        attendance.id === updatedAttendance.id ? updatedAttendance : attendance,
      ),
    );
    const queueItemMap = new Map(
      (updatedQueueItems.length ? updatedQueueItems : [updatedItem]).map((queueItem) => [
        queueItem.id,
        queueItem,
      ]),
    );

    setQueueItems((currentItems) =>
      currentItems.map(
        (currentItem) => queueItemMap.get(currentItem.id) ?? currentItem,
      ),
    );
  }

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

    const payload = (await readJsonResponse<{
      error?: string;
      queueItem?: QueueItemRecord;
    }>(response)) ?? {};

    if (!response.ok || !payload.queueItem) {
      setActionError(payload.error || "Nao foi possivel avancar o exame.");
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

  async function submitReturnPending(queueItemId: string, nextIsPending: boolean) {
    setReturnError("");

    const normalizedReason = returnReason.trim();

    if (nextIsPending && normalizedReason.length < 3) {
      setReturnError("Informe o motivo da pendencia de retorno.");
      return;
    }

    setReturnMutationItemId(queueItemId);

    const response = await fetch(`/api/clinic/queue-items/${queueItemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "return-pending",
        isPending: nextIsPending,
        reason: normalizedReason || null,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      error?: string;
      queueItem?: QueueItemRecord;
      queueItems?: QueueItemRecord[];
    }>(response)) ?? {};

    if (!response.ok || !payload.attendance || !payload.queueItem) {
      setReturnError(
        payload.error || "Nao foi possivel atualizar a marcacao de retorno.",
      );
      setReturnMutationItemId(null);
      return;
    }

    applyQueueItemMutation(
      payload.attendance as AttendanceRecord,
      payload.queueItem as QueueItemRecord,
      (payload.queueItems ?? []) as QueueItemRecord[],
    );
    setPendingReturnItemId(null);
    setReturnReason("");
    setReturnMutationItemId(null);
  }

  const waitingCount = visibleItems.filter(
    (item) => item.status === "aguardando",
  ).length;
  const newWaitingItems = isToday
    ? visibleItems.filter((item) => isQueueItemNew(item, nowMs))
    : [];
  const newWaitingCount = newWaitingItems.length;
  const activeCount = visibleItems.filter(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  ).length;
  const { notificationPermission, requestNotificationPermission } = useAttentionAlert({
    alertIds: newWaitingItems.map((item) => item.id),
    body:
      newWaitingCount === 1
        ? `Existe 1 novo paciente aguardando em ${room.roomName}.`
        : `Existem ${newWaitingCount} novos pacientes aguardando em ${room.roomName}.`,
    count: newWaitingCount,
    title:
      newWaitingCount === 1
        ? `Novo paciente em ${room.shortName}`
        : `${newWaitingCount} novos pacientes em ${room.shortName}`,
  });

  return (
    <div className="space-y-6">
      {newWaitingCount ? (
        <div className="rounded-[24px] border border-amber-300 bg-gradient-to-r from-amber-100 via-amber-50 to-white px-5 py-4 shadow-[0_18px_40px_rgba(245,158,11,0.12)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-sm font-semibold text-amber-950">
              {newWaitingCount} novo
              {newWaitingCount === 1 ? "" : "s"} paciente
              {newWaitingCount === 1 ? "" : "s"} aguardando nesta sala.
            </p>
          </div>
        </div>
      ) : null}

      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href={`/atendimento?date=${selectedDate}`}
              className="text-sm font-semibold text-cyan-800 hover:text-cyan-900"
            >
              Voltar para as salas
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Operacao da sala
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {room.roomName}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {isToday
                ? "Chame o proximo paciente, inicie o exame, conclua o exame e marque pendencia de retorno quando precisar tirar o atendimento da fila atual."
                : `Consulta de ${formatDate(selectedDate)}. Fora de hoje, a sala fica em modo leitura para nao alterar o fluxo operacional vigente.`}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PwaInstallControl />
              <AttentionAlertControl
                notificationPermission={notificationPermission}
                onRequestPermission={requestNotificationPermission}
              />
              <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
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
              <div className="rounded-[24px] border border-fuchsia-200/80 bg-fuchsia-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-800">
                  Retornos
                </p>
                <p className="mt-2 text-3xl font-semibold text-fuchsia-900">
                  {returnPendingItems.length}
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
        <div className="mt-6">
          <DayFilterControls
            historyMessage="Modo consulta ativo. Para chamar, concluir ou retomar exames, volte para Hoje."
            selectedDate={selectedDate}
          />
        </div>
      </section>

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}

      {returnError ? (
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-800">
          {returnError}
        </div>
      ) : null}

      {visibleItems.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {visibleItems.map((item) => {
            const nextActionLabel = getNextStatusLabel(item.status);
            const referenceNow = nowMs;
            const waitMinutes = getQueueWaitMinutes(item, referenceNow);
            const isNew = isQueueItemNew(item, referenceNow);
            const registrationNumber = item.attendance?.patient_registration_number;
            const containerStyle = STATUS_CONTAINER_STYLES[item.status];

            return (
              <article
                key={item.id}
                className={
                  isNew
                    ? "rounded-[30px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white px-6 py-6 shadow-[0_28px_60px_rgba(245,158,11,0.12)]"
                    : `rounded-[30px] border px-6 py-6 ${containerStyle.article}`
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
                        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                          Novo aguardando
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {item.attendance?.notes || item.notes || "Sem observacao registrada."}
                    </p>
                    {registrationNumber ? (
                      <p className="mt-2 text-sm font-medium text-cyan-800">
                        Cadastro {registrationNumber}
                      </p>
                    ) : null}
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

                <div className={`mt-6 rounded-[22px] border px-4 py-4 ${containerStyle.panel}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Situacao
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
                      disabled={!isToday || pendingItemId === item.id}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {!isToday
                        ? "Disponivel apenas hoje"
                        : pendingItemId === item.id
                          ? "Atualizando..."
                          : nextActionLabel}
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                      Etapa concluida
                    </div>
                  )}

                  {item.status !== "finalizado" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReturnError("");
                        setPendingReturnItemId((current) =>
                          current === item.id ? null : item.id,
                        );
                        setReturnReason(
                          item.return_pending_reason ??
                            item.attendance?.return_pending_reason ??
                            "",
                        );
                      }}
                      disabled={!isToday}
                      className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-100"
                    >
                      {isToday ? "Marcar pendencia de retorno" : "Consulta historica"}
                    </button>
                  ) : null}
                </div>

                {isToday && pendingReturnItemId === item.id ? (
                  <div className="mt-6 rounded-[24px] border border-fuchsia-200 bg-fuchsia-50/80 px-5 py-5">
                    <p className="text-sm font-semibold text-fuchsia-900">
                      Marcar atendimento como pendente de retorno
                    </p>
                    <p className="mt-2 text-sm text-fuchsia-800">
                      O atendimento continua aberto, mas sai da fila atual ate o paciente retornar.
                    </p>
                    <div className="mt-4 grid gap-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">
                          Motivo da pendencia
                        </span>
                        <textarea
                          rows={3}
                          value={returnReason}
                          onChange={(event) => setReturnReason(event.target.value)}
                          className="w-full rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100"
                          placeholder="Ex.: equipamento indisponivel, paciente remarcado, exame restante para outro dia."
                        />
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => submitReturnPending(item.id, true)}
                          disabled={returnMutationItemId === item.id}
                          className="rounded-2xl bg-fuchsia-700 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {returnMutationItemId === item.id
                            ? "Salvando..."
                            : "Confirmar pendencia"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingReturnItemId(null);
                            setReturnError("");
                            setReturnReason("");
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
          description="Assim que a recepcao enviar um novo atendimento para esta fila, ele aparece aqui automaticamente."
        />
      )}

      {returnPendingItems.length ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-800">
                Retornos
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                Pendentes de retorno nesta sala
              </h3>
            </div>
            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-sm font-semibold text-fuchsia-800">
              {returnPendingItems.length} pendente{returnPendingItems.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {returnPendingItems.map((item) => {
                const registrationNumber = item.attendance?.patient_registration_number;

              return (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-fuchsia-200 bg-fuchsia-50/60 px-5 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-950">
                        {item.attendance?.patient_name ?? item.patient_name}
                      </p>
                      {item.attendance ? (
                        <PriorityBadge priority={item.attendance.priority} />
                      ) : null}
                      <StatusBadge status={item.status} />
                      <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-xs font-semibold text-fuchsia-800">
                        Retorno pendente
                      </span>
                    </div>
                    {registrationNumber ? (
                      <p className="mt-1 text-sm font-medium text-cyan-800">
                        Cadastro {registrationNumber}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-700">
                      {item.return_pending_reason ||
                        item.attendance?.return_pending_reason ||
                        "Sem motivo registrado."}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Etapa aberta: {EXAM_LABELS[item.exam_type]} • qtd. {item.requested_quantity}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => submitReturnPending(item.id, false)}
                    disabled={!isToday || returnMutationItemId === item.id}
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {!isToday
                      ? "Disponivel apenas hoje"
                      : returnMutationItemId === item.id
                      ? "Retomando..."
                      : "Retomar atendimento"}
                  </button>
                </div>
                  </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {canceledItems.length ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Historico
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
            {canceledItems.map((item) => {
                const registrationNumber = item.attendance?.patient_registration_number;

              return (
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
                {registrationNumber ? (
                  <p className="mt-1 text-sm font-medium text-cyan-800">
                    Cadastro {registrationNumber}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-slate-700">
                  {item.cancellation_reason ||
                    item.attendance?.cancellation_reason ||
                    "Sem motivo informado."}
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
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const STATUS_CONTAINER_STYLES: Record<
  QueueItemRecord["status"],
  {
    article: string;
    panel: string;
  }
> = {
  aguardando: {
    article:
      "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white shadow-[0_24px_52px_rgba(245,158,11,0.10)]",
    panel: "border-amber-200 bg-amber-50/80",
  },
  chamado: {
    article:
      "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white shadow-[0_24px_52px_rgba(14,165,233,0.10)]",
    panel: "border-sky-200 bg-sky-50/80",
  },
  em_atendimento: {
    article:
      "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-[0_24px_52px_rgba(16,185,129,0.10)]",
    panel: "border-emerald-200 bg-emerald-50/80",
  },
  finalizado: {
    article: "border-slate-200 bg-white",
    panel: "border-slate-200 bg-white/85",
  },
  cancelado: {
    article:
      "border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white shadow-[0_24px_52px_rgba(244,63,94,0.08)]",
    panel: "border-rose-200 bg-rose-50/80",
  },
};

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
