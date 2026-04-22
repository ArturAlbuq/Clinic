"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PipelineExamBadges } from "@/components/pipeline-exam-badges";
import { MetricCard } from "@/components/metric-card";
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
import type { Database } from "@/lib/database.types";
import { ReopenModal } from "./reopen-modal";
import { CorrectStatusModal } from "./correct-status-modal";
import { AuditModal } from "./audit-modal";

type PipelineStatus = Database["public"]["Enums"]["pipeline_status"];
type PipelineType = Database["public"]["Enums"]["pipeline_type"];

const PAGE_SIZE = 20;

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

type SummaryData = {
  laudo_pendente_envio: number;
  laudo_enviado_radiologista: number;
  laudo_atrasado: number;
  cefalo_pendente_envio: number;
  cefalo_enviado_radiologista: number;
  cefalo_atrasado: number;
  foto_em_ajuste: number;
  foto_disponivel_impressao: number;
  foto_em_laboratorio: number;
  foto_atrasado: number;
  scan_em_ajuste: number;
  scan_laboratorio_externo: number;
  scan_atrasado: number;
  total_aberto: number;
  total_finalizado_hoje: number;
};

type Props = {
  initialItems: PipelineItemRow[];
  initialTotal: number;
  currentProfile: { id: string; role: string; full_name: string };
};

type FilterStatus = PipelineStatus | "todos";
type FilterType = PipelineType | "todos";

