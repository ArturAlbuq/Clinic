"use client";

import { useState } from "react";
import { PIPELINE_STATUS_LABELS, getStatusesForType } from "@/lib/pipeline-constants";
import type { Database } from "@/lib/database.types";

type PipelineStatus = Database["public"]["Enums"]["pipeline_status"];
type PipelineType = Database["public"]["Enums"]["pipeline_type"];

type CorrectStatusModalProps = {
  pipelineItemId: string;
  patientName: string;
  currentStatus: PipelineStatus;
  pipelineType: PipelineType;
  onConfirm: (newStatus: PipelineStatus, reason: string) => Promise<void>;
  onClose: () => void;
};

export function CorrectStatusModal({
  patientName,
  currentStatus,
  pipelineType,
  onConfirm,
  onClose,
}: CorrectStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<PipelineStatus | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allStatuses = getStatusesForType(pipelineType).filter((s) => s !== currentStatus);

  async function handleConfirm() {
    if (!selectedStatus) { setError("Selecione o novo status."); return; }
    if (reason.trim().length < 3) { setError("Informe o motivo com pelo menos 3 caracteres."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedStatus, reason.trim());
      onClose();
    } catch {
      setError("Erro ao corrigir status. Tente novamente.");
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
            Corrigir status — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Ação de correção — será registrada em auditoria. Status atual:{" "}
          <span className="font-semibold">{PIPELINE_STATUS_LABELS[currentStatus]}</span>
        </p>

        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-slate-700">Novo status:</p>
          {allStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStatus(s)}
              className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                selectedStatus === s
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {PIPELINE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Motivo <span className="text-rose-500">*</span>
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
            disabled={!selectedStatus || submitting}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-rose-700"
          >
            {submitting ? "Corrigindo..." : "Confirmar correção"}
          </button>
        </div>
      </div>
    </div>
  );
}
