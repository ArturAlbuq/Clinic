import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import {
  normalizeAttendanceRecord,
  normalizeQueueItemRecord,
} from "@/lib/queue";
import { logServerError } from "@/lib/server-error";

type UpdateFlagsItem = {
  queueItemId: string;
  comLaudo: boolean;
};

type UpdateFlagsBody = {
  attendanceId: string;
  items: UpdateFlagsItem[];
  comCefalometria: boolean;
  comImpressaoFotografia: boolean;
  comLaboratorioExternoEscaneamento: boolean;
};

type UpdatePipelineFlagsResult = {
  queueItem: QueueItemRecord;
  attendance: AttendanceRecord;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBody(value: unknown): UpdateFlagsBody | null {
  if (!isRecord(value)) {
    return null;
  }

  const attendanceId =
    typeof value.attendanceId === "string" ? value.attendanceId.trim() : "";

  if (!attendanceId || !Array.isArray(value.items) || value.items.length === 0) {
    return null;
  }

  if (
    typeof value.comCefalometria !== "boolean" ||
    typeof value.comImpressaoFotografia !== "boolean" ||
    typeof value.comLaboratorioExternoEscaneamento !== "boolean"
  ) {
    return null;
  }

  const items: UpdateFlagsItem[] = [];

  for (const item of value.items) {
    if (!isRecord(item)) {
      return null;
    }

    const queueItemId =
      typeof item.queueItemId === "string" ? item.queueItemId.trim() : "";

    if (!queueItemId || typeof item.comLaudo !== "boolean") {
      return null;
    }

    items.push({
      queueItemId,
      comLaudo: item.comLaudo,
    });
  }

  return {
    attendanceId,
    items,
    comCefalometria: value.comCefalometria,
    comImpressaoFotografia: value.comImpressaoFotografia,
    comLaboratorioExternoEscaneamento:
      value.comLaboratorioExternoEscaneamento,
  };
}

function hasDuplicateQueueItemIds(items: UpdateFlagsItem[]) {
  return new Set(items.map((item) => item.queueItemId)).size !== items.length;
}

async function validateQueueItemsForUpdate(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  attendanceId: string,
  queueItemIds: string[],
) {
  const uniqueQueueItemIds = Array.from(new Set(queueItemIds));
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, attendance_id, status, deleted_at")
    .in("id", uniqueQueueItemIds);

  if (error) {
    logServerError("queue_items.validate_update_flags", error);
    return "Nao foi possivel validar os exames.";
  }

  const rows = (data ?? []) as Pick<
    QueueItemRecord,
    "id" | "attendance_id" | "status" | "deleted_at"
  >[];

  if (rows.length !== uniqueQueueItemIds.length) {
    return "Exames invalidos para edicao.";
  }

  if (rows.some((row) => row.attendance_id !== attendanceId)) {
    return "Exames invalidos para o atendimento.";
  }

  if (rows.some((row) => row.deleted_at)) {
    return "Exames excluidos nao podem ser editados.";
  }

  if (rows.some((row) => row.status === "cancelado")) {
    return "Exames cancelados nao podem ser editados.";
  }

  return null;
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }

  const { supabase } = await requireRole("admin");

  let body: UpdateFlagsBody | null;
  try {
    body = parseBody(await request.json());
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body) {
    return jsonError("attendanceId e items sao obrigatorios.", 400);
  }

  if (hasDuplicateQueueItemIds(body.items)) {
    return jsonError("Exames duplicados para edicao.", 400);
  }

  const queueItemsError = await validateQueueItemsForUpdate(
    supabase,
    body.attendanceId,
    body.items.map((item) => item.queueItemId),
  );

  if (queueItemsError) {
    return jsonError(queueItemsError, 400);
  }

  const queueItems: QueueItemRecord[] = [];
  let attendance: AttendanceRecord | null = null;

  for (const item of body.items) {
    const { data, error } = await supabase.rpc("update_pipeline_flags", {
      p_queue_item_id: item.queueItemId,
      p_com_laudo: item.comLaudo,
      p_com_cefalometria: body.comCefalometria,
      p_com_impressao_fotografia: body.comImpressaoFotografia,
      p_com_laboratorio_externo_escaneamento:
        body.comLaboratorioExternoEscaneamento,
    });

    if (error || !data) {
      logServerError("update_pipeline_flags.rpc", error);
      return jsonError("Nao foi possivel atualizar os flags.", 400);
    }

    const payload = data as UpdatePipelineFlagsResult;
    queueItems.push(payload.queueItem);
    attendance = payload.attendance;
  }

  if (!attendance) {
    return jsonError("Nenhum item foi processado.", 400);
  }

  return NextResponse.json({
    attendance: normalizeAttendanceRecord(attendance),
    queueItems: queueItems.map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  });
}
