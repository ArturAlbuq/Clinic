import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type {
  AppRole,
  AttendanceRecord,
  QueueItemRecord,
  QueueStatus,
} from "@/lib/database.types";
import { normalizeAttendanceRecord, normalizeQueueItemRecord } from "@/lib/queue";
import { logServerError } from "@/lib/server-error";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";

type UpdateQueueItemBody = {
  action?: "cancel" | "return-pending";
  isPending?: boolean;
  reason?: string;
  status?: QueueStatus;
};

type QueueItemMutationPayload = {
  attendance: AttendanceRecord;
  queueItem?: QueueItemRecord;
  queueItems?: QueueItemRecord[];
};

type AttendanceMutationPayload = {
  attendance: AttendanceRecord;
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

function normalizeMutationPayload(payload: QueueItemMutationPayload) {
  return {
    attendance: normalizeAttendanceRecord(payload.attendance),
    queueItem: payload.queueItem
      ? normalizeQueueItemRecord(payload.queueItem)
      : undefined,
    queueItems: (payload.queueItems ?? []).map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  };
}

function mapCancelQueueItemError(message?: string | null) {
  if (!message) {
    return { error: "Nao foi possivel cancelar a etapa.", status: 400 };
  }

  if (message.includes("Could not find the function public.cancel_queue_item")) {
    return {
      error: "Cancelamento por etapa indisponivel ate atualizar o banco.",
      status: 503,
    };
  }

  if (message.includes("etapa nao encontrada")) {
    return { error: "Etapa nao encontrada.", status: 404 };
  }

  if (message.includes("sem permissao")) {
    return { error: "Voce nao tem permissao para esta acao.", status: 403 };
  }

  if (message.includes("motivo de cancelamento obrigatorio")) {
    return { error: "Informe o motivo do cancelamento.", status: 400 };
  }

  if (message.includes("etapa sem cancelamento disponivel")) {
    return { error: "Essa etapa nao pode mais ser cancelada.", status: 409 };
  }

  return { error: "Nao foi possivel cancelar a etapa.", status: 400 };
}

function isMissingCancelQueueItemRpc(message?: string | null) {
  return Boolean(
    message?.includes("Could not find the function public.cancel_queue_item"),
  );
}

function mapQueueItemReturnPendingError(message?: string | null) {
  if (!message) {
    return {
      error: "Nao foi possivel atualizar a pendencia de retorno.",
      status: 400,
    };
  }

  if (
    message.includes(
      "Could not find the function public.set_queue_item_return_pending",
    )
  ) {
    return {
      error: "Pendencia por etapa indisponivel ate atualizar o banco.",
      status: 503,
    };
  }

  if (message.includes("etapa nao encontrada")) {
    return { error: "Etapa nao encontrada.", status: 404 };
  }

  if (message.includes("sem permissao")) {
    return { error: "Voce nao tem permissao para esta acao.", status: 403 };
  }

  if (message.includes("motivo de retorno obrigatorio")) {
    return { error: "Informe o motivo da pendencia de retorno.", status: 400 };
  }

  if (message.includes("etapa sem pendencia")) {
    return {
      error: "Essa etapa nao pode ser movida para pendencia de retorno.",
      status: 409,
    };
  }

  return {
    error: "Nao foi possivel atualizar a pendencia de retorno.",
    status: 400,
  };
}

function isMissingQueueItemReturnPendingRpc(message?: string | null) {
  return Boolean(
    message?.includes(
      "Could not find the function public.set_queue_item_return_pending",
    ),
  );
}

function mapLegacyAttendanceReturnPendingError(message?: string | null) {
  if (!message) {
    return {
      error: "Nao foi possivel atualizar a pendencia de retorno.",
      status: 400,
    };
  }

  if (
    message.includes(
      "Could not find the function public.set_attendance_return_pending",
    )
  ) {
    return {
      error: "Pendencia de retorno indisponivel ate atualizar o banco.",
      status: 503,
    };
  }

  if (message.includes("atendimento nao encontrado")) {
    return { error: "Atendimento nao encontrado.", status: 404 };
  }

  if (message.includes("sem permissao")) {
    return { error: "Voce nao tem permissao para esta acao.", status: 403 };
  }

  if (message.includes("motivo de retorno obrigatorio")) {
    return { error: "Informe o motivo da pendencia de retorno.", status: 400 };
  }

  return {
    error: "Nao foi possivel atualizar a pendencia de retorno.",
    status: 400,
  };
}

async function fetchQueueItemById(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  id: string,
) {
  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return {
    error,
    queueItem: (data as QueueItemRecord | null) ?? null,
  };
}

async function fetchAttendanceQueueItems(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  attendanceId: string,
) {
  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .eq("attendance_id", attendanceId)
    .order("created_at", { ascending: true });

  return {
    error,
    queueItems: ((data as QueueItemRecord[] | null) ?? []).map((queueItem) =>
      normalizeQueueItemRecord(queueItem),
    ),
  };
}

async function fetchAttendanceById(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  attendanceId: string,
) {
  const { data, error } = await supabase
    .from("attendances")
    .select("*")
    .eq("id", attendanceId)
    .maybeSingle();

  return {
    attendance: (data as AttendanceRecord | null) ?? null,
    error,
  };
}

async function runDirectQueueItemCancellation(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  actorUserId: string,
  id: string,
) {
  const currentItemResult = await fetchQueueItemById(supabase, id);

  if (currentItemResult.error || !currentItemResult.queueItem) {
    logServerError(
      "queue_items.fetch_for_direct_stage_cancel",
      currentItemResult.error,
    );

    return NextResponse.json({ error: "Etapa nao encontrada." }, { status: 404 });
  }

  if (
    currentItemResult.queueItem.status === "finalizado" ||
    currentItemResult.queueItem.status === "cancelado"
  ) {
    return NextResponse.json(
      { error: "Essa etapa nao pode mais ser cancelada." },
      { status: 409 },
    );
  }

  const { data: updatedItem, error: updateError } = await supabase
    .from("queue_items")
    .update({
      status: "cancelado",
      updated_by: actorUserId,
    })
    .eq("id", id)
    .not("status", "in", '("finalizado","cancelado")')
    .select("*")
    .maybeSingle();

  if (updateError || !updatedItem) {
    logServerError("queue_items.direct_stage_cancel", updateError);

    const message = updateError?.message ?? "";

    if (
      message.includes("column") ||
      message.includes("schema cache")
    ) {
      return NextResponse.json(
        { error: "Cancelamento por etapa indisponivel ate atualizar o banco." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Nao foi possivel cancelar a etapa." },
      { status: 400 },
    );
  }

  const attendanceResult = await fetchAttendanceById(
    supabase,
    currentItemResult.queueItem.attendance_id,
  );
  const attendanceItemsResult = await fetchAttendanceQueueItems(
    supabase,
    currentItemResult.queueItem.attendance_id,
  );

  if (attendanceResult.error || !attendanceResult.attendance) {
    logServerError(
      "queue_items.fetch_attendance_after_direct_stage_cancel",
      attendanceResult.error,
    );

    return NextResponse.json(
      { error: "Nao foi possivel carregar o atendimento atualizado." },
      { status: 400 },
    );
  }

  if (attendanceItemsResult.error) {
    logServerError(
      "queue_items.fetch_attendance_items_after_direct_stage_cancel",
      attendanceItemsResult.error,
    );
  }

  return NextResponse.json(
    normalizeMutationPayload({
      attendance: attendanceResult.attendance,
      queueItem: updatedItem as QueueItemRecord,
      queueItems: attendanceItemsResult.queueItems,
    }),
  );
}

async function runLegacyAttendanceReturnPending(
  supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],
  currentRole: AppRole,
  actorUserId: string,
  id: string,
  isPending: boolean,
  reason: string | null,
) {
  const currentItemResult = await fetchQueueItemById(supabase, id);

  if (currentItemResult.error || !currentItemResult.queueItem) {
    logServerError(
      "queue_items.fetch_for_legacy_return_pending",
      currentItemResult.error,
    );

    return NextResponse.json({ error: "Etapa nao encontrada." }, { status: 404 });
  }

  const legacyAttempt = await supabase.rpc("set_attendance_return_pending", {
    p_attendance_id: currentItemResult.queueItem.attendance_id,
    p_is_pending: isPending,
    p_reason: reason,
  });

  const payload = legacyAttempt.data as AttendanceMutationPayload | null;

  if (legacyAttempt.error || !payload?.attendance) {
    logServerError("set_attendance_return_pending.rpc", legacyAttempt.error);

    if (
      currentRole === "recepcao" &&
      legacyAttempt.error?.message?.includes("sem permissao")
    ) {
      return runDirectReceptionReturnPending(
        actorUserId,
        id,
        isPending,
        reason,
      );
    }

    const mapped = mapLegacyAttendanceReturnPendingError(legacyAttempt.error?.message);

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const refreshedItemResult = await fetchQueueItemById(supabase, id);
  const attendanceItemsResult = await fetchAttendanceQueueItems(
    supabase,
    currentItemResult.queueItem.attendance_id,
  );

  if (refreshedItemResult.error || !refreshedItemResult.queueItem) {
    logServerError(
      "queue_items.fetch_after_legacy_return_pending",
      refreshedItemResult.error,
    );

    return NextResponse.json(
      { error: "Nao foi possivel carregar a etapa atualizada." },
      { status: 400 },
    );
  }

  if (attendanceItemsResult.error) {
    logServerError(
      "queue_items.fetch_attendance_items_after_legacy_return_pending",
      attendanceItemsResult.error,
    );
  }

  return NextResponse.json(
    normalizeMutationPayload({
      attendance: payload.attendance,
      queueItem: refreshedItemResult.queueItem,
      queueItems: attendanceItemsResult.queueItems,
    }),
  );
}

async function runDirectReceptionReturnPending(
  actorUserId: string,
  id: string,
  isPending: boolean,
  reason: string | null,
) {
  const adminSupabase = getAdminSupabaseClient();
  const currentItemResult = await fetchQueueItemById(adminSupabase, id);

  if (currentItemResult.error || !currentItemResult.queueItem) {
    logServerError(
      "queue_items.fetch_for_direct_reception_return_pending",
      currentItemResult.error,
    );

    return NextResponse.json({ error: "Etapa nao encontrada." }, { status: 404 });
  }

  if (
    currentItemResult.queueItem.status === "finalizado" ||
    currentItemResult.queueItem.status === "cancelado"
  ) {
    return NextResponse.json(
      { error: "Essa etapa nao pode ser movida para pendencia de retorno." },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const directStageUpdate = await adminSupabase
    .from("queue_items")
    .update({
      return_pending_at: isPending ? nowIso : null,
      return_pending_by: isPending ? actorUserId : null,
      return_pending_reason: isPending ? reason : null,
      reactivated_at: isPending ? null : nowIso,
      reactivated_by: isPending ? null : actorUserId,
      updated_by: actorUserId,
    })
    .eq("id", id)
    .not("status", "in", '("finalizado","cancelado")')
    .select("*")
    .maybeSingle();

  if (directStageUpdate.error) {
    logServerError(
      "queue_items.direct_reception_return_pending.stage",
      directStageUpdate.error,
    );

    const message = directStageUpdate.error.message ?? "";

    if (message.includes("column") || message.includes("schema cache")) {
      const attendanceUpdate = await adminSupabase
        .from("attendances")
        .update({
          return_pending_at: isPending ? nowIso : null,
          return_pending_by: isPending ? actorUserId : null,
          return_pending_reason: isPending ? reason : null,
        })
        .eq("id", currentItemResult.queueItem.attendance_id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (attendanceUpdate.error || !attendanceUpdate.data) {
        logServerError(
          "queue_items.direct_reception_return_pending.attendance",
          attendanceUpdate.error,
        );

        return NextResponse.json(
          { error: "Nao foi possivel atualizar a pendencia de retorno." },
          { status: 400 },
        );
      }

      const refreshedItemResult = await fetchQueueItemById(adminSupabase, id);
      const attendanceItemsResult = await fetchAttendanceQueueItems(
        adminSupabase,
        currentItemResult.queueItem.attendance_id,
      );

      if (refreshedItemResult.error || !refreshedItemResult.queueItem) {
        logServerError(
          "queue_items.fetch_after_direct_reception_return_pending",
          refreshedItemResult.error,
        );

        return NextResponse.json(
          { error: "Nao foi possivel carregar a etapa atualizada." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        normalizeMutationPayload({
          attendance: attendanceUpdate.data as AttendanceRecord,
          queueItem: refreshedItemResult.queueItem,
          queueItems: attendanceItemsResult.queueItems,
        }),
      );
    }

    return NextResponse.json(
      { error: "Nao foi possivel atualizar a pendencia de retorno." },
      { status: 400 },
    );
  }

  const attendanceResult = await fetchAttendanceById(
    adminSupabase,
    currentItemResult.queueItem.attendance_id,
  );
  const attendanceItemsResult = await fetchAttendanceQueueItems(
    adminSupabase,
    currentItemResult.queueItem.attendance_id,
  );

  if (attendanceResult.error || !attendanceResult.attendance) {
    logServerError(
      "queue_items.fetch_attendance_after_direct_reception_return_pending",
      attendanceResult.error,
    );

    return NextResponse.json(
      { error: "Nao foi possivel carregar o atendimento atualizado." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    normalizeMutationPayload({
      attendance: attendanceResult.attendance,
      queueItem: directStageUpdate.data as QueueItemRecord,
      queueItems: attendanceItemsResult.queueItems,
    }),
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await parseBody(request);

  if (!body) {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido." },
      { status: 400 },
    );
  }

  if (body.action === "cancel") {
    const { profile, supabase } = await requireRole("admin");
    const reason = body.reason?.trim() ?? "";

    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Informe o motivo do cancelamento." },
        { status: 400 },
      );
    }

    const cancelAttempt = await supabase.rpc("cancel_queue_item", {
      p_authorized_by: null,
      p_queue_item_id: id,
      p_reason: reason,
    });

    const payload = cancelAttempt.data as QueueItemMutationPayload | null;

    if (cancelAttempt.error || !payload?.attendance) {
      if (isMissingCancelQueueItemRpc(cancelAttempt.error?.message)) {
        return runDirectQueueItemCancellation(supabase, profile.id, id);
      }

      logServerError("cancel_queue_item.rpc", cancelAttempt.error);
      const mapped = mapCancelQueueItemError(cancelAttempt.error?.message);

      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    return NextResponse.json(normalizeMutationPayload(payload));
  }

  if (body.action === "return-pending") {
    const { profile, supabase } = await requireRole([
      "recepcao",
      "atendimento",
      "admin",
    ]);

    if (typeof body.isPending !== "boolean") {
      return NextResponse.json(
        { error: "Corpo da requisicao invalido." },
        { status: 400 },
      );
    }

    const reason = body.reason?.trim() ?? "";

    if (body.isPending && reason.length < 3) {
      return NextResponse.json(
        { error: "Informe o motivo da pendencia de retorno." },
        { status: 400 },
      );
    }

    const returnAttempt = await supabase.rpc("set_queue_item_return_pending", {
      p_is_pending: body.isPending,
      p_queue_item_id: id,
      p_reason: reason || null,
    });

    const payload = returnAttempt.data as QueueItemMutationPayload | null;

    if (returnAttempt.error || !payload?.attendance) {
      if (isMissingQueueItemReturnPendingRpc(returnAttempt.error?.message)) {
        return runLegacyAttendanceReturnPending(
          supabase,
          profile.role,
          profile.id,
          id,
          body.isPending,
          reason || null,
        );
      }

      logServerError("set_queue_item_return_pending.rpc", returnAttempt.error);

      if (
        profile.role === "recepcao" &&
        returnAttempt.error?.message?.includes("sem permissao")
      ) {
        return runDirectReceptionReturnPending(
          profile.id,
          id,
          body.isPending,
          reason || null,
        );
      }

      const mapped = mapQueueItemReturnPendingError(returnAttempt.error?.message);

      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    return NextResponse.json(normalizeMutationPayload(payload));
  }

  if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Status invalido." }, { status: 400 });
  }

  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
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