export function GerencialDashboard({
  initialItems,
  initialTotal,
  currentProfile,
}: Props) {
  const isAdmin = currentProfile.role === "admin";

  const [items, setItems] = useState<PipelineItemRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterFinished, setFilterFinished] = useState<
    "todos" | "aberto" | "finalizado"
  >("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterOpenedFrom, setFilterOpenedFrom] = useState("");
  const [filterOpenedTo, setFilterOpenedTo] = useState("");

  const [summary, setSummary] = useState<SummaryData | null>(null);

  const [reopenTarget, setReopenTarget] = useState<PipelineItemRow | null>(null);
  const [correctTarget, setCorrectTarget] = useState<PipelineItemRow | null>(
    null,
  );
  const [auditTarget, setAuditTarget] = useState<{
    item: PipelineItemRow;
    events: AuditEvent[];
  } | null>(null);

  const fetchPage = useCallback(
    async (pageIndex: number) => {
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return;

      setLoading(true);

      let query = supabase
        .from("pipeline_items")
        .select(PIPELINE_ITEM_BASE_SELECT, { count: "exact" })
        .is("attendances.deleted_at", null);

      if (filterType !== "todos") {
        query = query.eq("pipeline_type", filterType);
      }

      if (filterStatus !== "todos") {
        query = query.eq("status", filterStatus);
      }

      if (filterOverdue) {
        query = query
          .lt("sla_deadline", new Date().toISOString())
          .neq("status", "publicado_finalizado");
      }

      if (filterFinished === "aberto") {
        query = query.neq("status", "publicado_finalizado");
      }

      if (filterFinished === "finalizado") {
        query = query.eq("status", "publicado_finalizado");
      }

      if (filterOpenedFrom) {
        query = query.gte("opened_at", filterOpenedFrom);
      }

      if (filterOpenedTo) {
        query = query.lte("opened_at", `${filterOpenedTo}T23:59:59Z`);
      }

      query = query
        .order("opened_at", { ascending: false })
        .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await query;

      if (!error && data) {
        const hydratedItems = await enrichPipelineItemsWithExams(
          supabase,
          data as PipelineItemBaseRow[],
        );
        setItems(hydratedItems);
        setTotal(count ?? 0);
        setPage(pageIndex);
      }

      setLoading(false);
    },
    [
      filterType,
      filterStatus,
      filterOverdue,
      filterFinished,
      filterOpenedFrom,
      filterOpenedTo,
    ],
  );

  const fetchSummary = useCallback(async () => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).toISOString();
    const now = today.toISOString();

    const { data } = await supabase
      .from("pipeline_items")
      .select(
        "pipeline_type, status, sla_deadline, finished_at, attendances!inner ( deleted_at )",
      )
      .is("attendances.deleted_at", null);

    if (!data) return;

    const nextSummary: SummaryData = {
      laudo_pendente_envio: 0,
      laudo_enviado_radiologista: 0,
      laudo_atrasado: 0,
      cefalo_pendente_envio: 0,
      cefalo_enviado_radiologista: 0,
      cefalo_atrasado: 0,
      foto_em_ajuste: 0,
      foto_disponivel_impressao: 0,
      foto_em_laboratorio: 0,
      foto_atrasado: 0,
      scan_em_ajuste: 0,
      scan_laboratorio_externo: 0,
      scan_atrasado: 0,
      total_aberto: 0,
      total_finalizado_hoje: 0,
    };

    for (const item of data) {
      const overdue = item.sla_deadline ? item.sla_deadline < now : false;
      const open = item.status !== "publicado_finalizado";

      if (open) {
        nextSummary.total_aberto++;
      }

      if (item.finished_at && item.finished_at >= todayStart) {
        nextSummary.total_finalizado_hoje++;
      }

      if (item.pipeline_type === "laudo") {
        if (item.status === "pendente_envio") {
          nextSummary.laudo_pendente_envio++;
        }

        if (item.status === "enviado_radiologista") {
          nextSummary.laudo_enviado_radiologista++;
        }

        if (overdue && open) {
          nextSummary.laudo_atrasado++;
        }
      }

      if (item.pipeline_type === "cefalometria") {
        if (item.status === "pendente_envio") {
          nextSummary.cefalo_pendente_envio++;
        }

        if (item.status === "enviado_radiologista") {
          nextSummary.cefalo_enviado_radiologista++;
        }

        if (overdue && open) {
          nextSummary.cefalo_atrasado++;
        }
      }

      if (item.pipeline_type === "fotografia") {
        if (item.status === "em_ajuste") {
          nextSummary.foto_em_ajuste++;
        }

        if (item.status === "disponivel_impressao") {
          nextSummary.foto_disponivel_impressao++;
        }

        if (item.status === "enviado_impressao") {
          nextSummary.foto_em_laboratorio++;
        }

        if (overdue && open) {
          nextSummary.foto_atrasado++;
        }
      }

      if (item.pipeline_type === "escaneamento") {
        if (item.status === "em_ajuste") {
          nextSummary.scan_em_ajuste++;
        }

        if (item.status === "enviado_laboratorio_externo") {
          nextSummary.scan_laboratorio_externo++;
        }

        if (overdue && open) {
          nextSummary.scan_atrasado++;
        }
      }
    }

    setSummary(nextSummary);
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filterType,
    filterStatus,
    filterOverdue,
    filterFinished,
    filterSearch,
    filterOpenedFrom,
    filterOpenedTo,
  ]);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("gerencial-pipeline-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipeline_items" },
        () => {
          fetchSummary();
          fetchPage(page);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleAdminAction = useCallback(
    async (
      itemId: string,
      action: "reopen" | "correct-status",
      newStatus: PipelineStatus,
      reason: string,
    ) => {
      const response = await fetch(
        `/api/clinic/pipeline-items/${itemId}/admin-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action, newStatus, reason }),
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Erro desconhecido");
      }
    },
    [],
  );

  const openAudit = useCallback(async (item: PipelineItemRow) => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from("pipeline_events")
      .select(
        `id, previous_status, new_status, performed_by, occurred_at, notes, metadata, profiles:performed_by ( full_name, role )`,
      )
      .eq("pipeline_item_id", item.id)
      .order("occurred_at", { ascending: true });

    setAuditTarget({ item, events: (data as AuditEvent[]) ?? [] });
  }, []);

  function getSlaClass(slaDeadline: string | null, status: PipelineStatus) {
    if (!slaDeadline || status === "publicado_finalizado") {
      return "";
    }

    const ms = new Date(slaDeadline).getTime() - Date.now();

    if (ms < 0) {
      return "text-red-600 font-semibold";
    }

    if (ms < 2 * 60 * 60 * 1000) {
      return "text-yellow-600 font-semibold";
    }

    return "text-green-600";
  }

  const displayedItems = useMemo(
    () =>
      filterSearch.trim()
        ? items.filter((item) =>
            item.attendances?.patient_name
              ?.toLowerCase()
              .includes(filterSearch.trim().toLowerCase()),
          )
        : items,
    [items, filterSearch],
  );

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
    "publicado_finalizado",
  ];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Gerencial - Pós-atendimento
        </h1>
        <p className="text-sm text-slate-500">Visão executiva das esteiras</p>
      </div>

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Em aberto"
              value={String(summary.total_aberto)}
              helper="esteiras ativas"
              accent="amber"
              compact
            />
            <MetricCard
              label="Finalizadas hoje"
              value={String(summary.total_finalizado_hoje)}
              helper="publicadas hoje"
              accent="teal"
              compact
            />
            <MetricCard
              label="Laudos atrasados"
              value={String(summary.laudo_atrasado)}
              helper="com SLA vencido"
              accent={summary.laudo_atrasado > 0 ? "rose" : "slate"}
              compact
            />
            <MetricCard
              label="Fotos atrasadas"
              value={String(summary.foto_atrasado)}
              helper="com SLA vencido"
              accent={summary.foto_atrasado > 0 ? "rose" : "slate"}
              compact
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCard
              label="Laudos: pendente envio"
              value={String(summary.laudo_pendente_envio)}
              helper="aguardando envio"
              accent="slate"
              compact
            />
            <MetricCard
              label="Laudos: enviado"
              value={String(summary.laudo_enviado_radiologista)}
              helper="no radiologista"
              accent="slate"
              compact
            />
            <MetricCard
              label="Cefalo.: enviado"
              value={String(summary.cefalo_enviado_radiologista)}
              helper="no radiologista"
              accent="slate"
              compact
            />
            <MetricCard
              label="Fotos: em ajuste"
              value={String(summary.foto_em_ajuste)}
              helper="em edicao"
              accent="slate"
              compact
            />
            <MetricCard
              label="Fotos: em lab."
              value={String(summary.foto_em_laboratorio)}
              helper="enviado impressao"
              accent="slate"
              compact
            />
          </div>
        </div>
      )}

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

        <select
          value={filterFinished}
          onChange={(event) =>
            setFilterFinished(
              event.target.value as "todos" | "aberto" | "finalizado",
            )
          }
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="todos">Todos</option>
          <option value="aberto">Apenas abertos</option>
          <option value="finalizado">Apenas finalizados</option>
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

        <input
          type="date"
          value={filterOpenedFrom}
          onChange={(event) => setFilterOpenedFrom(event.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
          title="Abertura a partir de"
        />

        <input
          type="date"
          value={filterOpenedTo}
          onChange={(event) => setFilterOpenedTo(event.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
          title="Abertura até"
        />

        <span className="ml-auto text-xs text-slate-400">
          {total} resultado{total !== 1 ? "s" : ""}
        </span>
      </div>

      {displayedItems.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
          Nenhuma esteira encontrada com os filtros selecionados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Exames</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Abertura</th>
                <th className="px-4 py-3 font-medium">Prazo</th>
                <th className="px-4 py-3 font-medium">Finalizado em</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayedItems.map((item) => (
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
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(item.opened_at)}
                  </td>
                  <td
                    className={`px-4 py-3 ${getSlaClass(item.sla_deadline, item.status)}`}
                  >
                    {item.sla_deadline ? (
                      formatDateTime(item.sla_deadline)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {item.finished_at ? (
                      formatDateTime(item.finished_at)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openAudit(item)}
                        className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Auditoria
                      </button>
                      {isAdmin && item.status === "publicado_finalizado" && (
                        <button
                          onClick={() => setReopenTarget(item)}
                          className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                        >
                          Reabrir
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setCorrectTarget(item)}
                          className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                        >
                          Corrigir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => fetchPage(page - 1)}
            disabled={page === 0 || loading}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            ← Anterior
          </button>
          <span className="text-sm text-slate-500">
            Página {page + 1} de {totalPages}
          </span>
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            Próxima →
          </button>
        </div>
      )}

      {reopenTarget && (
        <ReopenModal
          pipelineItemId={reopenTarget.id}
          patientName={reopenTarget.attendances?.patient_name ?? "Paciente"}
          onConfirm={async (reason) => {
            const reopenStatusMap: Record<PipelineType, PipelineStatus> = {
              laudo: "revisado_liberado",
              cefalometria: "revisado_liberado",
              fotografia: "publicado_idoc",
              escaneamento: "em_ajuste",
            };
            const newStatus = reopenStatusMap[reopenTarget.pipeline_type];
            await handleAdminAction(
              reopenTarget.id,
              "reopen",
              newStatus,
              reason,
            );
          }}
          onClose={() => setReopenTarget(null)}
        />
      )}

      {correctTarget && (
        <CorrectStatusModal
          pipelineItemId={correctTarget.id}
          patientName={correctTarget.attendances?.patient_name ?? "Paciente"}
          currentStatus={correctTarget.status}
          pipelineType={correctTarget.pipeline_type}
          onConfirm={async (newStatus, reason) => {
            await handleAdminAction(
              correctTarget.id,
              "correct-status",
              newStatus,
              reason,
            );
          }}
          onClose={() => setCorrectTarget(null)}
        />
      )}

      {auditTarget && (
        <AuditModal
          patientName={auditTarget.item.attendances?.patient_name ?? "Paciente"}
          events={auditTarget.events}
          onClose={() => setAuditTarget(null)}
        />
      )}
    </div>
  );
}
