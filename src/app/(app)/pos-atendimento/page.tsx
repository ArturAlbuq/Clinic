import { requireRole } from "@/lib/auth";

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
    .select(
      `id, attendance_id, queue_item_id, pipeline_type, status, responsible_id, sla_deadline, metadata, opened_at, updated_at,
       attendances ( patient_name ), queue_items ( exam_type ), profiles!pipeline_items_responsible_id_fkey ( full_name )`
    )
    .neq("status", "publicado_finalizado")
    .order("opened_at", { ascending: true });

  const { PosAtendimentoDashboard } = await import(
    "./pos-atendimento-dashboard"
  );

  return (
    <PosAtendimentoDashboard
      initialItems={pipelineItems ?? []}
      currentProfile={profile}
    />
  );
}
