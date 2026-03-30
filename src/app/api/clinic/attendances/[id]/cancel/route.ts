import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import { normalizeAttendanceRecord, normalizeQueueItemRecord } from "@/lib/queue";
import { logServerError } from "@/lib/server-error";

type CancelAttendanceBody = {
  managerPassword?: string;
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

async function parseBody(request: Request) {
  try {
    return (await request.json()) as CancelAttendanceBody;
  } catch {
    return null;
  }
}

function getManagerApprovalPassword() {
  const managerApprovalPassword = process.env.MANAGER_APPROVAL_PASSWORD?.trim();

  if (!managerApprovalPassword) {
    throw new Error(
      "A variavel MANAGER_APPROVAL_PASSWORD e obrigatoria para cancelamentos.",
    );
  }

  return managerApprovalPassword;
}

function secretsMatch(input: string, expected: string) {
  const inputHash = createHash("sha256").update(input).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(inputHash, expectedHash);
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
  const managerPassword = body.managerPassword?.trim() ?? "";

  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Informe o motivo do cancelamento." },
      { status: 400 },
    );
  }

  if (!managerPassword) {
    return NextResponse.json(
      { error: "Informe a senha da gerencia." },
      { status: 400 },
    );
  }

  let expectedPassword: string;

  try {
    expectedPassword = getManagerApprovalPassword();
  } catch (error) {
    logServerError("cancel_attendance.load_approval_password", error);
    return NextResponse.json(
      { error: "Nao foi possivel validar a autorizacao da gerencia." },
      { status: 503 },
    );
  }

  if (!secretsMatch(managerPassword, expectedPassword)) {
    return NextResponse.json(
      { error: "Credenciais da gerencia invalidas." },
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
