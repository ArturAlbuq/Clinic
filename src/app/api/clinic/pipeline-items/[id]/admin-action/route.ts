import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/server-error";
import type { PipelineStatus } from "@/lib/database.types";

type AdminActionBody = {
  action: "reopen" | "correct-status";
  newStatus: PipelineStatus;
  reason: string;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const { supabase, profile } = await requireRole("admin");
  const { id } = await params;

  let body: AdminActionBody | null = null;
  try {
    body = (await request.json()) as AdminActionBody;
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  if (!body || !body.action || !body.newStatus || !body.reason?.trim()) {
    return jsonError("Acao, novo status e motivo sao obrigatorios.", 400);
  }

  const reason = body.reason.trim();
  if (reason.length < 3) {
    return jsonError("Motivo deve ter pelo menos 3 caracteres.", 400);
  }

  // Fetch the current item to validate
  const { data: item, error: fetchError } = await supabase
    .from("pipeline_items")
    .select("id, status, pipeline_type, finished_at")
    .eq("id", id)
    .single();

  if (fetchError || !item) {
    return jsonError("Esteira nao encontrada.", 404);
  }

  if (body.action === "reopen" && item.status !== "publicado_finalizado") {
    return jsonError("Apenas esteiras finalizadas podem ser reabertas.", 409);
  }

  // Perform the UPDATE — the log_pipeline_item_event trigger writes the event automatically.
  // We pass the reason as notes so the trigger captures it.
  const { error: updateError } = await supabase
    .from("pipeline_items")
    .update({
      status: body.newStatus,
      notes: reason,
    })
    .eq("id", id);

  if (updateError) {
    logServerError("admin_action.pipeline_items.update", updateError);
    return jsonError("Nao foi possivel executar a acao.", 400);
  }

  return NextResponse.json({ success: true });
}
