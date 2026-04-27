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

  const { data: pipelineItems } = await supabase
    .from("pipeline_items")
    .select(PIPELINE_ITEM_BASE_SELECT)
    .is("attendances.deleted_at", null)
    .neq("status", "publicado_finalizado")
    .order("opened_at", { ascending: false });

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
    />
  );
}
