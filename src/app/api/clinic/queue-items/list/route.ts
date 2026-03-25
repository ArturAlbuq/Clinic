import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import type { RoomSlug } from "@/lib/constants";
import { fetchQueueItems } from "@/lib/queue";

export async function GET(request: Request) {
  const { supabase } = await requireAuthenticatedUser();
  const { searchParams } = new URL(request.url);
  const startIso = searchParams.get("startIso");
  const endIso = searchParams.get("endIso");
  const roomSlug = searchParams.get("roomSlug") as RoomSlug | null;

  if (!startIso || !endIso) {
    return NextResponse.json(
      { error: "Parâmetros startIso e endIso são obrigatórios." },
      { status: 400 },
    );
  }

  const queueItems = await fetchQueueItems(supabase, {
    range: { endIso, startIso },
    roomSlug: roomSlug ?? undefined,
  });

  return NextResponse.json({ queueItems });
}
