import { AttendanceTimeline } from "@/components/attendance-timeline";
import { ReceptionReturnActionCard } from "../app/(app)/recepcao/reception-dashboard"; // Temporarily import from dashboard
import { EXAM_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { sortAttendanceQueueItemsByFlow, isQueueItemReturnPending } from "@/lib/queue";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  QueueItemRecord,
} from "@/lib/database.types";

type AttendanceRowExpandedProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  onQueueItemMutation: (
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems?: QueueItemRecord[],
  ) => void;
};

export function AttendanceRowExpanded({
  attendance,
  isToday,
  onQueueItemMutation,
}: AttendanceRowExpandedProps) {
  const actionableItems = attendance.canceled_at
    ? []
    : sortAttendanceQueueItemsByFlow(attendance.queueItems).filter(
        (item) => item.status !== "finalizado" && item.status !== "cancelado",
      );

  return (
    <div className="rounded-b-[16px] border-x border-b border-slate-200 bg-slate-50/50 px-[14px] py-[14px]">
      {/* Notes section */}
      {attendance.notes && (
        <div className="mb-4 pb-4 border-b border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Observação
          </p>
          <p className="mt-2 text-sm text-slate-700">{attendance.notes}</p>
        </div>
      )}

      {/* Cancellation reason */}
      {attendance.cancellation_reason && attendance.canceled_at && (
        <div className="mb-4 pb-4 border-b border-slate-200">
          <p className="text-sm font-medium text-rose-700">
            Motivo do cancelamento: {attendance.cancellation_reason}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Cancelado em {formatDateTime(attendance.canceled_at)}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="mb-4 pb-4 border-b border-slate-200">
        <AttendanceTimeline items={attendance.queueItems} title="Exames do atendimento" />
      </div>

      {/* Action cards */}
      {actionableItems.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Ações por etapa
          </p>
          <div className="mt-3 grid gap-3">
            {actionableItems.map((item) => (
              <ReceptionReturnActionCard
                key={item.id}
                attendance={attendance}
                isToday={isToday}
                item={item}
                onQueueItemMutation={onQueueItemMutation}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
