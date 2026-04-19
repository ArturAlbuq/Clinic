import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";

type SlaConfigRow = {
  id: string;
  pipeline_subtype: string;
  business_days: number;
  updated_at: string;
};

type PatchBody = {
  updates: Array<{ pipeline_subtype: string; business_days: number }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validateSameOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Origem invalida.", 403);
  }
  return null;
}

export async function GET() {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase
    .from("sla_config")
    .select("id, pipeline_subtype, business_days, updated_at")
    .order("pipeline_subtype");

  if (error) {
    logServerError("sla_config.get", error);
    return jsonError("Nao foi possivel carregar configuracao de SLA.", 500);
  }

  return NextResponse.json({ rows: data as SlaConfigRow[] });
}

export async function PATCH(request: Request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase, profile } = await requireRole("admin");

  let body: PatchBody | null = null;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body?.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
    return jsonError("Lista de atualizacoes invalida.", 400);
  }

  for (const update of body.updates) {
    if (!update.pipeline_subtype || typeof update.business_days !== "number") {
      return jsonError("Cada item deve ter pipeline_subtype e business_days.", 400);
    }
    if (!Number.isInteger(update.business_days) || update.business_days < 1 || update.business_days > 30) {
      return jsonError("business_days deve ser um inteiro entre 1 e 30.", 400);
    }
  }

  for (const update of body.updates) {
    const { error } = await supabase
      .from("sla_config")
      .update({
        business_days: update.business_days,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("pipeline_subtype", update.pipeline_subtype);

    if (error) {
      logServerError("sla_config.patch", error);
      return jsonError("Nao foi possivel salvar a configuracao.", 500);
    }
  }

  // Backfill open items with null sla_deadline for each updated subtype
  for (const update of body.updates) {
    await supabase.rpc("backfill_sla_deadline_for_subtype", {
      p_pipeline_subtype: update.pipeline_subtype,
      p_business_days: update.business_days,
    });
  }

  return NextResponse.json({ success: true });
}
