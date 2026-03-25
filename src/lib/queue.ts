import type { SupabaseClient } from "@supabase/supabase-js";
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

  return (data ?? []) as AttendanceRecord[];
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

  return (data ?? []) as QueueItemRecord[];
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

export function getTodayBounds(referenceDate = new Date()) {
  return getRangeBounds("day", referenceDate);
}

export function getRangeBounds(
  period: QueuePeriod,
  referenceDate = new Date(),
): QueueDateRange {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  if (period === "month") {
    start.setDate(1);
  }

  if (period === "quarter") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  }

  if (period === "year") {
    start.setMonth(0, 1);
  }

  const end = new Date(start);

  if (period === "day") {
    end.setDate(end.getDate() + 1);
  }

  if (period === "month") {
    end.setMonth(end.getMonth() + 1);
  }

  if (period === "quarter") {
    end.setMonth(end.getMonth() + 3);
  }

  if (period === "year") {
    end.setFullYear(end.getFullYear() + 1);
  }

  return {
    endIso: end.toISOString(),
    startIso: start.toISOString(),
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
  if (!value) {
    return new Date();
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return new Date();
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
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

export function sortAttendanceQueueItemsByFlow(
  queueItems: QueueItemRecord[],
) {
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

  return orderedItems.find((item) => item.status !== "finalizado") ?? null;
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
  return [...items].sort((left, right) => {
    if (left.status === "finalizado" && right.status !== "finalizado") {
      return 1;
    }

    if (left.status !== "finalizado" && right.status === "finalizado") {
      return -1;
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

export function getQueueWaitMinutes(
  item: Pick<QueueItemRecord, "created_at">,
  nowMs = Date.now(),
) {
  const diff = nowMs - new Date(item.created_at).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

export function getQueueStageWaitMinutes(
  item: Pick<QueueItemRecord, "created_at" | "started_at">,
  nowMs = Date.now(),
) {
  if (item.started_at) {
    return Math.max(
      0,
      Math.round(
        (new Date(item.started_at).getTime() - new Date(item.created_at).getTime()) /
          60000,
      ),
    );
  }

  return getQueueWaitMinutes(item, nowMs);
}

export function getQueueStageExecutionMinutes(
  item: Pick<QueueItemRecord, "finished_at" | "started_at">,
  nowMs = Date.now(),
) {
  if (!item.started_at) {
    return null;
  }

  const endMs = item.finished_at
    ? new Date(item.finished_at).getTime()
    : nowMs;

  return Math.max(
    0,
    Math.round((endMs - new Date(item.started_at).getTime()) / 60000),
  );
}

export function getQueueStageTotalMinutes(
  item: Pick<QueueItemRecord, "created_at" | "finished_at">,
  nowMs = Date.now(),
) {
  const endMs = item.finished_at
    ? new Date(item.finished_at).getTime()
    : nowMs;

  return Math.max(
    0,
    Math.round((endMs - new Date(item.created_at).getTime()) / 60000),
  );
}

export function getAttendanceTotalMinutes(
  attendance: Pick<AttendanceRecord, "created_at">,
  queueItems: Array<Pick<QueueItemRecord, "finished_at">>,
  nowMs = Date.now(),
) {
  const allFinished =
    queueItems.length > 0 && queueItems.every((item) => item.finished_at);

  const endMs = allFinished
    ? Math.max(
        ...queueItems.map((item) => new Date(item.finished_at as string).getTime()),
      )
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
      return "Chamar";
    case "chamado":
      return "Iniciar exame";
    case "em_atendimento":
      return "Finalizar";
    default:
      return null;
  }
}

export function getAverageWaitMinutes(items: QueueItemRecord[]) {
  const waits = items
    .map((item) => {
      const resolvedAt = item.called_at ?? item.started_at ?? item.finished_at;

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
  queueItems: QueueItemRecord[],
): AttendanceOverallStatus {
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
