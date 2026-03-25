"use client";

import { ROOM_BY_SLUG, STATUS_LABELS } from "@/lib/constants";
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
          const isCurrent = currentItem?.id === item.id;
          const isFinished = item.status === "finalizado";
          const shortName =
            ROOM_BY_SLUG[item.room_slug as keyof typeof ROOM_BY_SLUG]?.shortName ??
            item.room_slug;

          return (
            <StageBadge
              key={item.id}
              currentStatus={isCurrent ? STATUS_LABELS[item.status] : null}
              index={index + 1}
              isCurrent={isCurrent}
              isFinished={isFinished}
              label={shortName}
              showConnector={index < orderedItems.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}

function StageBadge({
  currentStatus,
  index,
  isCurrent,
  isFinished,
  label,
  showConnector,
}: {
  currentStatus: string | null;
  index: number;
  isCurrent: boolean;
  isFinished: boolean;
  label: string;
  showConnector: boolean;
}) {
  const styles = isCurrent
    ? {
        bubble: "border-cyan-300 bg-cyan-600 text-white",
        card: "border-cyan-200 bg-cyan-50 text-cyan-950",
        helper: currentStatus ?? "Atual",
      }
    : isFinished
      ? {
          bubble: "border-emerald-200 bg-emerald-600 text-white",
          card: "border-emerald-200 bg-emerald-50 text-emerald-950",
          helper: "Concluída",
        }
      : {
          bubble: "border-slate-200 bg-white text-slate-700",
          card: "border-slate-200 bg-white text-slate-900",
          helper: "Pendente",
        };

  return (
    <>
      <div className={`flex items-center gap-3 rounded-[20px] border px-3 py-3 ${styles.card}`}>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${styles.bubble}`}
        >
          {index}
        </span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-slate-500">{styles.helper}</p>
        </div>
      </div>
      {showConnector ? (
        <span className="text-sm font-semibold text-slate-300" aria-hidden="true">
          →
        </span>
      ) : null}
    </>
  );
}
