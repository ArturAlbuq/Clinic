"use client";

import { useState } from "react";
import type { Database } from "@/lib/database.types";
import { EXAM_LABELS } from "@/lib/constants";

type ExamType = Database["public"]["Enums"]["exam_type"];
type PipelineType = Database["public"]["Enums"]["pipeline_type"];

type CorrectFlagsModalProps = {
  attendanceId: string;
  patientName: string;
  pipelineType: PipelineType;
  currentFlags: {
    comCefalometria: boolean;
    comImpressaoFotografia: boolean;
    comLaboratorioExternoEscaneamento: boolean;
    comLaudoPerExam: Partial<Record<ExamType, boolean>>;
  };
  onConfirm: (flags: {
    comCefalometria: boolean;
    comImpressaoFotografia: boolean;
    comLaboratorioExternoEscaneamento: boolean;
    comLaudoPerExam: Partial<Record<ExamType, boolean>>;
    reason: string;
  }) => Promise<void>;
  onClose: () => void;
};

export function CorrectFlagsModal({
  patientName,
  pipelineType,
  currentFlags,
  onConfirm,
  onClose,
}: CorrectFlagsModalProps) {
  const [comCefalometria, setComCefalometria] = useState(currentFlags.comCefalometria);
  const [comImpressaoFotografia, setComImpressaoFotografia] = useState(currentFlags.comImpressaoFotografia);
  const [comLaboratorioExternoEscaneamento, setComLaboratorioExternoEscaneamento] = useState(currentFlags.comLaboratorioExternoEscaneamento);
  const [comLaudoPerExam, setComLaudoPerExam] = useState(currentFlags.comLaudoPerExam);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFlagChange(exam: ExamType, value: boolean) {
    setComLaudoPerExam((prev) => ({
      ...prev,
      [exam]: value,
    }));
  }

  async function handleConfirm() {
    if (reason.trim().length < 3) {
      setError("Informe o motivo com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        comCefalometria,
        comImpressaoFotografia,
        comLaboratorioExternoEscaneamento,
        comLaudoPerExam,
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao corrigir marcações."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Corrigir marcações — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Ação de correção — será registrada em auditoria.
        </p>

        <div className="mb-4">
          {pipelineType === "laudo" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Laudos por exame:</p>
              {Object.keys(comLaudoPerExam).map((exam) => (
                <label key={exam} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:border-slate-400">
                  <input
                    type="checkbox"
                    checked={comLaudoPerExam[exam as ExamType] ?? false}
                    onChange={(e) => handleFlagChange(exam as ExamType, e.target.checked)}
                    className="rounded border-slate-300 focus:outline-none"
                  />
                  {EXAM_LABELS[exam as ExamType]}
                </label>
              ))}
            </div>
          )}
          {pipelineType === "cefalometria" && (
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:border-slate-400">
              <input
                type="checkbox"
                checked={comCefalometria}
                onChange={(e) => setComCefalometria(e.target.checked)}
                className="rounded border-slate-300 focus:outline-none"
              />
              Com cefalometria
            </label>
          )}
          {pipelineType === "fotografia" && (
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:border-slate-400">
              <input
                type="checkbox"
                checked={comImpressaoFotografia}
                onChange={(e) => setComImpressaoFotografia(e.target.checked)}
                className="rounded border-slate-300 focus:outline-none"
              />
              Com impressão (foto)
            </label>
          )}
          {pipelineType === "escaneamento" && (
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:border-slate-400">
              <input
                type="checkbox"
                checked={comLaboratorioExternoEscaneamento}
                onChange={(e) => setComLaboratorioExternoEscaneamento(e.target.checked)}
                className="rounded border-slate-300 focus:outline-none"
              />
              Laboratório externo
            </label>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Motivo <span className="text-amber-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="Descreva o motivo da correção..."
          />
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-amber-700"
          >
            {submitting ? "Corrigindo..." : "Confirmar correção"}
          </button>
        </div>
      </div>
    </div>
  );
}
