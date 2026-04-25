import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import {
  normalizeAttendanceRecord,
  normalizeQueueItemRecord,
} from "@/lib/queue";

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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validateSameOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateBody(value: unknown): UpdateFlagsBody | null {
  if (!isRecord(value)) {
    return null;
  }

  const attendanceId =
    typeof value.attendanceId === "string" ? value.attendanceId.trim() : "";

  if (
    !attendanceId ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
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

async function validateQueueItemsBelongToAttendance(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  attendanceId: string,
  queueItemIds: string[],
) {
  const uniqueQueueItemIds = Array.from(new Set(queueItemIds));
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, attendance_id")
    .in("id", uniqueQueueItemIds);

  if (error) {
    logServerError("queue_items.validate_update_flags", error);
    return false;
  }

  const rows = (data ?? []) as Pick<QueueItemRecord, "id" | "attendance_id">[];

  if (rows.length !== uniqueQueueItemIds.length) {
    return false;
  }

  return rows.every((row) => row.attendance_id === attendanceId);
}

export async function POST(request: Request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase } = await requireRole("admin");

  let body: UpdateFlagsBody | null = null;
  try {
    body = validateBody(await request.json());
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body) {
    return jsonError("Dados da requisicao invalidos.", 400);
  }

  const queueItemsAreValid = await validateQueueItemsBelongToAttendance(
    supabase,
    body.attendanceId,
    body.items.map((item) => item.queueItemId),
  );

  if (!queueItemsAreValid) {
    return jsonError("Exames invalidos para o atendimento.", 400);
  }

  const updatedQueueItems: QueueItemRecord[] = [];
  let updatedAttendance: AttendanceRecord | null = null;

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

    const result = data as {
      queueItem: QueueItemRecord;
      attendance: AttendanceRecord;
    };

    updatedQueueItems.push(result.queueItem);
    updatedAttendance = result.attendance;
  }

  if (!updatedAttendance) {
    return jsonError("Nenhum item foi processado.", 400);
  }

  return NextResponse.json({
    attendance: normalizeAttendanceRecord(updatedAttendance),
    queueItems: updatedQueueItems.map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  });
}
