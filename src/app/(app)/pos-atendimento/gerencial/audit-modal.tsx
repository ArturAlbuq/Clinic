"use client";

import { formatDateTime } from "@/lib/date";
import { PIPELINE_STATUS_LABELS } from "@/lib/pipeline-constants";
import type { Database } from "@/lib/database.types";

type PipelineStatus = Database["public"]["Enums"]["pipeline_status"];

type AuditEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  profiles: { full_name: string; role: string } | null;
};

type AuditModalProps = {
  patientName: string;
  events: AuditEvent[];
  onClose: () => void;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  created: "Criação",
  status_changed: "Avanço",
  reopened: "Reabertura",
  admin_correction: "Correção admin",
};

export function AuditModal({ patientName, events, onClose }: AuditModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Auditoria completa — {patientName}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhum evento registrado.</p>
        ) : (
          <ol className="max-h-[60vh] space-y-3 overflow-y-auto">
            {events.map((ev) => {
              const eventType = (ev.metadata as Record<string, unknown> | null)?.event_type as string | undefined;
              const label = eventType ? (EVENT_TYPE_LABELS[eventType] ?? eventType) : "Evento";
              const isAdmin = eventType === "reopened" || eventType === "admin_correction";

              return (
                <li key={ev.id} className={`flex gap-3 rounded-lg px-3 py-2 text-sm ${isAdmin ? "bg-rose-50" : "bg-slate-50"}`}>
                  <span className="mt-0.5 shrink-0 text-xs text-slate-400">
                    {formatDateTime(ev.occurred_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isAdmin ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
                        {label}
                      </span>
                      <span className="font-medium text-slate-700">
                        {ev.previous_status ? `${PIPELINE_STATUS_LABELS[ev.previous_status]} → ` : ""}
                        {PIPELINE_STATUS_LABELS[ev.new_status]}
                      </span>
                    </div>
                    {ev.profiles && (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {ev.profiles.full_name}
                        {ev.profiles.role ? ` (${ev.profiles.role})` : ""}
                      </span>
                    )}
                    {ev.notes && <p className="mt-0.5 text-slate-500">{ev.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
