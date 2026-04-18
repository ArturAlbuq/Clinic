import { NextResponse } from "next/server";
import { EXAM_ORDER } from "@/lib/constants";
import type { ExamType } from "@/lib/database.types";
import { getSessionContext } from "@/lib/auth";
import { clinicLocalDateToUtcDate } from "@/lib/date";
import { logServerError } from "@/lib/server-error";

type ExamRepetitionRow = {
  exam_type: ExamType;
  id: string;
  queue_item_id: string;
  repeated_at: string;
  repetition_reason: string | null;
  room_slug: string | null;
  technician_id: string | null;
};

type QueueItemLookupRow = {
  attendance_id: string;
  id: string;
  patient_name: string | null;
};

type AttendanceLookupRow = {
  id: string;
  patient_name: string;
  patient_registration_number: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseClinicDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const utcDate = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(utcDate);

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1000;
  }

  return Math.min(parsed, 5000);
}

export async function GET(request: Request) {
  const session = await getSessionContext();

  if (!session.userId || !session.profile) {
    return jsonError("Nao autenticado.", 401);
  }

  if (session.profile.role !== "admin") {
    return jsonError(
      "Apenas admin pode acessar relatorio de repeticoes.",
      403,
    );
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate") ?? "";
  const endDate = url.searchParams.get("endDate") ?? "";
  const technicianId = url.searchParams.get("technicianId") ?? "todos";
  const roomSlug = url.searchParams.get("roomSlug") ?? "todas";
  const examType = url.searchParams.get("examType") ?? "todos";
  const limit = parseLimit(url.searchParams.get("limit"));
  const examTypeFilter =
    examType !== "todos" && EXAM_ORDER.includes(examType as ExamType)
      ? (examType as ExamType)
      : null;

  const startParts = parseClinicDate(startDate);
  const endParts = parseClinicDate(endDate);

  if (!startParts || !endParts) {
    return jsonError(
      "startDate e endDate devem ser datas validas (YYYY-MM-DD).",
      400,
    );
  }

  const dayDiff =
    (Date.UTC(endParts.year, endParts.month - 1, endParts.day) -
      Date.UTC(startParts.year, startParts.month - 1, startParts.day)) /
    86_400_000;

  if (dayDiff < 0) {
    return jsonError("startDate nao pode ser maior que endDate.", 400);
  }

  if (dayDiff > 180) {
    return jsonError("Periodo nao pode exceder 180 dias.", 400);
  }

  const rangeStartIso = clinicLocalDateToUtcDate({
    year: startParts.year,
    month: startParts.month,
    day: startParts.day,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  }).toISOString();
  const rangeEndIso = clinicLocalDateToUtcDate({
    year: endParts.year,
    month: endParts.month,
    day: endParts.day,
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  }).toISOString();

  let repetitionsQuery = session.supabase
    .from("exam_repetitions")
    .select(
      "id, queue_item_id, exam_type, room_slug, technician_id, repeated_at, repetition_reason",
      { count: "exact" },
    )
    .gte("repeated_at", rangeStartIso)
    .lte("repeated_at", rangeEndIso)
    .order("repeated_at", { ascending: false })
    .limit(limit);

  if (technicianId !== "todos") {
    repetitionsQuery = repetitionsQuery.eq("technician_id", technicianId);
  }

  if (roomSlug !== "todas") {
    repetitionsQuery = repetitionsQuery.eq("room_slug", roomSlug);
  }

  if (examTypeFilter) {
    repetitionsQuery = repetitionsQuery.eq("exam_type", examTypeFilter);
  }

  const repetitionsResult = await repetitionsQuery;
  const repetitionRows =
    (repetitionsResult.data as ExamRepetitionRow[] | null) ?? [];

  if (repetitionsResult.error) {
    logServerError("exam_repetitions.list", repetitionsResult.error);
    return jsonError("Erro ao buscar repeticoes.", 500);
  }

  const queueItemIds = Array.from(
    new Set(repetitionRows.map((row) => row.queue_item_id)),
  );
  const queueItemMap = new Map<string, QueueItemLookupRow>();

  if (queueItemIds.length > 0) {
    const queueItemsResult = await session.supabase
      .from("queue_items")
      .select("id, attendance_id, patient_name")
      .in("id", queueItemIds);

    if (queueItemsResult.error) {
      logServerError("exam_repetitions.queue_items_lookup", queueItemsResult.error);
      return jsonError("Erro ao buscar repeticoes.", 500);
    }

    for (const row of ((queueItemsResult.data as QueueItemLookupRow[] | null) ?? [])) {
      queueItemMap.set(row.id, row);
    }
  }

  const attendanceIds = Array.from(
    new Set(
      Array.from(queueItemMap.values())
        .map((row) => row.attendance_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const attendanceMap = new Map<string, AttendanceLookupRow>();

  if (attendanceIds.length > 0) {
    const attendancesResult = await session.supabase
      .from("attendances")
      .select("id, patient_name, patient_registration_number")
      .in("id", attendanceIds);

    if (attendancesResult.error) {
      logServerError("exam_repetitions.attendances_lookup", attendancesResult.error);
      return jsonError("Erro ao buscar repeticoes.", 500);
    }

    for (const row of ((attendancesResult.data as AttendanceLookupRow[] | null) ?? [])) {
      attendanceMap.set(row.id, row);
    }
  }

  type RepetitionEntry = {
    id: string;
    repeated_at: string;
    repetition_reason: string | null;
    technician_id: string | null;
  };

  // Group by queue_item_id - each queue_item is a specific exam that can be repeated
  const groupByQueueItem = new Map<string, ExamRepetitionRow[]>();
  for (const row of repetitionRows) {
    const list = groupByQueueItem.get(row.queue_item_id) ?? [];
    list.push(row);
    groupByQueueItem.set(row.queue_item_id, list);
  }

  // Show only exams that were actually repeated (>= 1 registered repetition)
  // Each exam_repetitions row is one repetition event
  const data = Array.from(groupByQueueItem.entries())
    .map(([queueItemId, rows]) => {
      const latestRow = rows[0]; // sorted desc by repeated_at
      const queueItem = queueItemMap.get(queueItemId);
      const attendance = queueItem
        ? attendanceMap.get(queueItem.attendance_id)
        : undefined;

      const repetitions: RepetitionEntry[] = [...rows]
        .sort((a, b) => new Date(a.repeated_at).getTime() - new Date(b.repeated_at).getTime())
        .map((r) => ({
          id: r.id,
          repeated_at: r.repeated_at,
          repetition_reason: r.repetition_reason,
          technician_id: r.technician_id,
        }));

      return {
        exam_type: latestRow.exam_type,
        id: latestRow.id,
        patient_name: attendance?.patient_name ?? queueItem?.patient_name ?? null,
        patient_registration_number:
          attendance?.patient_registration_number ?? null,
        queue_item_id: queueItemId,
        repeated_at: latestRow.repeated_at,
        repetition_reason: latestRow.repetition_reason,
        repetition_count: rows.length,
        room_slug: latestRow.room_slug,
        technician_id: latestRow.technician_id,
        repetitions,
      };
    })
    .sort((a, b) => new Date(b.repeated_at).getTime() - new Date(a.repeated_at).getTime());

  return NextResponse.json({
    data,
    total: data.length,
  });
}
