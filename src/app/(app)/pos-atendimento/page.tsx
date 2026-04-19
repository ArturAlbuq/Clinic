import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PosAtendimentoPage() {
  const { supabase, profile } = await requireRole([
    "recepcao",
    "atendimento",
    "admin",
  ]);

  const { data: pipelineItems } = await supabase
    .from("pipeline_items")
    .select(
      `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at,
       attendances ( patient_name ), queue_items ( exam_type ), profiles:responsible_id ( full_name )`
    )
    .neq("status", "publicado_finalizado")
    .order("opened_at", { ascending: true });

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name", { ascending: true });

  const { PosAtendimentoDashboard } = await import(
    "./pos-atendimento-dashboard"
  );

  return (
    <PosAtendimentoDashboard
      initialItems={pipelineItems ?? []}
      profiles={allProfiles ?? []}
      currentProfile={profile}
    />
  );
}
