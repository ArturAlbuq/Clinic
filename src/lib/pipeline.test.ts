import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichPipelineItemsWithExams,
  type PipelineItemBaseRow,
} from "@/lib/pipeline";

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createSupabaseStub({
  linksResult,
  queueItemsByAttendanceResult,
}: {
  linksResult: QueryResult;
  queueItemsByAttendanceResult: QueryResult;
}) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in(column: string) {
              if (table === "pipeline_item_queue_items") {
                return Promise.resolve(linksResult);
              }

              if (table === "queue_items" && column === "attendance_id") {
                return Promise.resolve(queueItemsByAttendanceResult);
              }

              throw new Error(`Unexpected query: ${table}.${column}`);
            },
          };
        },
      };
    },
  };
}

test(
  "enrichPipelineItemsWithExams infere exames do laudo quando a tabela de links nao esta acessivel",
  async () => {
    const openedAt = "2026-04-21T22:30:01.835444+00:00";
    const items: PipelineItemBaseRow[] = [
      {
        id: "pipeline-laudo-1",
        attendance_id: "attendance-1",
        attendances: {
          deleted_at: null,
          patient_name: "Paciente Teste",
        },
        finished_at: null,
        metadata: { source_exam_type: "periapical" },
        opened_at: openedAt,
        pipeline_type: "laudo",
        profiles: null,
        queue_item_id: "queue-item-periapical",
        responsible_id: null,
        sla_deadline: null,
        step_deadline: null,
        status: "nao_iniciado",
        updated_at: openedAt,
      },
    ];

    const supabase = createSupabaseStub({
      linksResult: {
        data: null,
        error: {
          code: "PGRST205",
          message:
            "Could not find the table 'public.pipeline_item_queue_items' in the schema cache",
        },
      },
      queueItemsByAttendanceResult: {
        data: [
          {
            id: "queue-item-panoramica",
            attendance_id: "attendance-1",
            com_laudo: true,
            created_at: "2026-04-21T22:29:39.376254+00:00",
            exam_type: "panoramica",
            finished_at: "2026-04-21T22:30:12.638695+00:00",
            requested_quantity: 1,
            updated_at: "2026-04-21T22:30:12.638695+00:00",
          },
          {
            id: "queue-item-periapical",
            attendance_id: "attendance-1",
            com_laudo: true,
            created_at: "2026-04-21T22:29:39.376254+00:00",
            exam_type: "periapical",
            finished_at: "2026-04-21T22:30:01.835444+00:00",
            requested_quantity: 1,
            updated_at: "2026-04-21T22:30:01.835444+00:00",
          },
          {
            id: "queue-item-interproximal",
            attendance_id: "attendance-1",
            com_laudo: true,
            created_at: "2026-04-21T22:29:39.376254+00:00",
            exam_type: "interproximal",
            finished_at: "2026-04-21T22:30:02.338181+00:00",
            requested_quantity: 1,
            updated_at: "2026-04-21T22:30:02.338181+00:00",
          },
          {
            id: "queue-item-tomografia",
            attendance_id: "attendance-1",
            com_laudo: true,
            created_at: "2026-04-21T22:29:39.376254+00:00",
            exam_type: "tomografia",
            finished_at: "2026-04-21T22:30:22.718527+00:00",
            requested_quantity: 1,
            updated_at: "2026-04-21T22:30:22.718527+00:00",
          },
        ],
        error: null,
      },
    });

    const [hydratedItem] = await enrichPipelineItemsWithExams(
      supabase as never,
      items,
    );

    assert.ok(hydratedItem);
    assert.deepEqual(
      hydratedItem.exams.map((exam) => exam.exam_type),
      ["periapical", "interproximal", "panoramica", "tomografia"],
    );
  },
);
