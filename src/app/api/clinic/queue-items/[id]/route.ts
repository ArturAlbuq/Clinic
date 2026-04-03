import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { QueueItemRecord, QueueStatus } from "@/lib/database.types";
import { normalizeQueueItemRecord } from "@/lib/queue";
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
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const { id } = await context.params;
  const body = await parseBody(request);

  if (!body) {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido." },
      { status: 400 },
    );
  }

  if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Status invalido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("queue_items")
    .update({
      status: body.status,
      updated_by: profile.id,
    })
    .eq("id", id)
    .neq("status", body.status)
    .select("*")
    .maybeSingle();

  if (data) {
    return NextResponse.json({
      queueItem: normalizeQueueItemRecord(data as QueueItemRecord),
    });
  }

  const { data: currentItem, error: currentItemError } = await supabase
    .from("queue_items")
    .select("*")
    .eq("id", id)
    .single();

  if (!currentItemError && currentItem && currentItem.status === body.status) {
    return NextResponse.json({
      queueItem: normalizeQueueItemRecord(currentItem as QueueItemRecord),
    });
  }

  if (error || currentItemError || !currentItem) {
    logServerError("update_queue_item", error ?? currentItemError);

    return NextResponse.json(
      { error: "Nao foi possivel atualizar o status." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    queueItem: normalizeQueueItemRecord(currentItem as QueueItemRecord),
  });
}
