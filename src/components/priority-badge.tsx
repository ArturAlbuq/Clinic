import { PRIORITY_LABELS } from "@/lib/constants";
import type { AttendancePriority } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<AttendancePriority, string> = {
  normal: "border-slate-200 bg-slate-100 text-slate-700",
  alta: "border-cyan-200 bg-cyan-50 text-cyan-800",
  urgente: "border-rose-200 bg-rose-50 text-rose-700",
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
