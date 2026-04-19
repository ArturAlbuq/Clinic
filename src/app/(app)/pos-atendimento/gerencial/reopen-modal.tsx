"use client";

import { useState } from "react";

type ReopenModalProps = {
  pipelineItemId: string;
  patientName: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
};

export function ReopenModal({
  patientName,
  onConfirm,
  onClose,
}: ReopenModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (reason.trim().length < 3) {
      setError("Informe o motivo com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      setError("Erro ao reabrir esteira. Tente novamente.");
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
            Reabrir esteira — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Esta ação reabre uma esteira finalizada e será registrada em auditoria.
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Motivo <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="Descreva o motivo da reabertura..."
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
            {submitting ? "Reabrindo..." : "Confirmar reabertura"}
          </button>
        </div>
      </div>
    </div>
  );
}
