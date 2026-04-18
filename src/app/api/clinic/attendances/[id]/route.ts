import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type {
  AttendanceRecord,
  ExamType,
  QueueItemRecord,
} from "@/lib/database.types";
import {
  normalizeAttendanceRecord,
  normalizeQueueItemRecord,
} from "@/lib/queue";
import { logServerError } from "@/lib/server-error";

type UpdateAttendanceBody = {
  examQuantities?: Partial<Record<ExamType, number>>;
  notes?: string;
  patientName?: string;
  patientRegistrationNumber?: string;
};

type DeleteAttendanceBody = {
  reason?: string;
};

const ALLOWED_EXAMS = new Set<ExamType>([
  "fotografia",
  "escaneamento_intra_oral",
  "periapical",
  "interproximal",
  "panoramica",
  "telerradiografia",
  "tomografia",
]);

function normalizeExamQuantities(input: Partial<Record<ExamType, number>> | undefined) {
  const normalized: Partial<Record<ExamType, number>> = {};

  for (const [examType, rawValue] of Object.entries(input ?? {})) {
    if (!ALLOWED_EXAMS.has(examType as ExamType)) {
      continue;
    }

    const parsed = Number(rawValue);
    normalized[examType as ExamType] =
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 99) : 1;
  }

  return normalized;
}

async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRegistrationNumberMigrationError(message?: string | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes("patient_registration_number") ||
    message.includes("p_patient_registration_number")
  );
}

function mapRpcError(message?: string | null) {
  if (!message) {
    return { message: "Nao foi possivel atualizar o atendimento.", status: 400 };
  }

  if (message.includes("atendimento nao encontrado")) {
    return { message: "Atendimento nao encontrado.", status: 404 };
  }

  if (message.includes("sem permissao")) {
    return { message: "Voce nao tem permissao para esta acao.", status: 403 };
  }

  if (message.includes("atendimento ja excluido")) {
    return { message: "Atendimento ja excluido.", status: 409 };
  }

  if (message.includes("atendimento em movimentacao nao pode ser excluido")) {
    return {
      message:
        "Atendimento com movimentacao nao pode ser excluido. Use o cancelamento para preservar o historico.",
      status: 409,
    };
  }

  if (message.includes("motivo de exclusao obrigatorio")) {
    return { message: "Motivo da exclusao obrigatorio.", status: 409 };
  }

  if (
    message.includes("nome do paciente invalido") ||
    message.includes("selecione ao menos um exame") ||
    message.includes("nao pode ser removido") ||
    message.includes("nao pode ser alterada apos iniciar") ||
    message.includes("cancelado nao pode ser editado") ||
    message.includes("recepcao so pode editar atendimento antes da chamada")
  ) {
    return { message: message.replace(/^./, (value) => value.toUpperCase()), status: 409 };
  }

  return { message: "Nao foi possivel atualizar o atendimento.", status: 400 };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }

  const { supabase } = await requireRole(["recepcao", "admin"]);
  const { id } = await context.params;
  const body = await parseBody<UpdateAttendanceBody>(request);

  if (!body) {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  const patientName = body.patientName?.trim() ?? "";
  const patientRegistrationNumber = body.patientRegistrationNumber?.trim() ?? "";
  const notes = body.notes?.trim() ?? "";
  const examQuantities = normalizeExamQuantities(body.examQuantities);

  if (patientName.length < 2) {
    return jsonError("Informe um nome de paciente com pelo menos 2 caracteres.", 400);
  }

  if (!Object.keys(examQuantities).length) {
    return jsonError("Selecione ao menos um exame valido.", 400);
  }

  const { data, error } = await supabase.rpc("update_attendance_registration", {
    p_attendance_id: id,
    p_exam_quantities: examQuantities,
    p_notes: notes || null,
    p_patient_name: patientName,
    p_patient_registration_number: patientRegistrationNumber || null,
  });

  if (error || !data) {
    logServerError("update_attendance_registration.rpc", error);
    if (isRegistrationNumberMigrationError(error?.message)) {
      return jsonError(
        "Banco desatualizado. Aplique as migrations do projeto e tente novamente.",
        503,
      );
    }
    const mapped = mapRpcError(error?.message);
    return jsonError(mapped.message, mapped.status);
  }

  const payload = data as {
    attendance: AttendanceRecord;
    queueItems: QueueItemRecord[];
  };

  return NextResponse.json({
    attendance: normalizeAttendanceRecord(payload.attendance),
    queueItems: (payload.queueItems ?? []).map((item) =>
      normalizeQueueItemRecord(item as QueueItemRecord),
    ),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }

  const { supabase } = await requireRole("admin");
  const { id } = await context.params;
  const body = await parseBody<DeleteAttendanceBody>(request);
  const reason = body?.reason?.trim() ?? "";

  if (reason.length < 3) {
    return jsonError("Informe o motivo da exclusao com pelo menos 3 caracteres.", 400);
  }

  const { data, error } = await supabase.rpc("delete_attendance", {
    p_attendance_id: id,
    p_reason: reason,
  });

  if (error || !data) {
    logServerError("delete_attendance.rpc", error);
    const mapped = mapRpcError(error?.message);
    return jsonError(
      mapped.status === 404 ? mapped.message : "Nao foi possivel excluir o atendimento.",
      mapped.status === 404 ? mapped.status : 400,
    );
  }

  const payload = data as {
    attendance: AttendanceRecord;
  };

  return NextResponse.json({
    attendance: normalizeAttendanceRecord(payload.attendance),
    success: true,
  });
}
