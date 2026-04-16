import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { EXAM_LABELS } from "@/lib/constants";
import { readJsonResponse } from "@/lib/fetch-json";
import { isQueueItemReturnPending } from "@/lib/queue";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  QueueItemRecord,
} from "@/lib/database.types";

type ReceptionReturnActionCardProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  item: QueueItemRecord;
  onQueueItemMutation: (
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems?: QueueItemRecord[],
  ) => void;
};

export function ReceptionReturnActionCard({
  attendance,
  isToday,
  item,
  onQueueItemMutation,
}: ReceptionReturnActionCardProps) {
  const isReturnPending = isQueueItemReturnPending({ ...item, attendance });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [returnReason, setReturnReason] = useState(
    item.return_pending_reason ?? attendance.return_pending_reason ?? "",
  );

  async function submitReturnPending(nextIsPending: boolean) {
    setReturnError("");

    const normalizedReason = returnReason.trim();

    if (nextIsPending && normalizedReason.length < 3) {
      setReturnError("Informe o motivo da pendencia de retorno.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/clinic/queue-items/${item.id}`, {
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
      setIsSubmitting(false);
      return;
    }

    onQueueItemMutation(
      payload.attendance as AttendanceRecord,
      payload.queueItem as QueueItemRecord,
      (payload.queueItems ?? []) as QueueItemRecord[],
    );
    setReturnReason(nextIsPending ? normalizedReason : "");
    setIsExpanded(false);
    setIsSubmitting(false);
  }

  return (
    <div
      className={
        isReturnPending
          ? "rounded-[22px] border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-4"
          : "rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">
              {EXAM_LABELS[item.exam_type]}
            </p>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Qtd. {item.requested_quantity}
            </span>
            <StatusBadge status={item.status} />
            {isReturnPending ? (
              <span className="inline-flex rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-xs font-semibold text-fuchsia-800">
                Retorno pendente
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {isReturnPending
              ? item.return_pending_reason ||
                attendance.return_pending_reason ||
                "Sem motivo registrado."
              : "A recepcao pode tirar este exame da fila atual quando o paciente precisar retornar depois."}
          </p>
        </div>

        {isReturnPending ? (
          <button
            type="button"
            onClick={() => submitReturnPending(false)}
            disabled={!isToday || isSubmitting}
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!isToday
              ? "Disponivel apenas hoje"
              : isSubmitting
                ? "Retomando..."
                : "Retomar exame"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setReturnError("");
              setReturnReason(
                item.return_pending_reason ?? attendance.return_pending_reason ?? "",
              );
              setIsExpanded((current) => !current);
            }}
            disabled={!isToday}
            className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isToday ? "Marcar pendencia" : "Consulta historica"}
          </button>
        )}
      </div>

      {!isReturnPending && isToday && isExpanded ? (
        <div className="mt-4 rounded-[20px] border border-fuchsia-200 bg-white px-4 py-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Motivo da pendencia
            </span>
            <textarea
              rows={3}
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              className="w-full rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100"
              placeholder="Ex.: paciente saiu e volta depois, exame restante para outro horario."
            />
          </label>
          {returnError ? (
            <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-800">
              {returnError}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submitReturnPending(true)}
              disabled={isSubmitting}
              className="rounded-2xl bg-fuchsia-700 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Salvando..." : "Confirmar pendencia"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                setReturnError("");
                setReturnReason("");
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {isReturnPending && returnError ? (
        <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-sm text-fuchsia-800">
          {returnError}
        </div>
      ) : null}
    </div>
  );
}
