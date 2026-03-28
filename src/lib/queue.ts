import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clinicLocalDateToUtcDate,
  getClinicDateParts,
  parseDateInput as parseClinicDateInput,
} from "@/lib/date";
import { parseLegacyCancellationMetadata } from "@/lib/legacy-cancellation";
import {
  NEW_ITEM_WINDOW_MINUTES,
  PRIORITY_ORDER,
  ROOM_ORDER,
  type RoomSlug,
} from "@/lib/constants";
import type {
  AttendanceOverallStatus,
  AttendancePriority,
  AttendanceRecord,
  AttendanceWithQueueItems,
  Database,
  QueueItemRecord,
  QueueItemWithAttendance,
  QueueStatus,
} from "@/lib/database.types";

type QueueClient = SupabaseClient<Database>;

export type QueuePeriod = "day" | "month" | "quarter" | "year";

export type QueueDateRange = {
  endIso: string;
  startIso: string;
};

type ClinicRangeStart = {
  day: number;
  month: number;
  year: number;
};

type QueueResolutionItem = Pick<
  QueueItemRecord,
  "called_at" | "created_at" | "finished_at" | "started_at" | "canceled_at"
>;

export function normalizeAttendanceRecord(attendance: AttendanceRecord) {
  const legacyCancellation = parseLegacyCancellationMetadata(attendance.notes);

  return {
    ...attendance,
    canceled_at: attendance.canceled_at ?? legacyCancellation.canceledAt ?? null,
    canceled_by: attendance.canceled_by ?? legacyCancellation.canceledBy ?? null,
    cancellation_authorized_by:
      attendance.cancellation_authorized_by ??
      legacyCancellation.authorizedBy ??
      null,
    cancellation_reason:
      attendance.cancellation_reason ?? legacyCancellation.reason ?? null,
    notes: legacyCancellation.notes,
  } satisfies AttendanceRecord;
}

export function normalizeQueueItemRecord(queueItem: QueueItemRecord) {
  return {
    ...queueItem,
    called_by: queueItem.called_by ?? null,
    canceled_at: queueItem.canceled_at ?? null,
    finished_by: queueItem.finished_by ?? null,
    requested_quantity: queueItem.requested_quantity ?? 1,
    started_by: queueItem.started_by ?? null,
  } satisfies QueueItemRecord;
}

export async function fetchAttendances(
  supabase: QueueClient,
  options?: {
    range?: QueueDateRange;
  },
): Promise<AttendanceRecord[]> {
  const { startIso, endIso } = options?.range ?? getTodayBounds();
  const { data, error } = await supabase
    .from("attendances")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as AttendanceRecord[]).map(normalizeAttendanceRecord);
}

export async function fetchQueueItems(
  supabase: QueueClient,
  options?: {
    range?: QueueDateRange;
    roomSlug?: RoomSlug;
  },
): Promise<QueueItemRecord[]> {
  const { startIso, endIso } = options?.range ?? getTodayBounds();

  let query = supabase
    .from("queue_items")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });

  if (options?.roomSlug) {
    query = query.eq("room_slug", options.roomSlug);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as QueueItemRecord[]).map(normalizeQueueItemRecord);
}

export async function fetchExamRooms(
  supabase: QueueClient,
): Promise<Database["public"]["Tables"]["exam_rooms"]["Row"][]> {
  const { data, error } = await supabase
    .from("exam_rooms")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Database["public"]["Tables"]["exam_rooms"]["Row"][];
}

function shiftRangeStart(
  start: ClinicRangeStart,
  unit: "day" | "month" | "year",
  amount: number,
) {
  const shifted = new Date(Date.UTC(start.year, start.month - 1, start.day, 12));

  if (unit === "day") {
    shifted.setUTCDate(shifted.getUTCDate() + amount);
  }

  if (unit === "month") {
    shifted.setUTCMonth(shifted.getUTCMonth() + amount);
  }

  if (unit === "year") {
    shifted.setUTCFullYear(shifted.getUTCFullYear() + amount);
  }

  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  } satisfies ClinicRangeStart;
}

function getRangeStart(period: QueuePeriod, referenceDate: Date) {
  const parts = getClinicDateParts(referenceDate);

  if (period === "day") {
    return {
      day: parts.day,
      month: parts.month,
      year: parts.year,
    } satisfies ClinicRangeStart;
  }

  if (period === "month") {
    return {
      day: 1,
      month: parts.month,
      year: parts.year,
    } satisfies ClinicRangeStart;
  }

  if (period === "quarter") {
    return {
      day: 1,
      month: Math.floor((parts.month - 1) / 3) * 3 + 1,
      year: parts.year,
    } satisfies ClinicRangeStart;
  }

  return {
    day: 1,
    month: 1,
    year: parts.year,
  } satisfies ClinicRangeStart;
}

