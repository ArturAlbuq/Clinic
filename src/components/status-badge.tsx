import { STATUS_LABELS } from "@/lib/constants";
import type { QueueStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<QueueStatus, string> = {
  aguardando:
    "border-amber-300 bg-amber-100 text-amber-950 shadow-[0_10px_24px_rgba(245,158,11,0.14)]",
  chamado:
    "border-sky-300 bg-sky-100 text-sky-950 shadow-[0_10px_24px_rgba(14,165,233,0.12)]",
  em_atendimento:
    "border-emerald-300 bg-emerald-100 text-emerald-950 shadow-[0_10px_24px_rgba(16,185,129,0.12)]",
  finalizado:
    "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.06)]",
  cancelado:
    "border-rose-200 bg-rose-50 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.04)]",
};

export function StatusBadge({ status }: { status: QueueStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
