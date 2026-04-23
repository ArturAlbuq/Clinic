import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

export async function GET(request: Request) {
  const { supabase } = await requireRole([
    "recepcao",
    "atendimento",
    "admin",
    "gerencia",
  ]);

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("attendanceIds") ?? "";
  const attendanceIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!attendanceIds.length) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await supabase
    .from("pipeline_items")
    .select("id, attendance_id, pipeline_type, status, sla_deadline, opened_at, metadata")
    .in("attendance_id", attendanceIds)
    .order("opened_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