export function getTodayBounds(referenceDate = new Date()) {
  return getRangeBounds("day", referenceDate);
}

export function getRangeBounds(
  period: QueuePeriod,
  referenceDate = new Date(),
): QueueDateRange {
  const start = getRangeStart(period, referenceDate);
  const end =
    period === "day"
      ? shiftRangeStart(start, "day", 1)
      : period === "month"
        ? shiftRangeStart(start, "month", 1)
        : period === "quarter"
          ? shiftRangeStart(start, "month", 3)
          : shiftRangeStart(start, "year", 1);

  return {
    endIso: clinicLocalDateToUtcDate(end).toISOString(),
    startIso: clinicLocalDateToUtcDate(start).toISOString(),
  };
}

export function parseQueuePeriod(value?: string): QueuePeriod {
  if (
    value === "day" ||
    value === "month" ||
    value === "quarter" ||
    value === "year"
  ) {
    return value;
  }

  return "day";
}

export function parseDateInput(value?: string) {
  return parseClinicDateInput(value);
}

export function buildAttendanceMap(attendances: AttendanceRecord[]) {
  return new Map(attendances.map((attendance) => [attendance.id, attendance]));
}

export function combineQueueItemsWithAttendances(
  queueItems: QueueItemRecord[],
  attendances: AttendanceRecord[],
) {
  const attendanceMap = buildAttendanceMap(attendances);

  return queueItems.map((item) => ({
    ...item,
    attendance: attendanceMap.get(item.attendance_id) ?? null,
  })) satisfies QueueItemWithAttendance[];
}

export function groupAttendancesWithQueueItems(
  attendances: AttendanceRecord[],
  queueItems: QueueItemRecord[],
) {
  const groupedItems = new Map<string, QueueItemRecord[]>();

  for (const item of queueItems) {
    const currentItems = groupedItems.get(item.attendance_id) ?? [];
    currentItems.push(item);
    groupedItems.set(item.attendance_id, currentItems);
  }

  return attendances.map((attendance) => ({
    ...attendance,
    queueItems: (groupedItems.get(attendance.id) ?? []).sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    ),
  })) satisfies AttendanceWithQueueItems[];
}

