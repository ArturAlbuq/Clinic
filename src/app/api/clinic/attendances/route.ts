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

const ALLOWED_PRIORITIES = new Set<AttendancePriority>(["normal", "alta", "urgente"]);
const ALLOWED_EXAMS = new Set<ExamType>([
  "fotografia_escaneamento",
  "periapical",
  "panoramico",
  "tomografia",
]);

export async function POST(request: Request) {
  const { profile, supabase } = await requireRole(["recepcao", "admin"]);
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
      { error: "Selecione ao menos uma sala/exame válida." },
      { status: 400 },
    );
  }

  const { data: attendance, error: attendanceError } = await supabase
    .from("attendances")
    .insert({
      created_by: profile.id,
      notes: notes || null,
      patient_name: patientName,
      priority,
    })
    .select("*")
    .single();

  if (attendanceError || !attendance) {
    return NextResponse.json(
      { error: attendanceError?.message || "Não foi possível criar o atendimento." },
      { status: 400 },
    );
  }

  const createdAttendance = attendance as AttendanceRecord;
  const { data: queueItems, error: queueError } = await supabase
    .from("queue_items")
    .insert(
      selectedExams.map((examType) => ({
        attendance_id: createdAttendance.id,
        exam_type: examType,
      })),
    )
    .select("*");

  if (queueError || !queueItems) {
    await supabase.from("attendances").delete().eq("id", createdAttendance.id);

    return NextResponse.json(
      { error: queueError?.message || "Não foi possível criar os itens da fila." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    attendance: createdAttendance,
    queueItems: queueItems as QueueItemRecord[],
  });
}
