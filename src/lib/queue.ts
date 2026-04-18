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
  ProfileRecord,
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

export type DeletedAttendanceRecord = {
  attendance: AttendanceRecord;
  deletedByProfile: ProfileRecord | null;
  queueItems: QueueItemRecord[];
  statusBeforeDeletion: AttendanceOverallStatus;
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
    deleted_at: attendance.deleted_at ?? null,
    deleted_by: attendance.deleted_by ?? null,
    deletion_reason: attendance.deletion_reason ?? null,
    notes: legacyCancellation.notes,
    patient_registration_number:
      attendance.patient_registration_number?.trim() || null,
    return_pending_at: attendance.return_pending_at ?? null,
    return_pending_by: attendance.return_pending_by ?? null,
    return_pending_reason: attendance.return_pending_reason ?? null,
  } satisfies AttendanceRecord;
}

export function normalizeQueueItemRecord(queueItem: QueueItemRecord) {
  return {
    ...queueItem,
    called_by: queueItem.called_by ?? null,
    canceled_at: queueItem.canceled_at ?? null,
    canceled_by: queueItem.canceled_by ?? null,
    cancellation_authorized_by: queueItem.cancellation_authorized_by ?? null,
    cancellation_reason: queueItem.cancellation_reason ?? null,
    finished_by: queueItem.finished_by ?? null,
    requested_quantity: queueItem.requested_quantity ?? 1,
    reactivated_at: queueItem.reactivated_at ?? null,
    reactivated_by: queueItem.reactivated_by ?? null,
    return_pending_at: queueItem.return_pending_at ?? null,
    return_pending_by: queueItem.return_pending_by ?? null,
    return_pending_reason: queueItem.return_pending_reason ?? null,
    started_by: queueItem.started_by ?? null,
  } satisfies QueueItemRecord;
}

