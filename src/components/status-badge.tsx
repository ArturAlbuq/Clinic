import { STATUS_LABELS } from "@/lib/constants";
import type { QueueStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<QueueStatus, string> = {
  aguardando:
    "border-amber-200 bg-amber-50 text-amber-800 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.04)]",
  chamado:
    "border-sky-200 bg-sky-50 text-sky-800 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.04)]",
  em_atendimento:
    "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.04)]",
  finalizado:
    "border-slate-200 bg-slate-100 text-slate-700 shadow-[inset_0_0_0_1px_rgba(100,116,139,0.04)]",
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
