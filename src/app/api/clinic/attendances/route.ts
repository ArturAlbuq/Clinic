import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type {
  AttendancePriority,
  AttendanceRecord,
  ExamType,
  QueueItemRecord,
} from "@/lib/database.types";

type CreateAttendanceBody = {
  notes?: string;
  patientName?: string;
  priority?: AttendancePriority;
  selectedExams?: ExamType[];
};

type CreateAttendancePayload = {
  attendance: AttendanceRecord;
  queueItems: QueueItemRecord[];
};

const ALLOWED_PRIORITIES = new Set<AttendancePriority>(["normal", "alta", "urgente"]);
const ALLOWED_EXAMS = new Set<ExamType>([
  "fotografia_escaneamento",
  "periapical",
  "panoramico",
  "tomografia",
]);

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const { supabase } = await requireRole(["recepcao", "admin"]);
  const body = (await request.json()) as CreateAttendanceBody;
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
    return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
  }

  if (
    selectedExams.length === 0 ||
    selectedExams.some((examType) => !ALLOWED_EXAMS.has(examType))
  ) {
    return NextResponse.json(
      { error: "Selecione ao menos uma sala válida." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("create_attendance_with_queue_items", {
    p_exam_types: selectedExams,
    p_notes: notes || null,
    p_patient_name: patientName,
    p_priority: priority,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: "Não foi possível salvar o atendimento completo." },
      { status: 400 },
    );
  }

  return NextResponse.json(data as CreateAttendancePayload);
}
