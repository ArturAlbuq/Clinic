import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import {
  getAttendanceOverallStatus,
  getNextStatus,
  getQueueStageExecutionMinutes,
  getQueueStageTotalMinutes,
  getQueueWaitMinutes,
  getRangeBounds,
  sortRoomQueueItems,
  sortAttendancesByPriorityAndCreatedAt,
} from "@/lib/queue";

function buildAttendance(
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return {
    canceled_at: null,
    canceled_by: null,
    cancellation_authorized_by: null,
    cancellation_reason: null,
    created_at: "2026-03-25T10:00:00.000Z",
    created_by: "profile-1",
    deletion_reason: null,
    deleted_at: null,
    deleted_by: null,
    id: "attendance-1",
    legacy_single_queue_item_id: null,
    notes: null,
    patient_name: "Paciente Teste",
    patient_registration_number: null,
    priority: "normal",
    return_pending_at: null,
    return_pending_by: null,
    return_pending_reason: null,
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
    canceled_by: null,
    cancellation_authorized_by: null,
    cancellation_reason: null,
    created_at: "2026-03-25T10:00:00.000Z",
    created_by: "profile-1",
    deleted_at: null,
    deleted_by: null,
    exam_type: "panoramica",
    finished_at: null,
    finished_by: null,
    id: "queue-item-1",
    notes: null,
    patient_name: "Paciente Teste",
    requested_quantity: 1,
    reactivated_at: null,
    reactivated_by: null,
    room_slug: "panoramico",
    return_pending_at: null,
    return_pending_by: null,
    return_pending_reason: null,
    started_at: null,
    started_by: null,
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
  assert.equal(getNextStatus("cancelado"), null);
});

test("getAttendanceOverallStatus deriva a situacao corretamente", () => {
  const referenceDate = new Date("2026-03-25T12:00:00.000Z");

  assert.equal(
    getAttendanceOverallStatus(buildAttendance(), [], referenceDate),
    "aguardando",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance(),
      [
        buildQueueItem({ status: "aguardando" }),
        buildQueueItem({ id: "queue-item-2", status: "aguardando" }),
      ],
      referenceDate,
    ),
    "aguardando",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance({ created_at: "2026-03-24T10:00:00.000Z" }),
      [
        buildQueueItem({
          created_at: "2026-03-24T10:00:00.000Z",
          status: "aguardando",
        }),
      ],
      referenceDate,
    ),
    "pendente_retorno",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance(),
      [
        buildQueueItem({ status: "finalizado" }),
        buildQueueItem({ id: "queue-item-2", status: "finalizado" }),
      ],
      referenceDate,
    ),
    "finalizado",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance(),
      [
        buildQueueItem({ status: "finalizado" }),
        buildQueueItem({ id: "queue-item-2", status: "em_atendimento" }),
      ],
      referenceDate,
    ),
    "em_andamento",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance(),
      [
        buildQueueItem({ status: "finalizado" }),
        buildQueueItem({ id: "queue-item-2", status: "cancelado" }),
      ],
      referenceDate,
    ),
    "finalizado",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance({ canceled_at: "2026-03-25T10:20:00.000Z" }),
      [
        buildQueueItem({ status: "finalizado" }),
        buildQueueItem({ id: "queue-item-2", status: "cancelado" }),
      ],
      referenceDate,
    ),
    "cancelado",
  );
  assert.equal(
    getAttendanceOverallStatus(
      buildAttendance(),
      [
        buildQueueItem({
          reactivated_at: "2026-03-25T11:50:00.000Z",
          status: "aguardando",
        }),
      ],
      new Date("2026-03-25T12:00:00.000Z"),
    ),
    "aguardando",
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
      id: "attendance-sessenta",
      priority: "sessenta_mais_outras",
    }),
    buildAttendance({
      created_at: "2026-03-25T10:00:00.000Z",
      id: "attendance-oitenta",
      priority: "oitenta_mais",
    }),
  ]);

  assert.deepEqual(
    ordered.map((attendance) => attendance.id),
    ["attendance-oitenta", "attendance-sessenta", "attendance-normal"],
  );
});

