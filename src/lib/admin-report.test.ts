import assert from "node:assert/strict";
import test from "node:test";
import type {
  AttendanceRecord,
  ExamRoomRecord,
  QueueItemRecord,
} from "@/lib/database.types";
import {
  buildRoomSummaries,
  groupRoomReportItemsByExam,
} from "@/lib/admin-report";
import { combineQueueItemsWithAttendances } from "@/lib/queue";

function buildAttendance(
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return {
    canceled_at: null,
    canceled_by: null,
    cancellation_authorized_by: null,
    cancellation_reason: null,
    created_at: "2026-03-28T12:00:00.000Z",
    created_by: "profile-1",
    id: "attendance-1",
    legacy_single_queue_item_id: null,
    notes: null,
    patient_name: "Paciente Teste",
    priority: "normal",
    ...overrides,
  };
}

function buildQueueItem(
  overrides: Partial<QueueItemRecord> = {},
): QueueItemRecord {
  return {
    attendance_id: "attendance-1",
    called_at: null,
    called_by: null,
    canceled_at: null,
    created_at: "2026-03-28T12:00:00.000Z",
    created_by: "profile-1",
    exam_type: "fotografia",
    finished_at: null,
    finished_by: null,
    id: "queue-item-1",
    notes: null,
    patient_name: "Paciente Teste",
    requested_quantity: 1,
    room_slug: "fotografia-escaneamento",
    started_at: null,
    started_by: null,
    status: "aguardando",
    updated_at: "2026-03-28T12:00:00.000Z",
    updated_by: null,
    ...overrides,
  };
}

function buildRooms(): ExamRoomRecord[] {
  return [
    {
      created_at: "2026-03-28T12:00:00.000Z",
      name: "Fotos e escaneamento",
      slug: "fotografia-escaneamento",
      sort_order: 1,
    },
    {
      created_at: "2026-03-28T12:00:00.000Z",
      name: "Radiografia intra-oral",
      slug: "periapical",
      sort_order: 2,
    },
    {
      created_at: "2026-03-28T12:00:00.000Z",
      name: "Radiografia extra-oral",
      slug: "panoramico",
      sort_order: 3,
    },
    {
      created_at: "2026-03-28T12:00:00.000Z",
      name: "Tomografia",
      slug: "tomografia",
      sort_order: 4,
    },
  ];
}

test("groupRoomReportItemsByExam respeita a ordem operacional dos exames", () => {
  const attendances = [
    buildAttendance(),
    buildAttendance({ id: "attendance-2", patient_name: "Paciente 2" }),
  ];
  const items = combineQueueItemsWithAttendances(
    [
      buildQueueItem({
        attendance_id: "attendance-2",
        exam_type: "tomografia",
        id: "queue-item-4",
        room_slug: "tomografia",
      }),
      buildQueueItem({
        exam_type: "interproximal",
        finished_at: "2026-03-28T12:20:00.000Z",
        id: "queue-item-3",
        requested_quantity: 2,
        room_slug: "periapical",
        status: "finalizado",
      }),
      buildQueueItem({
        exam_type: "escaneamento_intra_oral",
        id: "queue-item-2",
        room_slug: "fotografia-escaneamento",
      }),
      buildQueueItem(),
    ],
    attendances,
  );

  const grouped = groupRoomReportItemsByExam(items, "todas");

  assert.deepEqual(
    grouped.map((entry) => entry.examType),
    ["fotografia", "escaneamento_intra_oral", "interproximal", "tomografia"],
  );
  assert.equal(grouped[2]?.totalQuantity, 2);
  assert.equal(grouped[2]?.finishedCount, 1);
});

test("buildRoomSummaries usa finalizados e detecta novo aguardando", () => {
  const nowMs = new Date("2026-03-28T12:02:00.000Z").getTime();
  const queueItems = [
    buildQueueItem({
      created_at: "2026-03-28T12:01:00.000Z",
      id: "queue-item-1",
      room_slug: "periapical",
      status: "aguardando",
    }),
    buildQueueItem({
      created_at: "2026-03-28T11:20:00.000Z",
      exam_type: "interproximal",
      finished_at: "2026-03-28T11:45:00.000Z",
      id: "queue-item-2",
      room_slug: "periapical",
      status: "finalizado",
    }),
  ];

  const summaries = buildRoomSummaries({
    attendances: [buildAttendance()],
    nowMs,
    queueItems,
    rooms: buildRooms(),
  });
  const periapicalSummary = summaries.find((entry) => entry.roomSlug === "periapical");

  assert.equal(periapicalSummary?.waitingCount, 1);
  assert.equal(periapicalSummary?.finishedCount, 1);
  assert.equal(periapicalSummary?.hasNewWaiting, true);
  assert.equal(periapicalSummary?.newWaitingCount, 1);
});
