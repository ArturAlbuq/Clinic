import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { PipelineChips } from "@/components/pipeline-chips";
import { formatClock } from "@/lib/date";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/constants";
import { getAttendanceOverallStatus } from "@/lib/queue";
import type { AttendanceOverallStatus, AttendanceWithQueueItems, PipelineItemRecord } from "@/lib/database.types";

type AttendanceRowCompactProps = {
  attendance: AttendanceWithQueueItems;
  onExpandClick: () => void;
  pipelineItems: PipelineItemRecord[];
};

export function AttendanceRowCompact({
  attendance,
  onExpandClick,
  pipelineItems,
}: AttendanceRowCompactProps) {
  const completedSteps = attendance.queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;

  const requestedQuantity = attendance.queueItems.reduce(
    (total, item) => total + item.requested_quantity,
    0,
  );

  return (
    <button
      type="button"
      onClick={onExpandClick}
      className="w-full text-left rounded-[16px] border border-slate-200 bg-white/85 px-[14px] py-[14px] mb-[10px] shadow-[0_18px_32px_rgba(15,23,42,0.04)] hover:border-cyan-500 hover:bg-emerald-50 transition-all"
    >
      <div className="grid gap-2">
        {/* Top line: Name, Priority, Status */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-slate-950">
            {attendance.patient_name}
          </p>
          <PriorityBadge priority={attendance.priority} />
          <AttendanceStatusBadge
            status={getAttendanceOverallStatus(attendance, attendance.queueItems)}
          />
        </div>

        {/* Bottom line: Registration, Entry time, Progress */}
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          {attendance.patient_registration_number && (
            <>
              <span className="font-medium text-cyan-800">
                Cad. {attendance.patient_registration_number}
              </span>
              <span className="text-slate-300">•</span>
            </>
          )}
          <span className="text-slate-600">
            Entrada {formatClock(attendance.created_at)}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-600">
            {completedSteps} de {attendance.queueItems.length} exames
          </span>
          {pipelineItems.length > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <PipelineChips items={pipelineItems} />
            </>
          )}
          <span className="ml-auto text-slate-600">⋯</span>
        </div>
      </div>
    </button>
  );
}

// Helper
function AttendanceStatusBadge({ status }: { status: AttendanceOverallStatus }) {
  const styles = {
    aguardando: "border-amber-300 bg-amber-100 text-amber-950",
    pendente_retorno: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    em_andamento: "border-sky-200 bg-sky-50 text-sky-800",
    finalizado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <span
      className={`inline-flex rounded-full border px-[8px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.04em] ${styles[status]}`}
    >
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}
