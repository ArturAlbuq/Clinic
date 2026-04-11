import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { fetchAttendances } from "@/lib/queue";

export async function GET(request: Request) {
  const { supabase } = await requireAuthenticatedUser();
  const { searchParams } = new URL(request.url);
  const startIso = searchParams.get("startIso");
  const endIso = searchParams.get("endIso");
  const includePendingReturns = searchParams.get("includePendingReturns") === "1";

  if (!startIso || !endIso) {
    return NextResponse.json(
      { error: "Parâmetros startIso e endIso são obrigatórios." },
      { status: 400 },
    );
  }

  const attendances = await fetchAttendances(supabase, {
    includePendingReturns,
    range: { endIso, startIso },
  });

  return NextResponse.json({ attendances });
}
