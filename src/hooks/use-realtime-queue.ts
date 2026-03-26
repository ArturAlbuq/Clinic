"use client";

import { useEffect, useState } from "react";
import type { RealtimeStatus, RoomSlug } from "@/lib/constants";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { QueueDateRange } from "@/lib/queue";
import { getTodayBounds } from "@/lib/queue";

async function reloadAttendances(range?: QueueDateRange) {
  const { startIso, endIso } = range ?? getTodayBounds();
  const response = await fetch(
    `/api/clinic/attendances/list?startIso=${encodeURIComponent(startIso)}&endIso=${encodeURIComponent(endIso)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );

  if (!response.ok) {
    throw new Error("Não foi possível recarregar os atendimentos.");
  }

  const payload = (await response.json()) as { attendances?: AttendanceRecord[] };
  return payload.attendances ?? [];
}

async function reloadQueueItems(roomSlug?: RoomSlug, range?: QueueDateRange) {
  const { startIso, endIso } = range ?? getTodayBounds();
  const params = new URLSearchParams({
    endIso,
    startIso,
  });

  if (roomSlug) {
    params.set("roomSlug", roomSlug);
  }

  const response = await fetch(`/api/clinic/queue-items/list?${params.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Não foi possível recarregar a fila.");
  }

  const payload = (await response.json()) as { queueItems?: QueueItemRecord[] };
  return payload.queueItems ?? [];
}

export function useRealtimeClinicData(options: {
  initialAttendances: AttendanceRecord[];
  initialQueueItems: QueueItemRecord[];
  range?: QueueDateRange;
  roomSlug?: RoomSlug;
}) {
  const { initialAttendances, initialQueueItems, range, roomSlug } = options;
  const [attendances, setAttendances] = useState(initialAttendances);
  const [queueItems, setQueueItems] = useState(initialQueueItems);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("conectando");
  const [realtimeError, setRealtimeError] = useState("");
  const rangeKey = range ? `${range.startIso}:${range.endIso}` : "today";

  useEffect(() => {
    setAttendances(initialAttendances);
  }, [initialAttendances]);

  useEffect(() => {
    setQueueItems(initialQueueItems);
  }, [initialQueueItems]);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      setRealtimeStatus("offline");
      setRealtimeError("Supabase não configurado para sincronização em tempo real.");
      return;
    }

    let isActive = true;

    async function refreshAll() {
      try {
        const [nextAttendances, nextQueueItems] = await Promise.all([
          reloadAttendances(range),
          reloadQueueItems(roomSlug, range),
        ]);

        if (!isActive) {
          return;
        }

        setAttendances(nextAttendances);
        setQueueItems(nextQueueItems);
        setRealtimeError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRealtimeStatus("instavel");
        setRealtimeError(
          error instanceof Error
            ? error.message
            : "Falha ao sincronizar os dados em tempo real.",
        );
      }
    }

    function handleChannelStatus(status: string) {
      if (!isActive) {
        return;
      }

      if (status === "SUBSCRIBED") {
        setRealtimeStatus("conectado");
        setRealtimeError("");
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setRealtimeStatus("instavel");
        return;
      }

      if (status === "CLOSED") {
        setRealtimeStatus("offline");
      }
    }

    setRealtimeStatus("conectando");

    const attendanceChannel = supabase
      .channel(roomSlug ? `attendances-${roomSlug}` : "attendances-all")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendances",
        },
        () => {
          void refreshAll();
        },
      )
      .subscribe(handleChannelStatus);

    const queueChannel = supabase
      .channel(roomSlug ? `queue-items-${roomSlug}` : "queue-items-all")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_items",
        },
        () => {
          void refreshAll();
        },
      )
      .subscribe(handleChannelStatus);

    return () => {
      isActive = false;
      setRealtimeStatus("offline");
      void supabase.removeChannel(attendanceChannel);
      void supabase.removeChannel(queueChannel);
    };
  }, [range, rangeKey, roomSlug]);

  return {
    attendances,
    queueItems,
    realtimeError,
    realtimeStatus,
    setAttendances,
    setQueueItems,
  };
}
