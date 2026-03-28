import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import { getManagerApprovalPassword } from "@/lib/env";

type CancelAttendanceBody = {
  managerPassword?: string;
  reason?: string;
};

type CancelAttendancePayload = {
  attendance: AttendanceRecord;
  queueItems: QueueItemRecord[];
};

function secretsMatch(input: string, expected: string) {
  const inputHash = createHash("sha256").update(input).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(inputHash, expectedHash);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const { id } = await context.params;
  const body = (await request.json()) as CancelAttendanceBody;
  const reason = body.reason?.trim() ?? "";
  const managerPassword = body.managerPassword?.trim() ?? "";

  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Informe o motivo do cancelamento." },
      { status: 400 },
    );
  }

  if (!managerPassword) {
    return NextResponse.json(
      { error: "Informe a senha da gerência." },
      { status: 400 },
    );
  }

  let expectedPassword: string;

  try {
    expectedPassword = getManagerApprovalPassword();
  } catch {
    return NextResponse.json(
      { error: "Senha da gerência não configurada no ambiente." },
      { status: 500 },
    );
  }

  if (!secretsMatch(managerPassword, expectedPassword)) {
    return NextResponse.json(
      { error: "Senha da gerência inválida." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.rpc("cancel_attendance", {
    p_attendance_id: id,
    p_authorized_by: profile.role === "admin" ? profile.id : null,
    p_reason: reason,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível cancelar o atendimento." },
      { status: 400 },
    );
  }

  return NextResponse.json(data as CancelAttendancePayload);
}
