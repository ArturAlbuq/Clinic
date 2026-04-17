import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";

type RepeatExamRequestBody = {
  reason?: unknown;
};

type RegisterExamRepetitionResult = {
  repetitionId?: string;
  success?: boolean;
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

async function parseBody(request: Request) {
  try {
    return (await request.json()) as RepeatExamRequestBody;
  } catch {
    return null;
  }
}

function validateReason(reason: unknown) {
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";

  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    return null;
  }

  return normalizedReason;
}

function mapRegisterExamRepetitionError(message?: string | null) {
  if (!message) {
    return {
      error: "Erro ao registrar repeticao. Tente novamente.",
      status: 500,
    };
  }

  if (
    message.includes(
      "Could not find the function public.register_exam_repetition",
    )
  ) {
    return {
      error: "Registro de repeticao indisponivel ate atualizar o banco.",
      status: 503,
    };
  }

  if (message.includes("item da fila nao encontrado")) {
    return {
      error: "Item da fila nao encontrado.",
      status: 404,
    };
  }

  if (message.includes("status invalido para repeticao")) {
    return {
      error: "So e permitido repetir exames em atendimento ou finalizados.",
      status: 409,
    };
  }

  if (message.includes("motivo deve ter entre 3 e 500 caracteres")) {
    return {
      error: "Motivo deve ter entre 3 e 500 caracteres.",
      status: 400,
    };
  }

  if (message.includes("sem permissao")) {
    return {
      error: "Apenas atendentes podem registrar repeticoes de exame.",
      status: 403,
    };
  }

  if (message.includes("autenticacao obrigatoria")) {
    return {
      error: "Nao autenticado.",
      status: 401,
    };
  }

  return {
    error: "Erro ao registrar repeticao. Tente novamente.",
    status: 500,
  };
}

async function runDirectRegisterExamRepetition(
  queueItemId: string,
  technicianId: string,
  reason: string,
) {
  const adminSupabase = getAdminSupabaseClient();

  const queueItemResult = await adminSupabase
    .from("queue_items")
    .select("id, exam_type, room_slug, status, deleted_at")
    .eq("id", queueItemId)
    .maybeSingle();

  const queueItem = queueItemResult.data;

  if (queueItemResult.error) {
    logServerError(
      "register_exam_repetition.direct_fetch_queue_item",
      queueItemResult.error,
    );
    return jsonError("Erro ao registrar repeticao. Tente novamente.", 500);
  }

  if (!queueItem || queueItem.deleted_at) {
    return jsonError("Item da fila nao encontrado.", 404);
  }

  if (
    queueItem.status !== "em_atendimento" &&
    queueItem.status !== "finalizado"
  ) {
    return jsonError(
      "So e permitido repetir exames em atendimento ou finalizados.",
      409,
    );
  }

  const priorCountResult = await adminSupabase
    .from("queue_items")
    .select("id", { count: "exact", head: true })
    .eq("exam_type", queueItem.exam_type)
    .eq("status", "finalizado")
    .neq("id", queueItemId);

  if (priorCountResult.error) {
    logServerError(
      "register_exam_repetition.direct_count_prior",
      priorCountResult.error,
    );
    return jsonError("Erro ao registrar repeticao. Tente novamente.", 500);
  }

  const repetitionIndex = Math.max(priorCountResult.count ?? 0, 1);

  const upsertResult = await adminSupabase
    .from("exam_repetitions")
    .upsert(
      {
        exam_type: queueItem.exam_type,
        queue_item_id: queueItemId,
        repetition_index: repetitionIndex,
        repetition_reason: reason,
        room_slug: queueItem.room_slug,
        technician_id: technicianId,
      },
      {
        onConflict: "queue_item_id",
      },
    )
    .select("id")
    .single();

  if (upsertResult.error || !upsertResult.data?.id) {
    logServerError("register_exam_repetition.direct_upsert", upsertResult.error);

    const message = upsertResult.error?.message ?? "";
    if (
      message.includes("repetition_reason") ||
      message.includes("register_exam_repetition") ||
      message.includes("schema cache")
    ) {
      return jsonError(
        "Registro de repeticao indisponivel ate atualizar o banco.",
        503,
      );
    }

    return jsonError("Erro ao registrar repeticao. Tente novamente.", 500);
  }

  return NextResponse.json(
    {
      repetitionId: upsertResult.data.id,
      success: true,
    },
    { status: 201 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const originError = validateSameOrigin(request);

  if (originError) {
    return originError;
  }

  const session = await getSessionContext();

  if (!session.userId || !session.profile) {
    return jsonError("Nao autenticado.", 401);
  }

  if (session.profile.role !== "atendimento") {
    return jsonError(
      "Apenas atendentes podem registrar repeticoes de exame.",
      403,
    );
  }

  const body = await parseBody(request);

  if (!body) {
    return jsonError("Body JSON invalido.", 400);
  }

  const reason = validateReason(body.reason);

  if (!reason) {
    return jsonError("Motivo deve ter entre 3 e 500 caracteres.", 400);
  }

  const { id } = await context.params;

  const registerAttempt = await session.supabase.rpc("register_exam_repetition", {
    p_queue_item_id: id,
    p_reason: reason,
  });

  const payload =
    (registerAttempt.data as RegisterExamRepetitionResult | null) ?? null;

  if (
    registerAttempt.error ||
    !payload?.success ||
    typeof payload.repetitionId !== "string"
  ) {
    if (
      registerAttempt.error?.message?.includes(
        "Could not find the function public.register_exam_repetition",
      )
    ) {
      return runDirectRegisterExamRepetition(id, session.profile.id, reason);
    }

    logServerError("register_exam_repetition.rpc", registerAttempt.error);
    const mapped = mapRegisterExamRepetitionError(registerAttempt.error?.message);
    return jsonError(mapped.error, mapped.status);
  }

  return NextResponse.json(
    {
      repetitionId: payload.repetitionId,
      success: true,
    },
    { status: 201 },
  );
}