export async function fetchAttendances(
  supabase: QueueClient,
  options?: {
    includePendingReturns?: boolean;
    range?: QueueDateRange;
  },
): Promise<AttendanceRecord[]> {
  const { startIso, endIso } = options?.range ?? getTodayBounds();
  const attendanceIds = await listScopedAttendanceIds(supabase, {
    includePendingReturns: options?.includePendingReturns ?? false,
    range: { endIso, startIso },
  });

  if (!attendanceIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("attendances")
    .select("*")
    .is("deleted_at", null)
    .in("id", attendanceIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as AttendanceRecord[]).map(normalizeAttendanceRecord);
}

export async function fetchQueueItems(
  supabase: QueueClient,
  options?: {
    includePendingReturns?: boolean;
    range?: QueueDateRange;
    roomSlug?: RoomSlug;
  },
): Promise<QueueItemRecord[]> {
  const { startIso, endIso } = options?.range ?? getTodayBounds();
  const attendanceIds = await listScopedAttendanceIds(supabase, {
    includePendingReturns: options?.includePendingReturns ?? false,
    range: { endIso, startIso },
  });

  if (!attendanceIds.length) {
    return [];
  }

  let query = supabase
    .from("queue_items")
    .select("*")
    .in("attendance_id", attendanceIds)
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

export async function fetchDeletedAttendanceRecords(
  supabase: QueueClient,
  options?: {
    profiles?: ProfileRecord[];
    range?: QueueDateRange;
  },
): Promise<DeletedAttendanceRecord[]> {
  const { startIso, endIso } = options?.range ?? getTodayBounds();
  const { data, error } = await supabase
    .from("attendances")
    .select("*")
    .not("deleted_at", "is", null)
    .gte("deleted_at", startIso)
    .lt("deleted_at", endIso)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw error;
  }

  const attendances = ((data ?? []) as AttendanceRecord[]).map(
    normalizeAttendanceRecord,
  );

  if (!attendances.length) {
    return [];
  }

  const attendanceIds = attendances.map((attendance) => attendance.id);
  const { data: queueItemsData, error: queueItemsError } = await supabase
    .from("queue_items")
    .select("*")
    .in("attendance_id", attendanceIds)
    .order("created_at", { ascending: true });

  if (queueItemsError) {
    throw queueItemsError;
  }

  const queueItems = ((queueItemsData ?? []) as QueueItemRecord[]).map(
    normalizeQueueItemRecord,
  );
  const queueItemsByAttendanceId = new Map<string, QueueItemRecord[]>();
  const profileMap = new Map(
    (options?.profiles ?? []).map((profile) => [profile.id, profile]),
  );

  for (const item of queueItems) {
    const currentItems = queueItemsByAttendanceId.get(item.attendance_id) ?? [];
    currentItems.push(item);
    queueItemsByAttendanceId.set(item.attendance_id, currentItems);
  }

  return attendances.map((attendance) => {
    const relatedQueueItems = queueItemsByAttendanceId.get(attendance.id) ?? [];

    return {
      attendance,
      deletedByProfile: attendance.deleted_by
        ? profileMap.get(attendance.deleted_by) ?? null
        : null,
      queueItems: relatedQueueItems,
      statusBeforeDeletion: getAttendanceStatusBeforeDeletion(
        attendance,
        relatedQueueItems,
      ),
    } satisfies DeletedAttendanceRecord;
  });
}

async function listScopedAttendanceIds(
  supabase: QueueClient,
  options: {
    includePendingReturns: boolean;
    range: QueueDateRange;
  },
) {
  const attendanceIds = new Set<string>();
  const { includePendingReturns, range } = options;

  const { data: rangedAttendances, error: rangedAttendancesError } = await supabase
    .from("attendances")
    .select("id")
    .gte("created_at", range.startIso)
    .lt("created_at", range.endIso)
    .is("deleted_at", null);

  if (rangedAttendancesError) {
    throw rangedAttendancesError;
  }

  for (const attendance of rangedAttendances ?? []) {
    if (attendance.id) {
      attendanceIds.add(attendance.id);
    }
  }

  if (includePendingReturns && isRangeToday(range)) {
    const { data: pendingItems, error: pendingError } = await supabase
      .from("queue_items")
      .select("attendance_id")
      .not("status", "in", '("finalizado","cancelado")');

    if (pendingError) {
      throw pendingError;
    }

    for (const item of pendingItems ?? []) {
      if (item.attendance_id) {
        attendanceIds.add(item.attendance_id);
      }
    }
  }

  if (!attendanceIds.size) {
    return [] as string[];
  }

  const { data: visibleAttendances, error: visibleAttendancesError } = await supabase
    .from("attendances")
    .select("id")
    .in("id", Array.from(attendanceIds))
    .is("deleted_at", null);

  if (visibleAttendancesError) {
    throw visibleAttendancesError;
  }

  return (visibleAttendances ?? [])
    .map((attendance) => attendance.id)
    .filter((attendanceId): attendanceId is string => Boolean(attendanceId));
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

export function isRangeToday(
  range: QueueDateRange,
  referenceDate = new Date(),
) {
  const today = getTodayBounds(referenceDate);

  return range.startIso === today.startIso && range.endIso === today.endIso;
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
    em_atendimento: 0,
    chamado: 1,
    aguardando: 2,
    finalizado: 3,
    cancelado: 4,
  };

  return [...items].sort((left, right) => {
    const statusDiff = statusRank[left.status] - statusRank[right.status];

    if (statusDiff !== 0) {
      return statusDiff;
    }

    const leftRelevantTime =
      left.status === "em_atendimento"
        ? left.started_at ?? left.called_at ?? getQueueItemQueueStartAt(left)
        : left.status === "chamado"
          ? left.called_at ?? getQueueItemQueueStartAt(left)
          : left.status === "aguardando"
            ? getQueueItemQueueStartAt(left)
            : left.status === "finalizado"
              ? left.finished_at ?? left.updated_at ?? left.created_at
              : left.canceled_at ?? left.updated_at ?? left.created_at;
    const rightRelevantTime =
      right.status === "em_atendimento"
        ? right.started_at ?? right.called_at ?? getQueueItemQueueStartAt(right)
        : right.status === "chamado"
          ? right.called_at ?? getQueueItemQueueStartAt(right)
          : right.status === "aguardando"
            ? getQueueItemQueueStartAt(right)
            : right.status === "finalizado"
              ? right.finished_at ?? right.updated_at ?? right.created_at
              : right.canceled_at ?? right.updated_at ?? right.created_at;
    const relevantTimeDiff =
      new Date(leftRelevantTime).getTime() - new Date(rightRelevantTime).getTime();

    if (relevantTimeDiff !== 0) {
      return left.status === "finalizado" || left.status === "cancelado"
        ? -relevantTimeDiff
        : relevantTimeDiff;
    }

    const leftPriority = left.attendance?.priority ?? "normal";
    const rightPriority = right.attendance?.priority ?? "normal";
    const priorityDiff =
      getPriorityRank(leftPriority) - getPriorityRank(rightPriority);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const leftCreatedAt = getQueueItemQueueStartAt(left);
    const rightCreatedAt = getQueueItemQueueStartAt(right);

    return new Date(leftCreatedAt).getTime() - new Date(rightCreatedAt).getTime();
  });
}

export function isQueueItemReturnPending(
  item: Pick<
    QueueItemRecord,
    "created_at" | "reactivated_at" | "return_pending_at" | "status"
  > & {
    attendance?: Pick<AttendanceRecord, "created_at" | "return_pending_at"> | null;
  },
  referenceDate = new Date(),
) {
  if (item.status === "finalizado" || item.status === "cancelado") {
    return false;
  }

  if (item.return_pending_at || item.attendance?.return_pending_at) {
    return true;
  }

  if (item.status === "chamado" || item.status === "em_atendimento") {
    return false;
  }

  return isClinicDateBefore(getQueueItemQueueStartAt(item), referenceDate);
}

function getQueueWaitResolvedAt(item: QueueResolutionItem) {
  return item.called_at ?? item.started_at ?? item.finished_at ?? item.canceled_at;
}

function getQueueItemPausedAt(
  item: {
    return_pending_at?: string | null;
    attendance?: {
      return_pending_at?: string | null;
    } | null;
  },
) {
  return item.return_pending_at ?? item.attendance?.return_pending_at ?? null;
}

function getQueueItemCountingEndMs(
  item: {
    return_pending_at?: string | null;
    attendance?: {
      return_pending_at?: string | null;
    } | null;
  },
  nowMs: number,
) {
  const pausedAt = getQueueItemPausedAt(item);

  if (!pausedAt) {
    return nowMs;
  }

  return Math.min(nowMs, new Date(pausedAt).getTime());
}

export function getQueueWaitMinutes(
  item: Pick<
    QueueItemRecord,
    "called_at" | "created_at" | "reactivated_at" | "return_pending_at"
  > & {
    attendance?: Pick<AttendanceRecord, "created_at" | "return_pending_at"> | null;
  },
  nowMs = Date.now(),
) {
  // Se o paciente já foi chamado, o tempo de espera congela em called_at.
  const endMs = item.called_at
    ? new Date(item.called_at).getTime()
    : getQueueItemCountingEndMs(item, nowMs);

  const diff = endMs - new Date(getQueueItemQueueStartAt(item)).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

export function getQueueStageWaitMinutes(
  item: Pick<
    QueueItemRecord,
    | "called_at"
    | "canceled_at"
    | "created_at"
    | "reactivated_at"
    | "return_pending_at"
    | "started_at"
  > & {
    attendance?: Pick<AttendanceRecord, "created_at" | "return_pending_at"> | null;
  },
  nowMs = Date.now(),
) {
  const resolvedAt = item.started_at ?? item.canceled_at;

  if (resolvedAt) {
    return Math.max(
      0,
      Math.round(
        (new Date(resolvedAt).getTime() -
          new Date(getQueueItemQueueStartAt(item)).getTime()) /
          60000,
      ),
    );
  }

  return getQueueWaitMinutes(item, nowMs);
}

export function getQueueStageExecutionMinutes(
  item: Pick<
    QueueItemRecord,
    "canceled_at" | "finished_at" | "return_pending_at" | "started_at"
  > & {
    attendance?: Pick<AttendanceRecord, "return_pending_at"> | null;
  },
  nowMs = Date.now(),
) {
  if (!item.started_at) {
    return null;
  }

  const resolvedAt = item.finished_at ?? item.canceled_at;
  const endMs = resolvedAt
    ? new Date(resolvedAt).getTime()
    : getQueueItemCountingEndMs(item, nowMs);

  return Math.max(
    0,
    Math.round((endMs - new Date(item.started_at).getTime()) / 60000),
  );
}

export function getQueueStageTotalMinutes(
  item: Pick<
    QueueItemRecord,
    | "canceled_at"
    | "created_at"
    | "finished_at"
    | "reactivated_at"
    | "return_pending_at"
  > & {
    attendance?: Pick<AttendanceRecord, "created_at" | "return_pending_at"> | null;
  },
  nowMs = Date.now(),
) {
  const resolvedAt = item.finished_at ?? item.canceled_at;
  const endMs = resolvedAt
    ? new Date(resolvedAt).getTime()
    : getQueueItemCountingEndMs(item, nowMs);

  return Math.max(
    0,
    Math.round((endMs - new Date(getQueueItemQueueStartAt(item)).getTime()) / 60000),
  );
}

export function getAttendanceTotalMinutes(
  attendance: Pick<
    AttendanceRecord,
    "created_at" | "canceled_at" | "return_pending_at"
  >,
  queueItems: Array<
    Pick<QueueItemRecord, "canceled_at" | "finished_at" | "return_pending_at">
  >,
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

  const pausedAtCandidates = [
    attendance.return_pending_at,
    ...queueItems.map((item) => item.return_pending_at),
  ].filter((value): value is string => Boolean(value));
  const pausedAtMs = pausedAtCandidates.length
    ? Math.min(...pausedAtCandidates.map((value) => new Date(value).getTime()))
    : null;

  const endMs = allResolved
    ? Math.max(...resolvedQueueItems.map((value) => new Date(value).getTime()))
    : pausedAtMs ?? nowMs;

  return Math.max(
    0,
    Math.round((endMs - new Date(attendance.created_at).getTime()) / 60000),
  );
}

export function isQueueItemNew(
  item: Pick<
    QueueItemRecord,
    "called_at" | "created_at" | "reactivated_at" | "return_pending_at" | "status"
  > & {
    attendance?: Pick<AttendanceRecord, "created_at" | "return_pending_at"> | null;
  },
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
      return "Concluir exame";
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
          (new Date(resolvedAt).getTime() -
            new Date(getQueueItemQueueStartAt(item)).getTime()) /
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
  attendance:
    | Pick<
        AttendanceRecord,
        "canceled_at" | "created_at" | "deleted_at" | "return_pending_at"
      >
    | null
    | undefined,
  queueItems: QueueItemRecord[],
  referenceDate = new Date(),
): AttendanceOverallStatus {
  if (attendance?.deleted_at || attendance?.canceled_at) {
    return "cancelado";
  }

  if (!queueItems.length) {
    return "aguardando";
  }

  const openItems = queueItems.filter(
    (item) => item.status !== "finalizado" && item.status !== "cancelado",
  );

  if (!openItems.length) {
    return queueItems.every((item) => item.status === "cancelado")
      ? "cancelado"
      : "finalizado";
  }

  const visibleOpenItems = openItems.filter(
    (item) => !isQueueItemReturnPending({ ...item, attendance }, referenceDate),
  );
  const hasActiveVisibleItems = visibleOpenItems.some(
    (item) => item.status === "chamado" || item.status === "em_atendimento",
  );

  if (!visibleOpenItems.length) {
    return "pendente_retorno";
  }

  return hasActiveVisibleItems ? "em_andamento" : "aguardando";
}

export function canReceptionEditAttendance(
  attendance:
    | Pick<
        AttendanceRecord,
        "canceled_at" | "created_at" | "deleted_at" | "return_pending_at"
      >
    | null
    | undefined,
  queueItems: QueueItemRecord[],
  referenceDate = new Date(),
) {
  if (attendance?.deleted_at || attendance?.canceled_at) {
    return false;
  }

  if (!queueItems.length) {
    return false;
  }

  return queueItems.every(
    (item) =>
      item.status === "aguardando" &&
      !isQueueItemReturnPending({ ...item, attendance }, referenceDate),
  );
}

function getAttendanceStatusBeforeDeletion(
  attendance: AttendanceRecord,
  queueItems: QueueItemRecord[],
  referenceDate = new Date(),
) {
  return getAttendanceOverallStatus(
    {
      ...attendance,
      deleted_at: null,
    },
    queueItems,
    referenceDate,
  );
}

export function getQueueItemQueueStartAt(
  item: Pick<QueueItemRecord, "created_at" | "reactivated_at"> & {
    attendance?: Pick<AttendanceRecord, "created_at"> | null;
  },
) {
  return item.reactivated_at ?? item.attendance?.created_at ?? item.created_at;
}

export function isClinicDateBefore(value: string, referenceDate: Date) {
  const left = getClinicDateParts(value);
  const right = getClinicDateParts(referenceDate);

  if (left.year !== right.year) {
    return left.year < right.year;
  }

  if (left.month !== right.month) {
    return left.month < right.month;
  }

  return left.day < right.day;
}

export function getAttendanceStepSummary(queueItems: QueueItemRecord[]) {
  const total = queueItems.length;
  const completed = queueItems.filter(
    (item) => item.status === "finalizado",
  ).length;

  return { completed, total };
}
