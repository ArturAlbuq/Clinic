"use client";

import { useEffect, useState } from "react";
import type { RoomSlug } from "@/lib/constants";
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
      } catch {
        return;
      }
    }

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
      .subscribe();

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
      .subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(attendanceChannel);
      void supabase.removeChannel(queueChannel);
    };
  }, [range, rangeKey, roomSlug]);

  return {
    attendances,
    queueItems,
    setAttendances,
    setQueueItems,
  };
}
