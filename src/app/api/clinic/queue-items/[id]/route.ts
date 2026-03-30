import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { QueueItemRecord, QueueStatus } from "@/lib/database.types";
import { logServerError } from "@/lib/server-error";

type UpdateQueueItemBody = {
  status?: QueueStatus;
};

const ALLOWED_STATUSES = new Set<QueueStatus>([
  "aguardando",
  "chamado",
  "em_atendimento",
  "finalizado",
]);

async function parseBody(request: Request) {
  try {
    return (await request.json()) as UpdateQueueItemBody;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const { id } = await context.params;
  const body = await parseBody(request);

  if (!body) {
    return NextResponse.json(
      { error: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

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
    logServerError("update_queue_item", error);

    return NextResponse.json(
      { error: "Não foi possível atualizar o status." },
      { status: 400 },
    );
  }

  return NextResponse.json({ queueItem: data as QueueItemRecord });
}
