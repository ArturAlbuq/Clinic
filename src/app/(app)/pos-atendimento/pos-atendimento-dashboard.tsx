"use client";

import { useState, useEffect, useCallback } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/date";
import {
  PIPELINE_TYPE_LABELS,
  PIPELINE_STATUS_LABELS,
  getPipelineStatusBadgeClass,
  PIPELINE_TYPE_BADGE_CLASS,
} from "@/lib/pipeline-constants";
import { AdvanceStatusModal } from "./advance-status-modal";
import { HistoryModal } from "./history-modal";
import type { PipelineStatus, PipelineType, Json } from "@/lib/database.types";
import type { ProfileRecord } from "@/lib/database.types";

type PipelineItemRow = {
  id: string;
  attendance_id: string;
  queue_item_id: string | null;
  pipeline_type: PipelineType;
  status: PipelineStatus;
  responsible_id: string | null;
  sla_deadline: string | null;
  metadata: Json;
  opened_at: string;
  updated_at: string;
  attendances: { patient_name: string } | null;
  queue_items: { exam_type: string } | null;
  profiles: { full_name: string } | null;
};

type PipelineEvent = {
  id: string;
  previous_status: PipelineStatus | null;
  new_status: PipelineStatus;
  performed_by: string | null;
  occurred_at: string;
  notes: string | null;
  profiles: { full_name: string } | null;
};

type Props = {
  initialItems: PipelineItemRow[];
  profiles: Pick<ProfileRecord, "id" | "full_name">[];
  currentProfile: ProfileRecord;
};

type FilterType = PipelineType | "todos";
type FilterStatus = PipelineStatus | "todos";

type AdvanceTarget = {
  item: PipelineItemRow;
};

type HistoryTarget = {
  item: PipelineItemRow;
  events: PipelineEvent[];
};

