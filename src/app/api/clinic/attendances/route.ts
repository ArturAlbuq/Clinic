import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type {
  AttendancePriority,
  AttendanceRecord,
  ExamType,
  QueueItemRecord,
} from "@/lib/database.types";
import { normalizeAttendanceRecord, normalizeQueueItemRecord } from "@/lib/queue";
import { logServerError } from "@/lib/server-error";

type CreateAttendanceBody = {
  examQuantities?: Partial<Record<ExamType, number>>;
  notes?: string;
  patientName?: string;
  patientRegistrationNumber?: string;
  priority?: AttendancePriority;
  selectedExams?: ExamType[];
};

type AttendancePatchBody = {
  action?: "cancel" | "return-pending" | "update";
  attendanceId?: string;
  examQuantities?: Partial<Record<ExamType, number>>;
  isPending?: boolean;
  notes?: string;
  patientName?: string;
  patientRegistrationNumber?: string;
  reason?: string;
};

type DeleteAttendanceBody = {
  attendanceId?: string;
  reason?: string;
};

type CreateAttendancePayload = {
  attendance: AttendanceRecord;
  queueItems: QueueItemRecord[];
};

type AttendancePayload = {
  attendance: AttendanceRecord;
};

const ALLOWED_PRIORITIES = new Set<AttendancePriority>([
  "normal",
  "sessenta_mais_outras",
  "oitenta_mais",
]);

const ALLOWED_EXAMS = new Set<ExamType>([
  "fotografia",
  "escaneamento_intra_oral",
  "periapical",
  "interproximal",
  "panoramica",
  "telerradiografia",
  "tomografia",
]);

function normalizeExamQuantities(
  selectedExams: ExamType[],
  input: Partial<Record<ExamType, number>> | undefined,
) {
  const normalized: Partial<Record<ExamType, number>> = {};

  for (const examType of selectedExams) {
    const rawValue = input?.[examType];
    const quantity =
      typeof rawValue === "number" && Number.isInteger(rawValue) && rawValue > 0
        ? rawValue
        : 1;

    normalized[examType] = quantity;
  }

  return normalized;
}

function normalizeCreateAttendancePayload(
  payload: CreateAttendancePayload,
  examQuantities: Partial<Record<ExamType, number>>,
) {
  return {
    attendance: normalizeAttendanceRecord(payload.attendance),
    queueItems: payload.queueItems.map((queueItem) =>
      normalizeQueueItemRecord({
        ...queueItem,
        requested_quantity:
          queueItem.requested_quantity ?? examQuantities[queueItem.exam_type] ?? 1,
      } as QueueItemRecord),
    ),
  } satisfies CreateAttendancePayload;
}

function normalizeAttendanceMutationPayload(payload: CreateAttendancePayload) {
  return {
    attendance: normalizeAttendanceRecord(payload.attendance),
    queueItems: payload.queueItems.map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  } satisfies CreateAttendancePayload;
}

function isLegacyRpcSignatureError(message?: string | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes(
      "Could not find the function public.create_attendance_with_queue_items",
    ) && message.includes("p_exam_quantities")
  );
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

function isLegacyExamTypeEnumError(message?: string | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes("invalid input value for enum exam_type") ||
    message.includes("invalid input syntax for type public.exam_type")
  );
}

function normalizeUpdateExamQuantities(
  input: Partial<Record<ExamType, number>> | undefined,
) {
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

function mapAttendanceUpdateError(message?: string | null) {
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
    message.includes("cancelado nao pode ser editado")
  ) {
    return {
      message: message.replace(/^./, (value) => value.toUpperCase()),
      status: 409,
    };
  }

  return { message: "Nao foi possivel atualizar o atendimento.", status: 400 };
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
      error: "Atendimento sem exames abertos para cancelamento.",
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

async function parseBody<T>(request: Request) {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

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

  if (originError) {
    return originError;
  }

  const { supabase } = await requireRole(["recepcao", "admin"]);
  const body = await parseBody<CreateAttendanceBody>(request);

  if (!body) {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  const patientName = body.patientName?.trim() ?? "";
  const patientRegistrationNumber = body.patientRegistrationNumber?.trim() ?? "";
  const notes = body.notes?.trim() ?? "";
  const priority = body.priority;
  const selectedExams = Array.isArray(body.selectedExams) ? body.selectedExams : [];

  if (patientName.length < 2) {
    return NextResponse.json(
      { error: "Informe um nome de paciente com pelo menos 2 caracteres." },
      { status: 400 },
    );
  }

  if (!patientRegistrationNumber) {
    return NextResponse.json(
      { error: "Informe o numero do cadastro do paciente." },
      { status: 400 },
    );
  }

  if (!priority || !ALLOWED_PRIORITIES.has(priority)) {
    return NextResponse.json({ error: "Prioridade invalida." }, { status: 400 });
  }

  if (
    selectedExams.length === 0 ||
    selectedExams.some((examType) => !ALLOWED_EXAMS.has(examType))
  ) {
    return NextResponse.json(
      { error: "Selecione ao menos um exame valido." },
      { status: 400 },
    );
  }

  const examQuantities = normalizeExamQuantities(selectedExams, body.examQuantities);

  const attemptWithQuantities = await supabase.rpc(
    "create_attendance_with_queue_items",
    {
      p_exam_quantities: examQuantities,
      p_exam_types: selectedExams,
      p_notes: notes || null,
      p_patient_name: patientName,
      p_patient_registration_number: patientRegistrationNumber || null,
      p_priority: priority,
    },
  );

  let payload = attemptWithQuantities.data as CreateAttendancePayload | null;
  let rpcError = attemptWithQuantities.error;

  if (!payload && isLegacyRpcSignatureError(rpcError?.message)) {
    const legacyAttempt = await supabase.rpc("create_attendance_with_queue_items", {
      p_exam_types: selectedExams,
      p_notes: notes || null,
      p_patient_name: patientName,
      p_patient_registration_number: patientRegistrationNumber,
      p_priority: priority,
    });

    payload = legacyAttempt.data as CreateAttendancePayload | null;
    rpcError = legacyAttempt.error;
  }

  if (rpcError || !payload) {
    logServerError("create_attendance.rpc", rpcError);

    const isMigrationError =
      isLegacyExamTypeEnumError(rpcError?.message) ||
      isRegistrationNumberMigrationError(rpcError?.message);
    const errorMessage = isMigrationError
      ? "Banco desatualizado. Aplique as migrations do projeto e tente novamente."
      : "Nao foi possivel salvar o atendimento completo.";

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: isMigrationError ? 503 : 400 },
    );
  }

  return NextResponse.json(normalizeCreateAttendancePayload(payload, examQuantities));
}

