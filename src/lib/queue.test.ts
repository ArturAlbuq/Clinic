import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import {
  getAttendanceOverallStatus,
  getNextStatus,
  getRangeBounds,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";

function buildAttendance(
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return {
    created_at: "2026-03-25T10:00:00.000Z",
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
    created_at: "2026-03-25T10:00:00.000Z",
    created_by: "profile-1",
    exam_type: "panoramico",
    finished_at: null,
    id: "queue-item-1",
    notes: null,
    patient_name: "Paciente Teste",
    room_slug: "panoramico",
    started_at: null,
    status: "aguardando",
    updated_at: "2026-03-25T10:00:00.000Z",
    updated_by: null,
    ...overrides,
  };
}

test("getNextStatus respeita o fluxo operacional", () => {
  assert.equal(getNextStatus("aguardando"), "chamado");
  assert.equal(getNextStatus("chamado"), "em_atendimento");
  assert.equal(getNextStatus("em_atendimento"), "finalizado");
  assert.equal(getNextStatus("finalizado"), null);
});

test("getAttendanceOverallStatus deriva a situação corretamente", () => {
  assert.equal(getAttendanceOverallStatus([]), "aguardando");
  assert.equal(
    getAttendanceOverallStatus([
      buildQueueItem({ status: "aguardando" }),
      buildQueueItem({ id: "queue-item-2", status: "aguardando" }),
    ]),
    "aguardando",
  );
  assert.equal(
    getAttendanceOverallStatus([
      buildQueueItem({ status: "finalizado" }),
      buildQueueItem({ id: "queue-item-2", status: "finalizado" }),
    ]),
    "finalizado",
  );
  assert.equal(
    getAttendanceOverallStatus([
      buildQueueItem({ status: "finalizado" }),
      buildQueueItem({ id: "queue-item-2", status: "em_atendimento" }),
    ]),
    "em_andamento",
  );
});

test("sortAttendancesByPriorityAndCreatedAt ordena por prioridade e chegada", () => {
  const ordered = sortAttendancesByPriorityAndCreatedAt([
    buildAttendance({
      created_at: "2026-03-25T10:05:00.000Z",
      id: "attendance-normal",
      priority: "normal",
    }),
    buildAttendance({
      created_at: "2026-03-25T10:10:00.000Z",
      id: "attendance-alta",
      priority: "alta",
    }),
    buildAttendance({
      created_at: "2026-03-25T10:00:00.000Z",
      id: "attendance-urgente",
      priority: "urgente",
    }),
  ]);

  assert.deepEqual(
    ordered.map((attendance) => attendance.id),
    ["attendance-urgente", "attendance-alta", "attendance-normal"],
  );
});

test("getRangeBounds monta o recorte do trimestre corretamente", () => {
  const range = getRangeBounds("quarter", new Date("2026-05-18T12:00:00.000Z"));

  assert.equal(range.startIso, "2026-04-01T03:00:00.000Z");
  assert.equal(range.endIso, "2026-07-01T03:00:00.000Z");
});
