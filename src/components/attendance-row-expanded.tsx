import { AttendanceTimeline } from "@/components/attendance-timeline";
import { ReceptionEditAttendanceCard } from "@/components/reception-edit-attendance-card";
import { ReceptionReturnActionCard } from "@/components/reception-return-action-card";
import { formatDateTime } from "@/lib/date";
import { sortAttendanceQueueItemsByFlow } from "@/lib/queue";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  ExamRoomRecord,
  QueueItemRecord,
} from "@/lib/database.types";

type AttendanceRowExpandedProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  rooms: ExamRoomRecord[];
  currentRole?: string;
  onAttendanceSaved: (
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) => void;
  onQueueItemMutation: (
    updatedAttendance: AttendanceRecord,
    updatedItem: QueueItemRecord,
    updatedQueueItems?: QueueItemRecord[],
  ) => void;
};

export function AttendanceRowExpanded({
  attendance,
  isToday,
  rooms,
  currentRole,
  onAttendanceSaved,
  onQueueItemMutation,
}: AttendanceRowExpandedProps) {
  const actionableItems = attendance.canceled_at
    ? []
    : sortAttendanceQueueItemsByFlow(attendance.queueItems).filter(
        (item) => item.status !== "finalizado" && item.status !== "cancelado",
      );

  return (
    <div className="rounded-b-[16px] border-x border-b border-slate-200 bg-slate-50/50 px-[14px] py-[14px]">
      {attendance.notes && (
        <div className="mb-4 pb-4 border-b border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Observacao
          </p>
          <p className="mt-2 text-sm text-slate-700">{attendance.notes}</p>
        </div>
      )}

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

      <div className="mb-4 pb-4 border-b border-slate-200">
        <AttendanceTimeline items={attendance.queueItems} title="Exames do atendimento" />
      </div>

      <ReceptionEditAttendanceCard
        attendance={attendance}
        isToday={isToday}
        rooms={rooms}
        currentRole={currentRole}
        onAttendanceSaved={onAttendanceSaved}
      />

      {actionableItems.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Acoes por etapa
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
