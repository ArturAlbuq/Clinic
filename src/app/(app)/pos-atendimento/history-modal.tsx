"use client";

import { formatDateTime } from "@/lib/date";
import { PIPELINE_STATUS_LABELS } from "@/lib/pipeline-constants";
import type { PipelineStatus } from "@/lib/database.types";

type PipelineEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  profiles: { full_name: string } | null;
};

type HistoryModalProps = {
  patientName: string;
  events: PipelineEvent[];
  onClose: () => void;
};

export function HistoryModal({
  patientName,
  events,
  onClose,
}: HistoryModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Histórico — {patientName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Nenhum evento registrado.
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 shrink-0 text-xs text-slate-400">
                  {formatDateTime(ev.occurred_at)}
                </span>
                <div>
                  <span className="font-medium text-slate-700">
                    {ev.previous_status
                      ? `${PIPELINE_STATUS_LABELS[ev.previous_status]} → `
                      : ""}
                    {PIPELINE_STATUS_LABELS[ev.new_status]}
                  </span>
                  {ev.profiles?.full_name && (
                    <span className="ml-2 text-slate-400">
                      por {ev.profiles.full_name}
                    </span>
                  )}
                  {ev.notes && (
                    <p className="mt-0.5 text-slate-500">{ev.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
