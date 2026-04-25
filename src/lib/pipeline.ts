import type { SupabaseClient } from "@supabase/supabase-js";
import { EXAM_LABELS, EXAM_ORDER } from "@/lib/constants";
import type {
  Database,
  ExamType,
  Json,
  PipelineStatus,
  PipelineType,
} from "@/lib/database.types";

type PipelineClient = SupabaseClient<Database>;

const LAUDO_PIPELINE_EXAMS = new Set<ExamType>([
  "periapical",
  "interproximal",
  "panoramica",
  "tomografia",
]);

export const PIPELINE_ITEM_BASE_SELECT = `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, step_deadline, metadata, opened_at, updated_at, finished_at,
  attendances!inner ( patient_name, deleted_at ), profiles!pipeline_items_responsible_id_fkey ( full_name )`;

export type PipelineItemBaseRow = {
  id: string;
  attendance_id: string;
  queue_item_id: string | null;
  pipeline_type: PipelineType;
  status: PipelineStatus;
  responsible_id: string | null;
  sla_deadline: string | null;
  step_deadline: string | null;
  metadata: Json;
  opened_at: string;
  updated_at: string;
  finished_at: string | null;
  attendances: {
    deleted_at: string | null;
    patient_name: string;
  } | null;
  profiles: { full_name: string } | null;
};

export type PipelineLinkedExam = {
  id: string;
  exam_type: ExamType;
  requested_quantity: number;
};

export type PipelineItemRow = PipelineItemBaseRow & {
  exams: PipelineLinkedExam[];
};

type PipelineItemQueueItemLinkRow = {
  pipeline_item_id: string;
  queue_item_id: string;
};

type LegacyQueueItemRow = {
  id: string;
  attendance_id: string;
  com_laudo: boolean;
  created_at: string;
  exam_type: ExamType;
  finished_at: string | null;
  requested_quantity: number | null;
  updated_at: string;
};

function getQueueItemPipelineType(
  queueItem: LegacyQueueItemRow,
): PipelineType | null {
  if (queueItem.exam_type === "fotografia") {
    return "fotografia";
  }

  if (queueItem.exam_type === "escaneamento_intra_oral") {
    return "escaneamento";
  }

  if (queueItem.exam_type === "telerradiografia") {
    return "cefalometria";
  }

  if (queueItem.com_laudo && LAUDO_PIPELINE_EXAMS.has(queueItem.exam_type)) {
    return "laudo";
  }

  return null;
}

function getQueueItemPipelineEventAt(queueItem: LegacyQueueItemRow) {
  return queueItem.finished_at ?? queueItem.updated_at ?? queueItem.created_at;
}

function inferPipelineExamsFromQueueItems(
  items: PipelineItemBaseRow[],
  queueItems: LegacyQueueItemRow[],
) {
  const inferred = new Map<string, PipelineLinkedExam[]>();

  for (const queueItem of queueItems) {
    const pipelineType = getQueueItemPipelineType(queueItem);

    if (!pipelineType) {
      continue;
    }

    // Para laudo, tenta match direto pelo queue_item_id legado primeiro
    const directMatch =
      pipelineType === "laudo"
        ? items.find(
            (item) =>
              item.queue_item_id === queueItem.id &&
              item.pipeline_type === pipelineType,
          )
        : undefined;

    const eventAt = new Date(getQueueItemPipelineEventAt(queueItem)).getTime();
    const matchedItem =
      directMatch ??
      items
        .filter(
          (item) =>
            item.attendance_id === queueItem.attendance_id &&
            item.pipeline_type === pipelineType &&
            new Date(item.opened_at).getTime() <= eventAt,
        )
        .sort(
          (left, right) =>
            new Date(right.opened_at).getTime() -
            new Date(left.opened_at).getTime(),
        )[0];

    if (!matchedItem) {
      continue;
    }

    const current = inferred.get(matchedItem.id) ?? [];
    current.push(normalizePipelineExam(queueItem));
    inferred.set(matchedItem.id, current);
  }

  return inferred;
}

function sortPipelineExams(exams: PipelineLinkedExam[]) {
  return [...exams].sort((left, right) => {
    const leftIndex = EXAM_ORDER.indexOf(left.exam_type);
    const rightIndex = EXAM_ORDER.indexOf(right.exam_type);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.id.localeCompare(right.id);
  });
}

function normalizePipelineExam(
  row:
    | LegacyQueueItemRow
    | {
        id: string;
        exam_type: ExamType;
        requested_quantity: number | null;
      },
): PipelineLinkedExam {
  return {
    id: row.id,
    exam_type: row.exam_type,
    requested_quantity: row.requested_quantity ?? 1,
  };
}

