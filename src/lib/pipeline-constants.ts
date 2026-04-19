import type { PipelineStatus, PipelineType } from "@/lib/database.types";

export const PIPELINE_TYPE_LABELS: Record<PipelineType, string> = {
  laudo: "Laudo",
  cefalometria: "Cefalometria",
  fotografia: "Fotografia",
  escaneamento: "Escaneamento",
};

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  nao_iniciado: "Não iniciado",
  pendente_envio: "Pendente envio",
  enviado_radiologista: "Enviado ao radiologista",
  recebido_radiologista: "Recebido pelo radiologista",
  devolvido_radiologista: "Devolvido pelo radiologista",
  recebido_corrigido: "Recebido corrigido",
  revisado_liberado: "Revisado e liberado",
  em_ajuste: "Em ajuste",
  publicado_idoc: "Publicado no iDoc",
  disponivel_impressao: "Disponível para impressão",
  enviado_impressao: "Enviado para impressão",
  recebido_laboratorio: "Recebido pelo laboratório",
  enviado_laboratorio_externo: "Enviado ao laboratório externo",
  retornado_laboratorio: "Retornado do laboratório",
  publicado_finalizado: "Publicado / Finalizado",
};

export function getPipelineStatusBadgeClass(status: PipelineStatus): string {
  const map: Partial<Record<PipelineStatus, string>> = {
    nao_iniciado: "bg-slate-100 text-slate-600",
    pendente_envio: "bg-yellow-100 text-yellow-700",
    enviado_radiologista: "bg-blue-100 text-blue-700",
    recebido_radiologista: "bg-blue-200 text-blue-800",
    devolvido_radiologista: "bg-orange-100 text-orange-700",
    recebido_corrigido: "bg-orange-200 text-orange-800",
    revisado_liberado: "bg-green-100 text-green-700",
    em_ajuste: "bg-purple-100 text-purple-700",
    publicado_idoc: "bg-teal-100 text-teal-700",
    disponivel_impressao: "bg-teal-200 text-teal-800",
    enviado_impressao: "bg-indigo-100 text-indigo-700",
    recebido_laboratorio: "bg-indigo-200 text-indigo-800",
    enviado_laboratorio_externo: "bg-violet-100 text-violet-700",
    retornado_laboratorio: "bg-violet-200 text-violet-800",
    publicado_finalizado: "bg-green-200 text-green-800",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

export const PIPELINE_TYPE_BADGE_CLASS: Record<PipelineType, string> = {
  laudo: "bg-blue-50 text-blue-700",
  cefalometria: "bg-violet-50 text-violet-700",
  fotografia: "bg-pink-50 text-pink-700",
  escaneamento: "bg-emerald-50 text-emerald-700",
};

export function getNextStatuses(
  type: PipelineType,
  currentStatus: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  if (type === "laudo" || type === "cefalometria") {
    return getLaudoNextStatuses(currentStatus);
  }
  if (type === "fotografia") {
    return getFotografiaNextStatuses(currentStatus, metadata);
  }
  if (type === "escaneamento") {
    return getEscaneamentoNextStatuses(currentStatus, metadata);
  }
  return [];
}

function getLaudoNextStatuses(current: PipelineStatus): PipelineStatus[] {
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["pendente_envio"],
    pendente_envio: ["enviado_radiologista"],
    enviado_radiologista: ["recebido_radiologista"],
    recebido_radiologista: ["revisado_liberado", "devolvido_radiologista"],
    devolvido_radiologista: ["recebido_corrigido"],
    recebido_corrigido: ["revisado_liberado"],
    revisado_liberado: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}

function getFotografiaNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const comImpressao = Boolean(metadata.com_impressao);
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["em_ajuste"],
    em_ajuste: ["publicado_idoc"],
    publicado_idoc: comImpressao ? ["disponivel_impressao"] : ["publicado_finalizado"],
    disponivel_impressao: ["enviado_impressao"],
    enviado_impressao: ["recebido_laboratorio"],
    recebido_laboratorio: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}

function getEscaneamentoNextStatuses(
  current: PipelineStatus,
  metadata: Record<string, unknown>
): PipelineStatus[] {
  const laboratorioExterno = Boolean(metadata.laboratorio_externo);
  const map: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
    nao_iniciado: ["em_ajuste"],
    em_ajuste: laboratorioExterno
      ? ["enviado_laboratorio_externo"]
      : ["publicado_finalizado"],
    enviado_laboratorio_externo: ["retornado_laboratorio"],
    retornado_laboratorio: ["publicado_finalizado"],
  };
  return map[current] ?? [];
}
