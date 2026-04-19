import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GerencialPage() {
  const { supabase, profile } = await requireRole(["admin", "gerencia"]);

  // Fetch first page of ALL pipeline_items (including finalizados)
  const { data: pipelineItems, count } = await supabase
    .from("pipeline_items")
    .select(
      `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at, finished_at,
       attendances ( patient_name ), queue_items ( exam_type ), profiles:responsible_id ( full_name )`,
      { count: "exact" }
    )
    .order("opened_at", { ascending: false })
    .range(0, 19);

  const { GerencialDashboard } = await import("./gerencial-dashboard");

  return (
    <GerencialDashboard
      initialItems={(pipelineItems ?? []) as never[]}
      initialTotal={count ?? 0}
      currentProfile={profile}
    />
  );
}
