import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth";
import type { AttendanceRecord, Database, QueueItemRecord } from "@/lib/database.types";
import { getManagerApprovalPassword, getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/env";
import { appendLegacyCancellationMetadata } from "@/lib/legacy-cancellation";
import { normalizeAttendanceRecord, normalizeQueueItemRecord } from "@/lib/queue";

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

function isLegacyCancelFunctionError(message?: string | null) {
  return Boolean(
    message &&
      message.includes("Could not find the function public.cancel_attendance"),
  );
}

function createServiceRoleClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeCancelPayload(payload: CancelAttendancePayload) {
  return {
    attendance: normalizeAttendanceRecord(payload.attendance),
    queueItems: payload.queueItems.map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  } satisfies CancelAttendancePayload;
}

async function cancelLegacyAttendance(options: {
  attendanceId: string;
  authorizedBy: string | null;
  canceledBy: string;
  reason: string;
}) {
  const serviceRole = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const attendanceResult = await serviceRole
    .from("attendances")
    .select("*")
    .eq("id", options.attendanceId)
    .single();

  if (attendanceResult.error || !attendanceResult.data) {
    throw new Error(
      attendanceResult.error?.message || "Nao foi possivel localizar o atendimento.",
    );
  }

  const queueItemsResult = await serviceRole
    .from("queue_items")
    .select("*")
    .eq("attendance_id", options.attendanceId)
    .order("created_at", { ascending: true });

  if (queueItemsResult.error) {
    throw new Error(
      queueItemsResult.error.message || "Nao foi possivel localizar a fila.",
    );
  }

  const legacyNotes = appendLegacyCancellationMetadata(
    attendanceResult.data.notes,
    {
      authorizedBy: options.authorizedBy,
      canceledAt: nowIso,
      canceledBy: options.canceledBy,
      reason: options.reason,
    },
  );

  const updatedAttendanceResult = await serviceRole
    .from("attendances")
    .update({
      notes: legacyNotes,
    })
    .eq("id", options.attendanceId)
    .select("*")
    .single();

  if (updatedAttendanceResult.error || !updatedAttendanceResult.data) {
    throw new Error(
      updatedAttendanceResult.error?.message ||
        "Nao foi possivel registrar o cancelamento.",
    );
  }

  const queueItems = (queueItemsResult.data ?? []) as QueueItemRecord[];
  const openQueueItemIds = queueItems
    .filter((item) => item.status !== "finalizado")
    .map((item) => item.id);

  let updatedQueueItems = queueItems;

  if (openQueueItemIds.length > 0) {
    const updateResult = await serviceRole
      .from("queue_items")
      .update({
        finished_at: nowIso,
        status: "finalizado",
        updated_by: options.canceledBy,
      })
      .in("id", openQueueItemIds)
      .select("*");

    if (updateResult.error) {
      throw new Error(
        updateResult.error.message || "Nao foi possivel encerrar as etapas abertas.",
      );
    }

    const updatedMap = new Map(
      ((updateResult.data ?? []) as QueueItemRecord[]).map((queueItem) => [
        queueItem.id,
        queueItem,
      ]),
    );

    updatedQueueItems = queueItems.map(
      (queueItem) => updatedMap.get(queueItem.id) ?? queueItem,
    );
  }

  return normalizeCancelPayload({
    attendance: updatedAttendanceResult.data as AttendanceRecord,
    queueItems: updatedQueueItems,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
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
      { error: "Informe a senha da gerencia." },
      { status: 400 },
    );
  }

  let expectedPassword: string;

  try {
    expectedPassword = getManagerApprovalPassword();
  } catch {
    return NextResponse.json(
      { error: "Senha da gerencia nao configurada no ambiente." },
      { status: 500 },
    );
  }

  if (!secretsMatch(managerPassword, expectedPassword)) {
    return NextResponse.json(
      { error: "Senha da gerencia invalida." },
      { status: 403 },
    );
  }

  const cancelAttempt = await supabase.rpc("cancel_attendance", {
    p_attendance_id: id,
    p_authorized_by: profile.role === "admin" ? profile.id : null,
    p_reason: reason,
  });

  let payload = cancelAttempt.data as CancelAttendancePayload | null;
  let cancelError = cancelAttempt.error;

  if (!payload && isLegacyCancelFunctionError(cancelError?.message)) {
    try {
      payload = await cancelLegacyAttendance({
        attendanceId: id,
        authorizedBy: profile.role === "admin" ? profile.id : null,
        canceledBy: profile.id,
        reason,
      });
      cancelError = null;
    } catch (legacyError) {
      cancelError = {
        message:
          legacyError instanceof Error
            ? legacyError.message
            : "Nao foi possivel cancelar o atendimento.",
      } as typeof cancelAttempt.error;
    }
  }

  if (cancelError || !payload) {
    return NextResponse.json(
      { error: cancelError?.message || "Nao foi possivel cancelar o atendimento." },
      { status: 400 },
    );
  }

  return NextResponse.json(normalizeCancelPayload(payload));
}