export function sortAttendanceQueueItemsByFlow(queueItems: QueueItemRecord[]) {
  return [...queueItems].sort((left, right) => {
    const leftIndex = ROOM_ORDER.indexOf(left.room_slug as RoomSlug);
    const rightIndex = ROOM_ORDER.indexOf(right.room_slug as RoomSlug);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

export function getCurrentAttendanceQueueItem(
  queueItems: QueueItemRecord[],
): QueueItemRecord | null {
  const orderedItems = sortAttendanceQueueItemsByFlow(queueItems);
  const activeItem = orderedItems.find(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  );

  if (activeItem) {
    return activeItem;
  }

  return (
    orderedItems.find((item) => item.status === "aguardando") ??
    orderedItems.find((item) => item.status === "cancelado") ??
    null
  );
}

export function getPriorityRank(priority: AttendancePriority) {
  return PRIORITY_ORDER.indexOf(priority);
}

export function sortAttendancesByPriorityAndCreatedAt<
  T extends Pick<AttendanceRecord, "created_at" | "priority">,
>(attendances: T[]) {
  return [...attendances].sort((left, right) => {
    const priorityDiff =
      getPriorityRank(left.priority) - getPriorityRank(right.priority);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

export function sortRoomQueueItems(items: QueueItemWithAttendance[]) {
  const statusRank: Record<QueueStatus, number> = {
    aguardando: 0,
    chamado: 1,
    em_atendimento: 2,
    finalizado: 3,
    cancelado: 4,
  };

  return [...items].sort((left, right) => {
    const statusDiff = statusRank[left.status] - statusRank[right.status];

    if (statusDiff !== 0) {
      return statusDiff;
    }

    const leftPriority = left.attendance?.priority ?? "normal";
    const rightPriority = right.attendance?.priority ?? "normal";
    const priorityDiff =
      getPriorityRank(leftPriority) - getPriorityRank(rightPriority);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const leftCreatedAt = left.attendance?.created_at ?? left.created_at;
    const rightCreatedAt = right.attendance?.created_at ?? right.created_at;

    return (
      new Date(leftCreatedAt).getTime() - new Date(rightCreatedAt).getTime()
    );
  });
}

function getQueueWaitResolvedAt(item: QueueResolutionItem) {
  return item.called_at ?? item.started_at ?? item.finished_at ?? item.canceled_at;
}

export function getQueueWaitMinutes(
  item: Pick<QueueItemRecord, "created_at">,
  nowMs = Date.now(),
) {
  const diff = nowMs - new Date(item.created_at).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

export function getQueueStageWaitMinutes(
  item: Pick<QueueItemRecord, "created_at" | "started_at" | "canceled_at">,
  nowMs = Date.now(),
) {
  const resolvedAt = item.started_at ?? item.canceled_at;

  if (resolvedAt) {
    return Math.max(
      0,
      Math.round(
        (new Date(resolvedAt).getTime() - new Date(item.created_at).getTime()) /
          60000,
      ),
    );
  }

  return getQueueWaitMinutes(item, nowMs);
}

export function getQueueStageExecutionMinutes(
  item: Pick<QueueItemRecord, "finished_at" | "started_at" | "canceled_at">,
  nowMs = Date.now(),
) {
  if (!item.started_at) {
    return null;
  }

  const resolvedAt = item.finished_at ?? item.canceled_at;
  const endMs = resolvedAt ? new Date(resolvedAt).getTime() : nowMs;

  return Math.max(
    0,
    Math.round((endMs - new Date(item.started_at).getTime()) / 60000),
  );
}

export function getQueueStageTotalMinutes(
  item: Pick<QueueItemRecord, "created_at" | "finished_at" | "canceled_at">,
  nowMs = Date.now(),
) {
  const resolvedAt = item.finished_at ?? item.canceled_at;
  const endMs = resolvedAt ? new Date(resolvedAt).getTime() : nowMs;

  return Math.max(
    0,
    Math.round((endMs - new Date(item.created_at).getTime()) / 60000),
  );
}

export function getAttendanceTotalMinutes(
  attendance: Pick<AttendanceRecord, "created_at" | "canceled_at">,
  queueItems: Array<Pick<QueueItemRecord, "finished_at" | "canceled_at">>,
  nowMs = Date.now(),
) {
  if (attendance.canceled_at) {
    return Math.max(
      0,
      Math.round(
        (new Date(attendance.canceled_at).getTime() -
          new Date(attendance.created_at).getTime()) /
          60000,
      ),
    );
  }

  const resolvedQueueItems = queueItems
    .map((item) => item.finished_at ?? item.canceled_at)
    .filter((value): value is string => Boolean(value));

  const allResolved =
    queueItems.length > 0 && resolvedQueueItems.length === queueItems.length;

  const endMs = allResolved
    ? Math.max(...resolvedQueueItems.map((value) => new Date(value).getTime()))
    : nowMs;

  return Math.max(
    0,
    Math.round((endMs - new Date(attendance.created_at).getTime()) / 60000),
  );
}

export function isQueueItemNew(
  item: Pick<QueueItemRecord, "created_at" | "status">,
  nowMs = Date.now(),
) {
  return (
    item.status === "aguardando" &&
    getQueueWaitMinutes(item, nowMs) <= NEW_ITEM_WINDOW_MINUTES
  );
}

export function getNextStatus(status: QueueStatus): QueueStatus | null {
  switch (status) {
    case "aguardando":
      return "chamado";
    case "chamado":
      return "em_atendimento";
    case "em_atendimento":
      return "finalizado";
    default:
      return null;
  }
}

export function getNextStatusLabel(status: QueueStatus) {
  switch (status) {
    case "aguardando":
      return "Chamar paciente";
    case "chamado":
      return "Iniciar exame";
    case "em_atendimento":
      return "Concluir etapa";
    default:
      return null;
  }
}

export function getAverageWaitMinutes(items: QueueItemRecord[]) {
  const waits = items
    .map((item) => {
      const resolvedAt = getQueueWaitResolvedAt(item);

      if (!resolvedAt) {
        return null;
      }

      return Math.max(
        0,
        Math.round(
          (new Date(resolvedAt).getTime() - new Date(item.created_at).getTime()) /
            60000,
        ),
      );
    })
    .filter((value): value is number => value !== null);

  if (!waits.length) {
    return null;
  }

  return Math.round(waits.reduce((total, value) => total + value, 0) / waits.length);
}

export function getAttendanceOverallStatus(
  attendance: Pick<AttendanceRecord, "canceled_at"> | null | undefined,
  queueItems: QueueItemRecord[],
): AttendanceOverallStatus {
  if (attendance?.canceled_at) {
    return "cancelado";
  }

  if (!queueItems.length) {
    return "aguardando";
  }

  if (queueItems.every((item) => item.status === "finalizado")) {
    return "finalizado";
  }

  if (queueItems.every((item) => item.status === "aguardando")) {
    return "aguardando";
  }

  return "em_andamento";
}

export function getAttendanceStepSummary(queueItems: QueueItemRecord[]) {
  const total = queueItems.length;
  const completed = queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;

  return { completed, total };
}
