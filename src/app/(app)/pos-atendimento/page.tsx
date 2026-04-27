import { requireRole } from "@/lib/auth";
import {
  enrichPipelineItemsWithExams,
  PIPELINE_ITEM_BASE_SELECT,
  type PipelineItemBaseRow,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function PosAtendimentoPage() {
  const { supabase, profile } = await requireRole([
    "recepcao",
    "atendimento",
    "admin",
    "gerencia",
  ]);

  const { data: pipelineItems, error: pipelineItemsError } = await supabase
    .from("pipeline_items")
    .select(PIPELINE_ITEM_BASE_SELECT)
    .is("attendances.deleted_at", null)
    .neq("status", "publicado_finalizado")
    .order("opened_at", { ascending: true });

  console.log("[pos-atendimento] query", {
    err: pipelineItemsError?.message ?? null,
    code: pipelineItemsError?.code ?? null,
    details: pipelineItemsError?.details ?? null,
    hint: pipelineItemsError?.hint ?? null,
    count: pipelineItems?.length ?? 0,
  });

  const hydratedPipelineItems = await enrichPipelineItemsWithExams(
    supabase,
    (pipelineItems ?? []) as PipelineItemBaseRow[],
  );

  console.log("[pos-atendimento] hydrated count", hydratedPipelineItems.length);

  const { PosAtendimentoDashboard } = await import(
    "./pos-atendimento-dashboard"
  );

  return (
    <PosAtendimentoDashboard
      initialItems={hydratedPipelineItems}
      currentProfile={profile}
    />
  );
}
