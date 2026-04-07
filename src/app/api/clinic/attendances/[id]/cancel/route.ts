import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import { normalizeAttendanceRecord, normalizeQueueItemRecord } from "@/lib/queue";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";

type CancelAttendanceBody = {
  password?: string;
  reason?: string;
};

type CancelAttendancePayload = {
  attendance: AttendanceRecord;
  queueItems: QueueItemRecord[];
};

function normalizeCancelPayload(payload: CancelAttendancePayload) {
  return {
    attendance: normalizeAttendanceRecord(payload.attendance),
    queueItems: payload.queueItems.map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  } satisfies CancelAttendancePayload;
}

function mapCancelAttendanceError(message?: string | null) {
  if (!message) {
    return {
      error: "Nao foi possivel cancelar o atendimento.",
      status: 400,
    };
  }

  if (message.includes("Could not find the function public.cancel_attendance")) {
    return {
      error: "Cancelamento indisponivel ate atualizar o banco.",
      status: 503,
    };
  }

  if (message.includes("atendimento nao encontrado")) {
    return {
      error: "Atendimento nao encontrado.",
      status: 404,
    };
  }

  if (message.includes("atendimento ja cancelado")) {
    return {
      error: "Atendimento ja cancelado.",
      status: 409,
    };
  }

  if (message.includes("atendimento sem etapas abertas")) {
    return {
      error: "Atendimento sem etapas abertas para cancelamento.",
      status: 409,
    };
  }

  if (message.includes("motivo de cancelamento obrigatorio")) {
    return {
      error: "Informe o motivo do cancelamento.",
      status: 400,
    };
  }

  return {
    error: "Nao foi possivel cancelar o atendimento.",
    status: 400,
  };
}

const CANCELLATION_PASSWORD = "cancel@opi123";

async function parseBody(request: Request) {
  try {
    return (await request.json()) as CancelAttendanceBody;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const { supabase } = await requireRole(["atendimento", "admin"]);
  const { id } = await context.params;
  const body = await parseBody(request);

  if (!body) {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido." },
      { status: 400 },
    );
  }

  const reason = body.reason?.trim() ?? "";
  const password = body.password?.trim() ?? "";

  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Informe o motivo do cancelamento." },
      { status: 400 },
    );
  }

  if (!password) {
    return NextResponse.json(
      { error: "Informe a senha de cancelamento." },
      { status: 400 },
    );
  }

  if (password !== CANCELLATION_PASSWORD) {
    return NextResponse.json(
      { error: "Senha de cancelamento invalida." },
      { status: 403 },
    );
  }

  const cancelAttempt = await supabase.rpc("cancel_attendance", {
    p_attendance_id: id,
    p_authorized_by: null,
    p_reason: reason,
  });

  const payload = cancelAttempt.data as CancelAttendancePayload | null;

  if (cancelAttempt.error || !payload) {
    logServerError("cancel_attendance.rpc", cancelAttempt.error);
    const clientError = mapCancelAttendanceError(cancelAttempt.error?.message);

    return NextResponse.json(
      {
        error: clientError.error,
      },
      { status: clientError.status },
    );
  }

  return NextResponse.json(normalizeCancelPayload(payload));
}
