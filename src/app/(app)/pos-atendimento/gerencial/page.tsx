import { requireRole } from "@/lib/auth";
import {
  enrichPipelineItemsWithExams,
  PIPELINE_ITEM_BASE_SELECT,
  type PipelineItemBaseRow,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function GerencialPage() {
  const { supabase, profile } = await requireRole(["admin", "gerencia"]);

  // Fetch first page of ALL pipeline_items (including finalizados)
  const { data: pipelineItems, count } = await supabase
    .from("pipeline_items")
    .select(PIPELINE_ITEM_BASE_SELECT, { count: "exact" })
    .is("attendances.deleted_at", null)
    .order("opened_at", { ascending: false })
    .range(0, 19);

  const hydratedPipelineItems = await enrichPipelineItemsWithExams(
    supabase,
    (pipelineItems ?? []) as PipelineItemBaseRow[],
  );

  const { GerencialDashboard } = await import("./gerencial-dashboard");

  return (
    <GerencialDashboard
      initialItems={hydratedPipelineItems}
      initialTotal={count ?? 0}
      currentProfile={profile}
    />
  );
}
