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
  priority?: AttendancePriority;
  selectedExams?: ExamType[];
};

type CreateAttendancePayload = {
  attendance: AttendanceRecord;
  queueItems: QueueItemRecord[];
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

function isLegacyExamTypeEnumError(message?: string | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes("invalid input value for enum exam_type") ||
    message.includes("invalid input syntax for type public.exam_type")
  );
}

async function parseBody(request: Request) {
  try {
    return (await request.json()) as CreateAttendanceBody;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const { supabase } = await requireRole(["recepcao", "admin"]);
  const body = await parseBody(request);

  if (!body) {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido." },
      { status: 400 },
    );
  }

  const patientName = body.patientName?.trim() ?? "";
  const notes = body.notes?.trim() ?? "";
  const priority = body.priority;
  const selectedExams = Array.isArray(body.selectedExams) ? body.selectedExams : [];

  if (patientName.length < 2) {
    return NextResponse.json(
      { error: "Informe um nome de paciente com pelo menos 2 caracteres." },
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
      p_priority: priority,
    });

    payload = legacyAttempt.data as CreateAttendancePayload | null;
    rpcError = legacyAttempt.error;
  }

  if (rpcError || !payload) {
    logServerError("create_attendance.rpc", rpcError);

    const errorMessage = isLegacyExamTypeEnumError(rpcError?.message)
      ? "Banco desatualizado. Aplique as migrations do projeto e tente novamente."
      : "Nao foi possivel salvar o atendimento completo.";

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: isLegacyExamTypeEnumError(rpcError?.message) ? 503 : 400 },
    );
  }

  return NextResponse.json(normalizeCreateAttendancePayload(payload, examQuantities));
}