export function PosAtendimentoDashboard({
  initialItems,
  currentProfile,
}: Props) {
  const [items, setItems] = useState<PipelineItemRow[]>(initialItems);
  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [advanceTarget, setAdvanceTarget] = useState<AdvanceTarget | null>(null);
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("pipeline-items-all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipeline_items" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setItems((prev) =>
              prev.filter((i) => i.id !== String((payload.old as Record<string, unknown>).id))
            );
            return;
          }
          const raw = payload.new as Record<string, unknown>;
          supabase
            .from("pipeline_items")
            .select(
              `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at,
               attendances ( patient_name ), queue_items ( exam_type ), profiles:responsible_id ( full_name )`
            )
            .eq("id", String(raw.id))
            .neq("status", "publicado_finalizado")
            .single()
            .then(({ data }) => {
              if (!data) {
                setItems((prev) =>
                  prev.filter((i) => i.id !== String(raw.id))
                );
                return;
              }
              setItems((prev) => {
                const idx = prev.findIndex((i) => i.id === (data as PipelineItemRow).id);
                if (idx === -1) return [...prev, data as PipelineItemRow];
                const next = [...prev];
                next[idx] = data as PipelineItemRow;
                return next;
              });
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sorted = [...items].sort((a, b) => {
    const nowMs = Date.now();
    const aOverdue = a.sla_deadline
      ? new Date(a.sla_deadline).getTime() < nowMs
      : false;
    const bOverdue = b.sla_deadline
      ? new Date(b.sla_deadline).getTime() < nowMs
      : false;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
  });

  const filtered = sorted.filter((item) => {
    if (filterType !== "todos" && item.pipeline_type !== filterType)
      return false;
    if (filterStatus !== "todos" && item.status !== filterStatus) return false;
    if (filterOverdue) {
      if (!item.sla_deadline) return false;
      if (new Date(item.sla_deadline).getTime() >= Date.now()) return false;
    }
    if (filterSearch.trim()) {
      const needle = filterSearch.trim().toLowerCase();
      const name = item.attendances?.patient_name?.toLowerCase() ?? "";
      if (!name.includes(needle)) return false;
    }
    return true;
  });

  const handleAdvanceConfirm = useCallback(
    async (newStatus: PipelineStatus, notes: string) => {
      if (!advanceTarget) return;
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return;
      const item = advanceTarget.item;

      const [{ error: updateError }, { error: insertError }] =
        await Promise.all([
          supabase
            .from("pipeline_items")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", item.id),
          supabase.from("pipeline_events").insert({
            pipeline_item_id: item.id,
            previous_status: item.status,
            new_status: newStatus,
            performed_by: currentProfile.id,
            occurred_at: new Date().toISOString(),
            notes: notes || null,
          }),
        ]);

      if (updateError) throw updateError;
      if (insertError) throw insertError;
    },
    [advanceTarget, currentProfile.id]
  );

  const openHistory = useCallback(async (item: PipelineItemRow) => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("pipeline_events")
      .select(
        `id, previous_status, new_status, performed_by, occurred_at, notes, profiles:performed_by ( full_name )`
      )
      .eq("pipeline_item_id", item.id)
      .order("occurred_at", { ascending: true });

    setHistoryTarget({ item, events: (data as PipelineEvent[]) ?? [] });
  }, []);

  function getSlaAlertClass(slaDeadline: string | null): string {
    if (!slaDeadline) return "";
    const ms = new Date(slaDeadline).getTime() - Date.now();
    if (ms < 0) return "text-red-600 font-semibold";
    if (ms < 2 * 60 * 60 * 1000) return "text-yellow-600 font-semibold";
    return "text-green-600";
  }

  const pipelineTypes: PipelineType[] = [
    "laudo",
    "cefalometria",
    "fotografia",
    "escaneamento",
  ];
  const pipelineStatuses: PipelineStatus[] = [
    "nao_iniciado",
    "pendente_envio",
    "enviado_radiologista",
    "recebido_radiologista",
    "devolvido_radiologista",
    "recebido_corrigido",
    "revisado_liberado",
    "em_ajuste",
    "publicado_idoc",
    "disponivel_impressao",
    "enviado_impressao",
    "recebido_laboratorio",
    "enviado_laboratorio_externo",
    "retornado_laboratorio",
  ];

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pós-atendimento</h1>
        <p className="text-sm text-slate-500">
          Esteiras abertas aguardando conclusão
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos os tipos</option>
          {pipelineTypes.map((t) => (
            <option key={t} value={t}>
              {PIPELINE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos os status</option>
          {pipelineStatuses.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(e) => setFilterOverdue(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Apenas com atraso
        </label>

        <input
          type="text"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Buscar paciente..."
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />

        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} esteira{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
          Nenhuma esteira encontrada com os filtros selecionados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Exame</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
                <th className="px-4 py-3 font-medium">Abertura</th>
                <th className="px-4 py-3 font-medium">Prazo</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.attendances?.patient_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.queue_items?.exam_type ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PIPELINE_TYPE_BADGE_CLASS[item.pipeline_type]}`}
                    >
                      {PIPELINE_TYPE_LABELS[item.pipeline_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getPipelineStatusBadgeClass(item.status)}`}
                    >
                      {PIPELINE_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.profiles?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(item.opened_at)}
                  </td>
                  <td
                    className={`px-4 py-3 ${getSlaAlertClass(item.sla_deadline)}`}
                  >
                    {item.sla_deadline ? (
                      formatDateTime(item.sla_deadline)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAdvanceTarget({ item })}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        Avançar
                      </button>
                      <button
                        onClick={() => openHistory(item)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Histórico
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {advanceTarget && (
        <AdvanceStatusModal
          pipelineItemId={advanceTarget.item.id}
          patientName={
            advanceTarget.item.attendances?.patient_name ?? "Paciente"
          }
          currentStatus={advanceTarget.item.status}
          pipelineType={advanceTarget.item.pipeline_type}
          metadata={
            (advanceTarget.item.metadata as Record<string, unknown>) ?? {}
          }
          onConfirm={handleAdvanceConfirm}
          onClose={() => setAdvanceTarget(null)}
        />
      )}

      {historyTarget && (
        <HistoryModal
          patientName={
            historyTarget.item.attendances?.patient_name ?? "Paciente"
          }
          events={historyTarget.events}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
