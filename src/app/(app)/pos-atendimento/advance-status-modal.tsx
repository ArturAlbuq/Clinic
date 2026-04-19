"use client";

import { useState } from "react";
import {
  PIPELINE_STATUS_LABELS,
  getNextStatuses,
} from "@/lib/pipeline-constants";
import type { PipelineStatus, PipelineType } from "@/lib/database.types";

type AdvanceStatusModalProps = {
  pipelineItemId: string;
  patientName: string;
  currentStatus: PipelineStatus;
  pipelineType: PipelineType;
  metadata: Record<string, unknown>;
  onConfirm: (newStatus: PipelineStatus, notes: string) => Promise<void>;
  onClose: () => void;
};

export function AdvanceStatusModal({
  patientName,
  currentStatus,
  pipelineType,
  metadata,
  onConfirm,
  onClose,
}: AdvanceStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<PipelineStatus | null>(
    null
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const nextStatuses = getNextStatuses(pipelineType, currentStatus, metadata);

  async function handleConfirm() {
    if (!selectedStatus) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedStatus, notes.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Avançar status — {patientName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          Status atual:{" "}
          <span className="font-medium text-slate-700">
            {PIPELINE_STATUS_LABELS[currentStatus]}
          </span>
        </p>

        {nextStatuses.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Nenhum próximo status disponível para esta esteira.
          </p>
        ) : (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Próximos status possíveis:
            </p>
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStatus(s)}
                className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                  selectedStatus === s
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {PIPELINE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Observação (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="Observação sobre este avanço..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedStatus || submitting}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-slate-700"
          >
            {submitting ? "Confirmando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
