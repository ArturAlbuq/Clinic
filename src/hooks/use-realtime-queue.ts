"use client";

import { useEffect, useState } from "react";
import type { RoomSlug } from "@/lib/constants";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { QueueDateRange } from "@/lib/queue";
import { getTodayBounds } from "@/lib/queue";

async function reloadAttendances(range?: QueueDateRange) {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return [];
  }

  const { startIso, endIso } = range ?? getTodayBounds();
  const { data, error } = await supabase
    .from("attendances")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as AttendanceRecord[];
}

async function reloadQueueItems(roomSlug?: RoomSlug, range?: QueueDateRange) {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return [];
  }

  const { startIso, endIso } = range ?? getTodayBounds();
  let query = supabase
    .from("queue_items")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });

  if (roomSlug) {
    query = query.eq("room_slug", roomSlug);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as QueueItemRecord[];
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
      const [nextAttendances, nextQueueItems] = await Promise.all([
        reloadAttendances(range),
        reloadQueueItems(roomSlug, range),
      ]);

      if (!isActive) {
        return;
      }

      setAttendances(nextAttendances);
      setQueueItems(nextQueueItems);
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
