import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SUBTYPE_LABELS: Record<string, string> = {
  laudo_2d: "Laudo 2D (panorâmica, periapical, interproximal)",
  laudo_tomografia: "Laudo tomografia",
  laudo_enviado_radiologista: "Enviado ao radiologista (prazo de etapa)",
  cefalometria: "Cefalometria",
  fotografia_idoc: "Fotografia (iDoc)",
  fotografia_impressao: "Fotografia (impressão)",
  escaneamento_digital: "Escaneamento (digital)",
  escaneamento_laboratorio: "Escaneamento (laboratório externo)",
};

export default async function SlaConfigPage() {
  const { supabase } = await requireRole("admin");

  const { data: rows } = await supabase
    .from("sla_config")
    .select("id, pipeline_subtype, business_days, updated_at")
    .order("pipeline_subtype");

  const { SlaConfigEditor } = await import("./sla-config-editor");

  return (
    <SlaConfigEditor
      initialRows={(rows ?? []) as Array<{ id: string; pipeline_subtype: string; business_days: number; updated_at: string }>}
      subtypeLabels={SUBTYPE_LABELS}
    />
  );
}