test("getRangeBounds monta o recorte do trimestre corretamente em Manaus", () => {
  const range = getRangeBounds("quarter", new Date("2026-05-18T12:00:00.000Z"));

  assert.equal(range.startIso, "2026-04-01T04:00:00.000Z");
  assert.equal(range.endIso, "2026-07-01T04:00:00.000Z");
});

test("sortRoomQueueItems prioriza fluxo ativo e usa o horario operacional do status", () => {
  const attendance = buildAttendance();
  const ordered = sortRoomQueueItems([
    {
      ...buildQueueItem({
        attendance_id: "attendance-finalizado",
        finished_at: "2026-03-25T10:30:00.000Z",
        id: "finalizado-recente",
        status: "finalizado",
        updated_at: "2026-03-25T10:30:00.000Z",
      }),
      attendance: buildAttendance({ id: "attendance-finalizado" }),
    },
    {
      ...buildQueueItem({
        attendance_id: "attendance-aguardando",
        created_at: "2026-03-25T10:00:00.000Z",
        id: "aguardando-antigo",
        status: "aguardando",
      }),
      attendance: buildAttendance({
        created_at: "2026-03-25T10:00:00.000Z",
        id: "attendance-aguardando",
      }),
    },
    {
      ...buildQueueItem({
        attendance_id: "attendance-chamado",
        called_at: "2026-03-25T10:06:00.000Z",
        id: "chamado-antigo",
        status: "chamado",
      }),
      attendance: buildAttendance({ id: "attendance-chamado" }),
    },
    {
      ...buildQueueItem({
        attendance_id: "attendance-em-atendimento-2",
        id: "em-atendimento-recente",
        started_at: "2026-03-25T10:12:00.000Z",
        status: "em_atendimento",
      }),
      attendance: buildAttendance({ id: "attendance-em-atendimento-2" }),
    },
    {
      ...buildQueueItem({
        attendance_id: "attendance-em-atendimento-1",
        id: "em-atendimento-antigo",
        started_at: "2026-03-25T10:08:00.000Z",
        status: "em_atendimento",
      }),
      attendance: buildAttendance({ id: "attendance-em-atendimento-1" }),
    },
    {
      ...buildQueueItem({
        attendance_id: "attendance-cancelado",
        canceled_at: "2026-03-25T10:25:00.000Z",
        id: "cancelado-recente",
        status: "cancelado",
        updated_at: "2026-03-25T10:25:00.000Z",
      }),
      attendance: buildAttendance({
        canceled_at: "2026-03-25T10:25:00.000Z",
        id: "attendance-cancelado",
      }),
    },
    {
      ...buildQueueItem({
        attendance_id: attendance.id,
        id: "finalizado-antigo",
        finished_at: "2026-03-25T10:18:00.000Z",
        status: "finalizado",
        updated_at: "2026-03-25T10:18:00.000Z",
      }),
      attendance,
    },
  ]);

  assert.deepEqual(
    ordered.map((item) => item.id),
    [
      "em-atendimento-antigo",
      "em-atendimento-recente",
      "chamado-antigo",
      "aguardando-antigo",
      "finalizado-recente",
      "finalizado-antigo",
      "cancelado-recente",
    ],
  );
});

test("tempos da etapa congelam enquanto retorno pendente estiver ativo", () => {
  const pendingAt = "2026-03-25T10:20:00.000Z";
  const referenceNow = new Date("2026-03-25T10:45:00.000Z").getTime();
  const attendance = buildAttendance({
    return_pending_at: pendingAt,
  });
  const waitingItem = buildQueueItem({
    created_at: "2026-03-25T10:00:00.000Z",
    return_pending_at: pendingAt,
    status: "aguardando",
  });
  const activeItem = buildQueueItem({
    created_at: "2026-03-25T10:00:00.000Z",
    id: "queue-item-2",
    return_pending_at: pendingAt,
    started_at: "2026-03-25T10:05:00.000Z",
    status: "em_atendimento",
  });

  assert.equal(getQueueWaitMinutes({ ...waitingItem, attendance }, referenceNow), 20);
  assert.equal(
    getQueueStageExecutionMinutes({ ...activeItem, attendance }, referenceNow),
    15,
  );
  assert.equal(
    getQueueStageTotalMinutes({ ...activeItem, attendance }, referenceNow),
    20,
  );
});
