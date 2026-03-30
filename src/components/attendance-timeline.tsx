"use client";

import { EXAM_SHORT_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { QueueItemRecord } from "@/lib/database.types";
import {
  getCurrentAttendanceQueueItem,
  sortAttendanceQueueItemsByFlow,
} from "@/lib/queue";

export function AttendanceTimeline({
  items,
  title = "Fluxo do atendimento",
}: {
  items: QueueItemRecord[];
  title?: string;
}) {
  const orderedItems = sortAttendanceQueueItemsByFlow(items);
  const currentItem = getCurrentAttendanceQueueItem(orderedItems);

  if (!orderedItems.length) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {orderedItems.map((item, index) => {
          const label =
            item.requested_quantity > 1
              ? `${EXAM_SHORT_LABELS[item.exam_type]} x${item.requested_quantity}`
              : EXAM_SHORT_LABELS[item.exam_type];

          return (
            <StageBadge
              key={item.id}
              index={index + 1}
              isCurrent={currentItem?.id === item.id}
              label={label}
              showConnector={index < orderedItems.length - 1}
              status={item.status}
            />
          );
        })}
      </div>
    </div>
  );
}

function StageBadge({
  index,
  isCurrent,
  label,
  showConnector,
  status,
}: {
  index: number;
  isCurrent: boolean;
  label: string;
  showConnector: boolean;
  status: QueueItemRecord["status"];
}) {
  const styles = {
    aguardando: {
      bubble: "border-amber-300 bg-amber-500 text-white",
      card: "border-amber-200 bg-amber-50 text-amber-950",
    },
    chamado: {
      bubble: "border-sky-300 bg-sky-500 text-white",
      card: "border-sky-200 bg-sky-50 text-sky-950",
    },
    em_atendimento: {
      bubble: "border-emerald-300 bg-emerald-500 text-white",
      card: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    finalizado: {
      bubble: "border-emerald-300 bg-emerald-100 text-emerald-900",
      card: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    cancelado: {
      bubble: "border-rose-300 bg-rose-500 text-white",
      card: "border-rose-200 bg-rose-50 text-rose-950",
    },
  } as const;

  const currentRing =
    isCurrent && status !== "finalizado" && status !== "cancelado"
      ? "ring-2 ring-cyan-200 ring-offset-2"
      : "";

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-[20px] border px-3 py-3 ${styles[status].card} ${currentRing}`}
      >
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${styles[status].bubble}`}
        >
          {index}
        </span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-slate-500">
            {isCurrent && status !== "finalizado" && status !== "cancelado"
              ? `${STATUS_LABELS[status]} agora`
              : STATUS_LABELS[status]}
          </p>
        </div>
      </div>
      {showConnector ? (
        <span className="text-sm font-semibold text-slate-300" aria-hidden="true">
          {"->"}
        </span>
      ) : null}
    </>
  );
}
