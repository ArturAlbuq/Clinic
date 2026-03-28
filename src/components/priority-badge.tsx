import { PRIORITY_LABELS } from "@/lib/constants";
import type { AttendancePriority } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<AttendancePriority, string> = {
  normal: "border-slate-200 bg-slate-100 text-slate-700",
  sessenta_mais_outras: "border-sky-200 bg-sky-50 text-sky-800",
  oitenta_mais: "border-rose-300 bg-rose-100 text-rose-800 shadow-[0_8px_20px_rgba(244,63,94,0.14)]",
};

export function PriorityBadge({ priority }: { priority: AttendancePriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        PRIORITY_STYLES[priority],
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
