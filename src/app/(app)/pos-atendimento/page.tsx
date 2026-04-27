import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  enrichPipelineItemsWithExams,
  PIPELINE_ITEM_BASE_SELECT,
  type PipelineItemBaseRow,
} from "@/lib/pipeline";
import { formatDateInputValue, parseDateInput, clinicLocalDateToUtcDate, getClinicDateParts } from "@/lib/date";

export const dynamic = "force-dynamic";

type PosAtendimentoPageProps = {
  searchParams: Promise<{
    date?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function PosAtendimentoPage({
  searchParams,
}: PosAtendimentoPageProps) {
  const { supabase, profile } = await requireRole([
    "recepcao",
    "atendimento",
    "admin",
    "gerencia",
  ]);

  const params = await searchParams;

  // Se não há filtro de data, redireciona para hoje
  if (!params.date && !params.from && !params.to) {
    redirect(`/pos-atendimento?date=${formatDateInputValue(new Date())}`);
  }

  let startIso: string;
  let endIso: string;

  if (params.date) {
    // Filtro por dia único: abre às 00:00 e fecha às 00:00 do dia seguinte (timezone da clínica)
    const date = parseDateInput(params.date);
    const parts = getClinicDateParts(date);
    startIso = clinicLocalDateToUtcDate({ year: parts.year, month: parts.month, day: parts.day, hour: 0 }).toISOString();
    endIso = clinicLocalDateToUtcDate({ year: parts.year, month: parts.month, day: parts.day + 1, hour: 0 }).toISOString();
  } else {
    // Filtro por intervalo De/Ate
    const from = parseDateInput(params.from);
    const fromParts = getClinicDateParts(from);
    startIso = clinicLocalDateToUtcDate({ year: fromParts.year, month: fromParts.month, day: fromParts.day, hour: 0 }).toISOString();

    if (params.to) {
      const to = parseDateInput(params.to);
      const toParts = getClinicDateParts(to);
      endIso = clinicLocalDateToUtcDate({ year: toParts.year, month: toParts.month, day: toParts.day + 1, hour: 0 }).toISOString();
    } else {
      // Sem "ate": vai até o fim do dia atual da clínica
      const nowParts = getClinicDateParts(new Date());
      endIso = clinicLocalDateToUtcDate({ year: nowParts.year, month: nowParts.month, day: nowParts.day + 1, hour: 0 }).toISOString();
    }
  }

  // Filtra server-side pelo intervalo — evita o limite de 1000 linhas do PostgREST
  const { data: pipelineItems } = await supabase
    .from("pipeline_items")
    .select(PIPELINE_ITEM_BASE_SELECT)
    .is("attendances.deleted_at", null)
    .neq("status", "publicado_finalizado")
    .gte("opened_at", startIso)
    .lt("opened_at", endIso)
    .order("opened_at", { ascending: true });

  const hydratedPipelineItems = await enrichPipelineItemsWithExams(
    supabase,
    (pipelineItems ?? []) as PipelineItemBaseRow[],
  );

  const { PosAtendimentoDashboard } = await import(
    "./pos-atendimento-dashboard"
  );

  return (
    <PosAtendimentoDashboard
      initialItems={hydratedPipelineItems}
      currentProfile={profile}
      selectedDate={params.date ?? ""}
      selectedFrom={params.from ?? ""}
      selectedTo={params.to ?? ""}
    />
  );
}
