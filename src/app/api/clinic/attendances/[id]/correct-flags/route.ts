import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";

type CorrectFlagsBody = {
  comCefalometria: boolean;
  comImpressaoFotografia: boolean;
  comLaboratorioExternoEscaneamento: boolean;
  comLaudoPerExam: Record<string, boolean>;
  reason: string;
};

function mapCorrectFlagsError(message?: string | null) {
  if (!message) {
    return {
      error: "Nao foi possivel corrigir as marcacoes.",
      status: 400,
    };
  }

  if (message.includes("sem permissao")) {
    return {
      error: "Voce nao tem permissao para esta acao.",
      status: 403,
    };
  }

  if (message.includes("atendimento nao encontrado")) {
    return {
      error: "Atendimento nao encontrado.",
      status: 404,
    };
  }

  if (message.includes("motivo deve ter")) {
    return {
      error: "Motivo deve ter pelo menos 3 caracteres.",
      status: 400,
    };
  }

  return {
    error: "Nao foi possivel corrigir as marcacoes.",
    status: 400,
  };
}

async function parseBody(request: Request) {
  try {
    return (await request.json()) as CorrectFlagsBody;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const { supabase } = await requireRole(["gerencia", "admin"]);
  const { id } = await context.params;
  const body = await parseBody(request);

  if (!body) {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido." },
      { status: 400 },
    );
  }

  const reason = body.reason?.trim() ?? "";
  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Motivo deve ter pelo menos 3 caracteres." },
      { status: 400 },
    );
  }

  if (
    typeof body.comCefalometria !== "boolean" ||
    typeof body.comImpressaoFotografia !== "boolean" ||
    typeof body.comLaboratorioExternoEscaneamento !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Campos de marcacao invalidos." },
      { status: 400 },
    );
  }

  const correctFlagsAttempt = await supabase.rpc("correct_exam_flags", {
    p_attendance_id: id,
    p_com_cefalometria: body.comCefalometria,
    p_com_impressao_fotografia: body.comImpressaoFotografia,
    p_com_laboratorio_externo_escaneamento:
      body.comLaboratorioExternoEscaneamento,
    p_com_laudo_per_exam: body.comLaudoPerExam,
    p_reason: reason,
  });

  const data = correctFlagsAttempt.data;

  if (correctFlagsAttempt.error || !data) {
    logServerError("correct_exam_flags.rpc", correctFlagsAttempt.error);
    const clientError = mapCorrectFlagsError(correctFlagsAttempt.error?.message);

    return NextResponse.json(
      {
        error: clientError.error,
      },
      { status: clientError.status },
    );
  }

  return NextResponse.json(data);
}
