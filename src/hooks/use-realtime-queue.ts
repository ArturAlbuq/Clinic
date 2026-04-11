"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { RealtimeStatus, RoomSlug } from "@/lib/constants";
import type { AttendanceRecord, QueueItemRecord } from "@/lib/database.types";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { QueueDateRange } from "@/lib/queue";
import {
  getTodayBounds,
  normalizeAttendanceRecord,
  normalizeQueueItemRecord,
} from "@/lib/queue";

async function reloadAttendances(
  range?: QueueDateRange,
  includePendingReturns = false,
) {
  const { startIso, endIso } = range ?? getTodayBounds();
  const params = new URLSearchParams({
    endIso,
    startIso,
  });

  if (includePendingReturns) {
    params.set("includePendingReturns", "1");
  }

  const response = await fetch(
    `/api/clinic/attendances/list?${params.toString()}`,
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

async function reloadQueueItems(
  roomSlug?: RoomSlug,
  range?: QueueDateRange,
  includePendingReturns = false,
) {
  const { startIso, endIso } = range ?? getTodayBounds();
  const params = new URLSearchParams({
    endIso,
    startIso,
  });

  if (includePendingReturns) {
    params.set("includePendingReturns", "1");
  }

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

function areRecordsEqual<T extends Record<string, unknown>>(left: T, right: T) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function upsertAttendanceRecord(
  currentAttendances: AttendanceRecord[],
  record: AttendanceRecord,
) {
  const currentIndex = currentAttendances.findIndex(
    (attendance) => attendance.id === record.id,
  );

  if (currentIndex === -1) {
    return [record, ...currentAttendances];
  }

  if (areRecordsEqual(currentAttendances[currentIndex], record)) {
    return currentAttendances;
  }

  const nextAttendances = [...currentAttendances];
  nextAttendances[currentIndex] = record;
  return nextAttendances;
}

function removeAttendanceRecord(
  currentAttendances: AttendanceRecord[],
  attendanceId?: string,
) {
  if (!attendanceId) {
    return currentAttendances;
  }

  const nextAttendances = currentAttendances.filter(
    (attendance) => attendance.id !== attendanceId,
  );

  return nextAttendances.length === currentAttendances.length
    ? currentAttendances
    : nextAttendances;
}

function upsertQueueItemRecord(
  currentQueueItems: QueueItemRecord[],
  record: QueueItemRecord,
  roomSlug?: RoomSlug,
) {
  if (roomSlug && record.room_slug !== roomSlug) {
    return removeQueueItemRecord(currentQueueItems, record.id);
  }

  const currentIndex = currentQueueItems.findIndex((item) => item.id === record.id);

  if (currentIndex === -1) {
    return [...currentQueueItems, record];
  }

  if (areRecordsEqual(currentQueueItems[currentIndex], record)) {
    return currentQueueItems;
  }

  const nextQueueItems = [...currentQueueItems];
  nextQueueItems[currentIndex] = record;
  return nextQueueItems;
}

function removeQueueItemRecord(
  currentQueueItems: QueueItemRecord[],
  queueItemId?: string,
) {
  if (!queueItemId) {
    return currentQueueItems;
  }

  const nextQueueItems = currentQueueItems.filter((item) => item.id !== queueItemId);

  return nextQueueItems.length === currentQueueItems.length
    ? currentQueueItems
    : nextQueueItems;
}

function isActiveAttendanceRecord(record: AttendanceRecord) {
  return !record.deleted_at;
}

function isActiveQueueItemRecord(record: QueueItemRecord) {
  return !record.deleted_at;
}

export function useRealtimeClinicData(options: {
  includePendingReturns?: boolean;
  initialAttendances: AttendanceRecord[];
  initialQueueItems: QueueItemRecord[];
  range?: QueueDateRange;
  roomSlug?: RoomSlug;
}) {
  const {
    includePendingReturns = false,
    initialAttendances,
    initialQueueItems,
    range,
    roomSlug,
  } = options;
  const [attendances, setAttendances] = useState(initialAttendances);
  const [queueItems, setQueueItems] = useState(initialQueueItems);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("conectando");
  const [realtimeError, setRealtimeError] = useState("");
  const rangeKey = range ? `${range.startIso}:${range.endIso}` : "today";
  const rangeRef = useRef(range);

  useEffect(() => {
    setAttendances(initialAttendances);
  }, [initialAttendances]);

  useEffect(() => {
    setQueueItems(initialQueueItems);
  }, [initialQueueItems]);

  useEffect(() => {
    rangeRef.current = range;
  }, [rangeKey, range]);

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
          reloadAttendances(rangeRef.current, includePendingReturns),
          reloadQueueItems(roomSlug, rangeRef.current, includePendingReturns),
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
        void refreshAll();
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
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (!isActive) {
            return;
          }

          if (payload.eventType === "DELETE") {
            setAttendances((currentAttendances) =>
              removeAttendanceRecord(
                currentAttendances,
                String(payload.old.id ?? ""),
              ),
            );
            return;
          }

          if (!payload.new.id) {
            void refreshAll();
            return;
          }

          const nextAttendance = normalizeAttendanceRecord(
            payload.new as unknown as AttendanceRecord,
          );

          if (!isActiveAttendanceRecord(nextAttendance)) {
            setAttendances((currentAttendances) =>
              removeAttendanceRecord(currentAttendances, nextAttendance.id),
            );
            return;
          }

          setAttendances((currentAttendances) =>
            upsertAttendanceRecord(currentAttendances, nextAttendance),
          );
        },
      )
      .subscribe(handleChannelStatus);

    const queueChannel = supabase
      .channel(roomSlug ? `queue-items-${roomSlug}` : "queue-items-all")
      .on(
        "postgres_changes",
        {
          event: "*",
          ...(roomSlug ? { filter: `room_slug=eq.${roomSlug}` } : {}),
          schema: "public",
          table: "queue_items",
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (!isActive) {
            return;
          }

          if (payload.eventType === "DELETE") {
            setQueueItems((currentQueueItems) =>
              removeQueueItemRecord(currentQueueItems, String(payload.old.id ?? "")),
            );
            return;
          }

          if (!payload.new.id) {
            void refreshAll();
            return;
          }

          const nextQueueItem = normalizeQueueItemRecord(
            payload.new as unknown as QueueItemRecord,
          );

          if (!isActiveQueueItemRecord(nextQueueItem)) {
            setQueueItems((currentQueueItems) =>
              removeQueueItemRecord(currentQueueItems, nextQueueItem.id),
            );
            return;
          }

          setQueueItems((currentQueueItems) =>
            upsertQueueItemRecord(currentQueueItems, nextQueueItem, roomSlug),
          );
        },
      )
      .subscribe(handleChannelStatus);

    return () => {
      isActive = false;
      setRealtimeStatus("offline");
      void supabase.removeChannel(attendanceChannel);
      void supabase.removeChannel(queueChannel);
    };
  }, [includePendingReturns, rangeKey, roomSlug]);

  return {
    attendances,
    queueItems,
    realtimeError,
    realtimeStatus,
    setAttendances,
    setQueueItems,
  };
}
