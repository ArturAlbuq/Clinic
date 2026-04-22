"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PipelineExamBadges } from "@/components/pipeline-exam-badges";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/date";
import {
  PIPELINE_TYPE_LABELS,
  PIPELINE_STATUS_LABELS,
  getPipelineStatusBadgeClass,
  PIPELINE_TYPE_BADGE_CLASS,
} from "@/lib/pipeline-constants";
import {
  enrichPipelineItemsWithExams,
  PIPELINE_ITEM_BASE_SELECT,
  type PipelineItemBaseRow,
  type PipelineItemRow,
} from "@/lib/pipeline";
import { AdvanceStatusModal } from "./advance-status-modal";
import { HistoryModal } from "./history-modal";
import type { PipelineStatus, PipelineType, Json } from "@/lib/database.types";
import type { ProfileRecord } from "@/lib/database.types";

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
}: Props) {
  const [items, setItems] = useState<PipelineItemRow[]>(initialItems);
  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [advanceTarget, setAdvanceTarget] = useState<AdvanceTarget | null>(null);
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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
              prev.filter(
                (item) =>
                  item.id !==
                  String((payload.old as Record<string, unknown>).id),
              ),
            );
            return;
          }

          const raw = payload.new as Record<string, unknown>;
          supabase
            .from("pipeline_items")
            .select(PIPELINE_ITEM_BASE_SELECT)
            .eq("id", String(raw.id))
            .is("attendances.deleted_at", null)
            .neq("status", "publicado_finalizado")
            .single()
            .then(async ({ data }) => {
              if (!data) {
                setItems((prev) =>
                  prev.filter((item) => item.id !== String(raw.id)),
                );
                return;
              }

              const [hydratedItem] = await enrichPipelineItemsWithExams(
                supabase,
                [data as PipelineItemBaseRow],
              );

              if (!hydratedItem) {
                return;
              }

              setItems((prev) => {
                const index = prev.findIndex((item) => item.id === hydratedItem.id);

                if (index === -1) {
                  return [...prev, hydratedItem];
                }

                const next = [...prev];
                next[index] = hydratedItem;
                return next;
              });
            });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftOverdue = left.sla_deadline
          ? new Date(left.sla_deadline).getTime() < nowMs
          : false;
        const rightOverdue = right.sla_deadline
          ? new Date(right.sla_deadline).getTime() < nowMs
          : false;

        if (leftOverdue !== rightOverdue) {
          return leftOverdue ? -1 : 1;
        }

        return (
          new Date(left.opened_at).getTime() - new Date(right.opened_at).getTime()
        );
      }),
    [items, nowMs],
  );

  const filtered = useMemo(
    () =>
      sorted.filter((item) => {
        if (filterType !== "todos" && item.pipeline_type !== filterType) {
          return false;
        }

        if (filterStatus !== "todos" && item.status !== filterStatus) {
          return false;
        }

        if (filterOverdue) {
          if (!item.sla_deadline) {
            return false;
          }

          if (new Date(item.sla_deadline).getTime() >= nowMs) {
            return false;
          }
        }

        if (filterSearch.trim()) {
          const needle = filterSearch.trim().toLowerCase();
          const name = item.attendances?.patient_name?.toLowerCase() ?? "";

          if (!name.includes(needle)) {
            return false;
          }
        }

        return true;
      }),
    [sorted, filterType, filterStatus, filterOverdue, filterSearch, nowMs],
  );

  const handleAdvanceConfirm = useCallback(
    async (newStatus: PipelineStatus, notes: string) => {
      if (!advanceTarget) return;

      const supabase = getBrowserSupabaseClient();
      if (!supabase) return;

      const item = advanceTarget.item;
      const { error } = await supabase
        .from("pipeline_items")
        .update({ status: newStatus, notes: notes || null })
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      setItems((prev) =>
        newStatus === "publicado_finalizado"
          ? prev.filter((current) => current.id !== item.id)
          : prev.map((current) =>
              current.id === item.id
                ? {
                    ...current,
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  }
                : current,
            ),
      );
    },
    [advanceTarget],
  );

  const openHistory = useCallback(async (item: PipelineItemRow) => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from("pipeline_events")
      .select(
        `id, previous_status, new_status, performed_by, occurred_at, notes, profiles:performed_by ( full_name )`,
      )
      .eq("pipeline_item_id", item.id)
      .order("occurred_at", { ascending: true });

    setHistoryTarget({ item, events: (data as PipelineEvent[]) ?? [] });
  }, []);

  function getSlaAlertClass(slaDeadline: string | null) {
    if (!slaDeadline) {
      return "";
    }

    const ms = new Date(slaDeadline).getTime() - nowMs;

    if (ms < 0) {
      return "text-red-600 font-semibold";
    }

    if (ms < 2 * 60 * 60 * 1000) {
      return "text-yellow-600 font-semibold";
    }

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
    "devolvido_radiologista",
    "recebido_corrigido",
    "revisado_liberado",
    "em_ajuste",
    "publicado_idoc",
    "disponivel_impressao",
    "enviado_impressao",
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
          onChange={(event) => setFilterType(event.target.value as FilterType)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos os tipos</option>
          {pipelineTypes.map((type) => (
            <option key={type} value={type}>
              {PIPELINE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(event) =>
            setFilterStatus(event.target.value as FilterStatus)
          }
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos os status</option>
          {pipelineStatuses.map((status) => (
            <option key={status} value={status}>
              {PIPELINE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(event) => setFilterOverdue(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Apenas com atraso
        </label>

        <input
          type="text"
          value={filterSearch}
          onChange={(event) => setFilterSearch(event.target.value)}
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
                    <PipelineExamBadges exams={item.exams} />
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
          patientName={advanceTarget.item.attendances?.patient_name ?? "Paciente"}
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
          patientName={historyTarget.item.attendances?.patient_name ?? "Paciente"}
          events={historyTarget.events}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
