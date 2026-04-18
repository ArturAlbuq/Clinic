"use client";

import { useEffect, useMemo, useState } from "react";
import { ExamsSection } from "@/app/(app)/recepcao/exams-section";
import { PatientSection } from "@/app/(app)/recepcao/patient-section";
import { readJsonResponse } from "@/lib/fetch-json";
import { canReceptionEditAttendance } from "@/lib/queue";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  ExamRoomRecord,
  ExamType,
  QueueItemRecord,
} from "@/lib/database.types";

type ReceptionEditAttendanceCardProps = {
  attendance: AttendanceWithQueueItems;
  isToday: boolean;
  rooms: ExamRoomRecord[];
  onAttendanceSaved: (
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) => void;
};

function buildEditableExamQuantities(attendance: AttendanceWithQueueItems) {
  return attendance.queueItems.reduce<Partial<Record<ExamType, number>>>(
    (accumulator, item) => {
      accumulator[item.exam_type] = item.requested_quantity;
      return accumulator;
    },
    {},
  );
}

export function ReceptionEditAttendanceCard({
  attendance,
  isToday,
  rooms,
  onAttendanceSaved,
}: ReceptionEditAttendanceCardProps) {
  const canEdit =
    isToday && canReceptionEditAttendance(attendance, attendance.queueItems);
  const initialSelectedExams = useMemo(
    () => Array.from(new Set(attendance.queueItems.map((item) => item.exam_type))),
    [attendance.queueItems],
  );
  const initialExamQuantities = useMemo(
    () => buildEditableExamQuantities(attendance),
    [attendance],
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [patientName, setPatientName] = useState(attendance.patient_name);
  const [patientRegistrationNumber, setPatientRegistrationNumber] = useState(
    attendance.patient_registration_number ?? "",
  );
  const [notes, setNotes] = useState(attendance.notes ?? "");
  const [selectedExams, setSelectedExams] =
    useState<ExamType[]>(initialSelectedExams);
  const [examQuantities, setExamQuantities] =
    useState<Partial<Record<ExamType, number>>>(initialExamQuantities);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setPatientName(attendance.patient_name);
    setPatientRegistrationNumber(attendance.patient_registration_number ?? "");
    setNotes(attendance.notes ?? "");
    setSelectedExams(initialSelectedExams);
    setExamQuantities(initialExamQuantities);
    setMutationError("");
  }, [
    attendance.notes,
    attendance.patient_name,
    attendance.patient_registration_number,
    initialExamQuantities,
    initialSelectedExams,
    isEditing,
  ]);

  function toggleExam(examType: ExamType) {
    setSelectedExams((current) => {
      const alreadySelected = current.includes(examType);

      if (alreadySelected) {
        setExamQuantities((currentQuantities) => {
          const nextQuantities = { ...currentQuantities };
          delete nextQuantities[examType];
          return nextQuantities;
        });

        return current.filter((entry) => entry !== examType);
      }

      setExamQuantities((currentQuantities) => ({
        ...currentQuantities,
        [examType]: currentQuantities[examType] ?? 1,
      }));

      return [...current, examType];
    });
  }

  function updateExamQuantity(examType: ExamType, rawValue: string) {
    const parsed = Number(rawValue);
    const quantity =
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 99) : 1;

    setExamQuantities((current) => ({
      ...current,
      [examType]: quantity,
    }));
  }

  function resetForm() {
    setPatientName(attendance.patient_name);
    setPatientRegistrationNumber(attendance.patient_registration_number ?? "");
    setNotes(attendance.notes ?? "");
    setSelectedExams(initialSelectedExams);
    setExamQuantities(initialExamQuantities);
    setMutationError("");
  }

  async function submitEdit() {
    setMutationError("");

    if (patientName.trim().length < 2) {
      setMutationError("Informe um nome de paciente valido.");
      return;
    }

    if (!patientRegistrationNumber.trim()) {
      setMutationError("Informe o numero do cadastro do paciente.");
      return;
    }

    if (!selectedExams.length) {
      setMutationError("Selecione ao menos um exame.");
      return;
    }

    setIsSaving(true);

    const selectedExamQuantities = selectedExams.reduce<
      Partial<Record<ExamType, number>>
    >((accumulator, examType) => {
      accumulator[examType] = examQuantities[examType] ?? 1;
      return accumulator;
    }, {});

    const response = await fetch("/api/clinic/attendances", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "update",
        attendanceId: attendance.id,
        examQuantities: selectedExamQuantities,
        notes,
        patientName,
        patientRegistrationNumber,
      }),
    });

    const payload = (await readJsonResponse<{
      attendance?: AttendanceRecord;
      error?: string;
      queueItems?: QueueItemRecord[];
    }>(response)) ?? { error: "Nao foi possivel atualizar o cadastro." };

    if (!response.ok || !payload.attendance) {
      setMutationError(payload.error || "Nao foi possivel atualizar o cadastro.");
      setIsSaving(false);
      return;
    }

    onAttendanceSaved(
      payload.attendance as AttendanceRecord,
      (payload.queueItems ?? []) as QueueItemRecord[],
    );
    setIsEditing(false);
    setIsSaving(false);
  }

  if (!canEdit) {
    return null;
  }

  return (
    <div className="rounded-[18px] border border-cyan-200 bg-cyan-50/70 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Edicao liberada
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Enquanto nenhum exame foi chamado, a recepcao pode corrigir nome,
            cadastro, observacao e exames deste atendimento.
          </p>
        </div>
        {!isEditing ? (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsEditing(true);
            }}
            className="rounded-[16px] border border-cyan-300 bg-white px-4 py-3 text-sm font-semibold text-cyan-900 transition hover:border-cyan-400 hover:bg-cyan-100"
          >
            Editar cadastro
          </button>
        ) : null}
      </div>

      {mutationError ? (
        <div className="mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {mutationError}
        </div>
      ) : null}

      {isEditing ? (
        <div className="mt-4 space-y-4">
          <PatientSection
            patientName={patientName}
            patientRegistrationNumber={patientRegistrationNumber}
            onPatientNameChange={setPatientName}
            onRegistrationNumberChange={setPatientRegistrationNumber}
          />

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Observacao
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
              placeholder="Opcional. Ex.: encaixe, orientacao do dentista, retorno."
            />
          </label>

          <ExamsSection
            rooms={rooms}
            selectedExams={selectedExams}
            examQuantities={examQuantities}
            onToggleExam={toggleExam}
            onUpdateExamQuantity={updateExamQuantity}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submitEdit}
              disabled={isSaving}
              className="rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : "Salvar alteracoes"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsEditing(false);
              }}
              className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