export async function PATCH(request: Request) {
  const originError = validateSameOrigin(request);

  if (originError) {
    return originError;
  }

  const body = await parseBody<AttendancePatchBody>(request);

  if (!body) {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  const attendanceId = body.attendanceId?.trim() ?? "";

  if (!attendanceId) {
    return jsonError("Atendimento nao encontrado.", 400);
  }

  if (body.action === "cancel") {
    const { supabase } = await requireRole("admin");
    const reason = body.reason?.trim() ?? "";

    if (reason.length < 3) {
      return jsonError("Informe o motivo do cancelamento.", 400);
    }

    const cancelAttempt = await supabase.rpc("cancel_attendance", {
      p_attendance_id: attendanceId,
      p_authorized_by: null,
      p_reason: reason,
    });

    const payload = cancelAttempt.data as CreateAttendancePayload | null;

    if (cancelAttempt.error || !payload) {
      logServerError("cancel_attendance.rpc", cancelAttempt.error);
      const clientError = mapCancelAttendanceError(cancelAttempt.error?.message);

      return jsonError(clientError.error, clientError.status);
    }

    return NextResponse.json(normalizeAttendanceMutationPayload(payload));
  }

  if (body.action === "return-pending") {
    const { profile, supabase } = await requireRole([
      "recepcao",
      "atendimento",
      "admin",
    ]);

    if (typeof body.isPending !== "boolean") {
      return jsonError("Corpo da requisicao invalido.", 400);
    }

    const reason = body.reason?.trim() ?? "";

    if (body.isPending && reason.length < 3) {
      return jsonError("Informe o motivo da pendencia de retorno.", 400);
    }

    const { data, error } = await supabase.rpc("set_attendance_return_pending", {
      p_attendance_id: attendanceId,
      p_is_pending: body.isPending,
      p_reason: reason || null,
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

    const payload = data as AttendancePayload;

    return NextResponse.json({
      attendance: normalizeAttendanceRecord(payload.attendance),
    });
  }

  if (body.action === "update") {
    const { supabase } = await requireRole("admin");
    const patientName = body.patientName?.trim() ?? "";
    const patientRegistrationNumber = body.patientRegistrationNumber?.trim() ?? "";
    const notes = body.notes?.trim() ?? "";
    const examQuantities = normalizeUpdateExamQuantities(body.examQuantities);

    if (patientName.length < 2) {
      return jsonError(
        "Informe um nome de paciente com pelo menos 2 caracteres.",
        400,
      );
    }

    if (!Object.keys(examQuantities).length) {
      return jsonError("Selecione ao menos um exame valido.", 400);
    }

    const { data, error } = await supabase.rpc("update_attendance_registration", {
      p_attendance_id: attendanceId,
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
      const mapped = mapAttendanceUpdateError(error?.message);
      return jsonError(mapped.message, mapped.status);
    }

    const payload = data as CreateAttendancePayload;

    return NextResponse.json(normalizeAttendanceMutationPayload(payload));
  }

  return jsonError("Acao de atendimento invalida.", 400);
}

export async function DELETE(request: Request) {
  const originError = validateSameOrigin(request);

  if (originError) {
    return originError;
  }

  const { supabase } = await requireRole("admin");
  const body = await parseBody<DeleteAttendanceBody>(request);
  const attendanceId = body?.attendanceId?.trim() ?? "";
  const reason = body?.reason?.trim() ?? "";

  if (!attendanceId) {
    return jsonError("Atendimento nao encontrado.", 400);
  }

  if (reason.length < 3) {
    return jsonError("Informe o motivo da exclusao com pelo menos 3 caracteres.", 400);
  }

  const { data, error } = await supabase.rpc("delete_attendance", {
    p_attendance_id: attendanceId,
    p_reason: reason,
  });

  if (error || !data) {
    logServerError("delete_attendance.rpc", error);
    const mapped = mapAttendanceUpdateError(error?.message);
    return jsonError(
      mapped.status === 404 ? mapped.message : "Nao foi possivel excluir o atendimento.",
      mapped.status === 404 ? mapped.status : 400,
    );
  }

  const payload = data as AttendancePayload;

  return NextResponse.json({
    attendance: normalizeAttendanceRecord(payload.attendance),
    success: true,
  });
}