export function getPipelineExamLabel(exam: PipelineLinkedExam) {
  const label = EXAM_LABELS[exam.exam_type] ?? exam.exam_type;
  return exam.requested_quantity > 1
    ? `${label} x${exam.requested_quantity}`
    : label;
}

export async function enrichPipelineItemsWithExams(
  supabase: PipelineClient,
  items: PipelineItemBaseRow[],
): Promise<PipelineItemRow[]> {
  if (!items.length) {
    return [];
  }

  const itemIds = items.map((item) => item.id);
  const examsByPipelineItemId = new Map<string, PipelineLinkedExam[]>();
  const pipelineItemIdByQueueItemId = new Map<string, string[]>();

  const { data: linksData, error: linksError } = await supabase
    .from("pipeline_item_queue_items")
    .select("pipeline_item_id, queue_item_id")
    .in("pipeline_item_id", itemIds);

  const shouldUseLegacyFallbackOnly = Boolean(linksError);

  if (!shouldUseLegacyFallbackOnly) {
    for (const row of (linksData ?? []) as PipelineItemQueueItemLinkRow[]) {
      const current = pipelineItemIdByQueueItemId.get(row.queue_item_id) ?? [];
      current.push(row.pipeline_item_id);
      pipelineItemIdByQueueItemId.set(row.queue_item_id, current);
    }
  }

  const fallbackExamsByQueueItemId = new Map<string, PipelineLinkedExam>();
  const missingLegacyQueueItemIds = items
    .map((item) => item.queue_item_id)
    .filter((queueItemId): queueItemId is string => Boolean(queueItemId))
    .filter((queueItemId) => !pipelineItemIdByQueueItemId.has(queueItemId))
    .filter((value, index, current) => current.indexOf(value) === index);

  if (shouldUseLegacyFallbackOnly) {
    const attendanceIds = Array.from(
      new Set(items.map((item) => item.attendance_id)),
    );

    const { data: attendanceQueueItems, error: attendanceQueueItemsError } =
      await supabase
        .from("queue_items")
        .select(
          "id, attendance_id, com_laudo, created_at, exam_type, finished_at, requested_quantity, updated_at",
        )
        .in("attendance_id", attendanceIds);

    if (attendanceQueueItemsError) {
      throw attendanceQueueItemsError;
    }

    const inferredExamsByPipelineItemId = inferPipelineExamsFromQueueItems(
      items,
      (attendanceQueueItems ?? []) as LegacyQueueItemRow[],
    );

    for (const [pipelineItemId, exams] of inferredExamsByPipelineItemId.entries()) {
      examsByPipelineItemId.set(pipelineItemId, exams);
    }
  } else {
    const linkedQueueItemIds = Array.from(pipelineItemIdByQueueItemId.keys());
    const queueItemIdsToFetch = Array.from(
      new Set([...linkedQueueItemIds, ...missingLegacyQueueItemIds]),
    );

    if (queueItemIdsToFetch.length) {
      const { data: legacyQueueItems, error: legacyQueueItemsError } =
        await supabase
          .from("queue_items")
          .select(
            "id, attendance_id, com_laudo, created_at, exam_type, finished_at, requested_quantity, updated_at",
          )
          .in("id", queueItemIdsToFetch);

      if (legacyQueueItemsError) {
        throw legacyQueueItemsError;
      }

      for (const row of (legacyQueueItems ?? []) as LegacyQueueItemRow[]) {
        const normalizedExam = normalizePipelineExam(row);
        fallbackExamsByQueueItemId.set(row.id, normalizedExam);

        const linkedPipelineItemIds = pipelineItemIdByQueueItemId.get(row.id) ?? [];

        for (const pipelineItemId of linkedPipelineItemIds) {
          const current = examsByPipelineItemId.get(pipelineItemId) ?? [];
          current.push(normalizedExam);
          examsByPipelineItemId.set(pipelineItemId, current);
        }
      }
    }
  }

  return items.map((item) => {
    const exams = examsByPipelineItemId.get(item.id) ?? [];
    const legacyFallback =
      item.queue_item_id
        ? fallbackExamsByQueueItemId.get(item.queue_item_id)
        : null;
    const uniqueExams = new Map<string, PipelineLinkedExam>();

    for (const exam of exams) {
      uniqueExams.set(exam.id, exam);
    }

    if (legacyFallback) {
      uniqueExams.set(legacyFallback.id, legacyFallback);
    }

    return {
      ...item,
      exams: sortPipelineExams(Array.from(uniqueExams.values())),
    } satisfies PipelineItemRow;
  });
}
