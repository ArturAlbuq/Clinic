import {
  EXAM_ORDER,
  ROOM_ORDER,
  type RoomSlug,
} from "@/lib/constants";
import type {
  AttendanceRecord,
  ExamRoomRecord,
  ProfileRecord,
  QueueItemRecord,
  QueueItemWithAttendance,
} from "@/lib/database.types";
import {
  formatDate,
  formatMonthYear,
  getClinicQuarter,
  getClinicYear,
} from "@/lib/date";
import {
  combineQueueItemsWithAttendances,
  isQueueItemReturnPending,
  isQueueItemNew,
  sortRoomQueueItems,
  type QueuePeriod,
} from "@/lib/queue";

export type RoomSummary = {
  activeCount: number;
  finishedCount: number;
  hasNewWaiting: boolean;
  newWaitingCount: number;
  nextItem: QueueItemWithAttendance | null;
  room: ExamRoomRecord | undefined;
  roomSlug: RoomSlug;
  waitingCount: number;
};

export type AttendantReportEntry = {
  avgCallMinutes: number | null;
  avgExecutionMinutes: number | null;
  avgStageTotalMinutes: number | null;
  calledCount: number;
  canceledCount: number;
  finishedCount: number;
  profile: ProfileRecord;
};

export type ReceptionReportEntry = {
  createdCount: number;
  profile: ProfileRecord;
};

export function buildRoomSummaries(options: {
  attendances: AttendanceRecord[];
  nowMs?: number;
  queueItems: QueueItemRecord[];
  rooms: ExamRoomRecord[];
}) {
  const { attendances, nowMs = Date.now(), queueItems, rooms } = options;

  return ROOM_ORDER.map((roomSlug) => {
    const roomItems = queueItems.filter((item) => item.room_slug === roomSlug);
    const enrichedItems = sortRoomQueueItems(
      combineQueueItemsWithAttendances(roomItems, attendances),
    );
    const operationalItems = enrichedItems.filter(
      (item) => !isQueueItemReturnPending(item, new Date(nowMs)),
    );
    const waitingItems = operationalItems.filter(
      (item) => item.status === "aguardando",
    );
    const newWaitingCount = waitingItems.filter((item) => isQueueItemNew(item, nowMs))
      .length;

    return {
      activeCount: operationalItems.filter(
        (item) => item.status === "chamado" || item.status === "em_atendimento",
      ).length,
      finishedCount: roomItems.filter((item) => item.status === "finalizado").length,
      hasNewWaiting: newWaitingCount > 0,
      newWaitingCount,
      nextItem:
        operationalItems.find((item) => item.status === "aguardando") ?? null,
      room: rooms.find((entry) => entry.slug === roomSlug),
      roomSlug,
      waitingCount: waitingItems.length,
    } satisfies RoomSummary;
  });
}

export function buildAttendantReport(options: {
  attendances: AttendanceRecord[];
  profiles: ProfileRecord[];
  queueItems: QueueItemRecord[];
}) {
  const { profiles, queueItems } = options;

  return profiles
    .filter((profile) => profile.role === "atendimento")
    .map((profile) => {
      const calledItems = queueItems.filter(
        (item) => item.called_by === profile.id && item.called_at,
      );
      const executedItems = queueItems.filter(
        (item) =>
          item.started_by === profile.id && item.started_at && item.finished_at,
      );
      const totalStageItems = queueItems.filter(
        (item) =>
          item.started_by === profile.id &&
          item.started_at &&
          (item.finished_at || item.canceled_at),
      );
      const canceledByAttendant = queueItems.filter(
        (item) =>
          item.status === "cancelado" &&
          (item.canceled_by === profile.id || item.updated_by === profile.id),
      ).length;

      return {
        avgCallMinutes: averageMinutes(
          calledItems.map((item) =>
            diffMinutes(item.called_at as string, item.created_at),
          ),
        ),
        avgExecutionMinutes: averageMinutes(
          executedItems.map((item) =>
            diffMinutes(item.finished_at as string, item.started_at as string),
          ),
        ),
        avgStageTotalMinutes: averageMinutes(
          totalStageItems.map((item) =>
            diffMinutes(
              (item.finished_at ?? item.canceled_at) as string,
              item.created_at,
            ),
          ),
        ),
        calledCount: calledItems.length,
        canceledCount: canceledByAttendant,
        finishedCount: executedItems.length,
        profile,
      } satisfies AttendantReportEntry;
    })
    .sort((left, right) =>
      left.profile.full_name.localeCompare(right.profile.full_name, "pt-BR"),
    );
}

export function buildReceptionReport(options: {
  attendances: AttendanceRecord[];
  profiles: ProfileRecord[];
}) {
  const { attendances, profiles } = options;

  return profiles
    .filter((profile) => profile.role === "recepcao")
    .map((profile) => ({
      createdCount: attendances.filter(
        (attendance) => attendance.created_by === profile.id,
      ).length,
      profile,
    }))
    .sort((left, right) => right.createdCount - left.createdCount) satisfies ReceptionReportEntry[];
}

export function buildRoomReportItems(options: {
  attendances: AttendanceRecord[];
  queueItems: QueueItemRecord[];
  roomFilter: RoomSlug | "todas";
}) {
  const { attendances, queueItems, roomFilter } = options;
  const filteredItems =
    roomFilter === "todas"
      ? queueItems
      : queueItems.filter((item) => item.room_slug === roomFilter);

  return sortRoomQueueItems(
    combineQueueItemsWithAttendances(filteredItems, attendances),
  );
}

export function groupRoomReportItemsByExam(
  items: QueueItemWithAttendance[],
  roomFilter: RoomSlug | "todas",
) {
  const examEntries = new Map<
    QueueItemRecord["exam_type"],
    {
      count: number;
      finished: number;
      quantity: number;
      roomSlug: RoomSlug;
      waiting: number;
    }
  >();

  for (const item of items) {
    const roomSlug =
      roomFilter === "todas"
        ? (item.room_slug as RoomSlug)
        : roomFilter;
    const current = examEntries.get(item.exam_type) ?? {
      count: 0,
      finished: 0,
      quantity: 0,
      roomSlug,
      waiting: 0,
    };

    examEntries.set(item.exam_type, {
      count: current.count + 1,
      finished: current.finished + (item.status === "finalizado" ? 1 : 0),
      quantity: current.quantity + item.requested_quantity,
      roomSlug: current.roomSlug,
      waiting: current.waiting + (item.status === "aguardando" ? 1 : 0),
    });
  }

  return Array.from(examEntries.entries())
    .map(([examType, value]) => ({
      examType,
      roomSlug: value.roomSlug,
      finishedCount: value.finished,
      totalItems: value.count,
      totalQuantity: value.quantity,
      waitingCount: value.waiting,
    }))
    .sort((left, right) => EXAM_ORDER.indexOf(left.examType) - EXAM_ORDER.indexOf(right.examType));
}

export function getAdminPeriodLabel(period: QueuePeriod, selectedDate: string) {
  const referenceDate = `${selectedDate}T12:00:00.000Z`;

  if (period === "day") {
    return formatDate(referenceDate);
  }

  if (period === "month") {
    return capitalize(formatMonthYear(referenceDate));
  }

  if (period === "quarter") {
    return `${getClinicQuarter(referenceDate)}º trimestre de ${getClinicYear(referenceDate)}`;
  }

  return String(getClinicYear(referenceDate));
}

function averageMinutes(values: number[]) {
  if (!values.length) {
    return null;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function diffMinutes(end: string, start: string) {
  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
  );
}
