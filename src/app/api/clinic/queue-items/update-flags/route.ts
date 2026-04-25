import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";

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

export async function POST(request: Request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase } = await requireRole("admin");

  let body: UpdateFlagsBody | null = null;
  try {
    body = (await request.json()) as UpdateFlagsBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (
    !body ||
    !body.attendanceId ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return jsonError("attendanceId e items sao obrigatorios.", 400);
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
    attendance: updatedAttendance,
    queueItems: updatedQueueItems,
  });
}
