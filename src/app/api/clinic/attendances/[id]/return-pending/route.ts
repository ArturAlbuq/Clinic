import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { AttendanceRecord } from "@/lib/database.types";
import { normalizeAttendanceRecord } from "@/lib/queue";
import { logServerError } from "@/lib/server-error";

type ReturnPendingBody = {
  isPending?: boolean;
  reason?: string;
};

async function parseBody(request: Request) {
  try {
    return (await request.json()) as ReturnPendingBody;
  } catch {
    return null;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }

  const { profile, supabase } = await requireRole([
    "recepcao",
    "atendimento",
    "admin",
  ]);
  const { id } = await context.params;
  const body = await parseBody(request);

  if (!body || typeof body.isPending !== "boolean") {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  const { data, error } = await supabase.rpc("set_attendance_return_pending", {
    p_attendance_id: id,
    p_is_pending: body.isPending,
    p_reason: body.reason?.trim() || null,
  });

  if (error || !data) {
    logServerError("set_attendance_return_pending.rpc", error);
    const message = error?.message ?? "";

    if (message.includes("atendimento nao encontrado")) {
      return jsonError("Atendimento nao encontrado.", 404);
    }

    if (message.includes("sem permissao")) {
      if (profile.role === "recepcao") {
        return jsonError(
          "Atualize o banco para liberar a pendencia de retorno na recepcao.",
          503,
        );
      }

      return jsonError("Voce nao tem permissao para esta acao.", 403);
    }

    if (message.includes("motivo de retorno obrigatorio")) {
      return jsonError("Informe o motivo da pendencia de retorno.", 400);
    }

    return jsonError("Nao foi possivel atualizar a marcacao de retorno.", 400);
  }

  const payload = data as {
    attendance: AttendanceRecord;
  };

  return NextResponse.json({
    attendance: normalizeAttendanceRecord(payload.attendance),
  });
}
