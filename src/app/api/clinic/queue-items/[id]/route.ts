import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { QueueItemRecord, QueueStatus } from "@/lib/database.types";

type UpdateQueueItemBody = {
  status?: QueueStatus;
};

const ALLOWED_STATUSES = new Set<QueueStatus>([
  "aguardando",
  "chamado",
  "em_atendimento",
  "finalizado",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const { id } = await context.params;
  const body = (await request.json()) as UpdateQueueItemBody;

  if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("queue_items")
    .update({
      status: body.status,
      updated_by: profile.id,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível atualizar o status." },
      { status: 400 },
    );
  }

  return NextResponse.json({ queueItem: data as QueueItemRecord });
}
