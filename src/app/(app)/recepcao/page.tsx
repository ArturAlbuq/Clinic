import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
import {
  fetchAttendances,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
} from "@/lib/queue";
import type { PipelineItemRecord } from "@/lib/database.types";
import { ReceptionDashboard } from "./reception-dashboard";

export const dynamic = "force-dynamic";

type RecepcaoPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function RecepcaoPage({ searchParams }: RecepcaoPageProps) {
  const { supabase } = await requireRole(["recepcao", "admin"]);
  const params = await searchParams;

  if (!params.date) {
    redirect(`/recepcao?date=${formatDateInputValue(new Date())}`);
  }

  const selectedDate = parseDateInput(params.date);
  const range = getRangeBounds("day", selectedDate);
  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
    fetchExamRooms(supabase),
  ]);

  const attendanceIds = attendances.map((a) => a.id);
  const pipelineItemsByAttendanceId = new Map<string, PipelineItemRecord[]>();

  if (attendanceIds.length) {
    const { data: pipelineItems } = await supabase
      .from("pipeline_items")
      .select("id, attendance_id, pipeline_type, status, sla_deadline, opened_at, metadata")
      .in("attendance_id", attendanceIds)
      .order("opened_at", { ascending: true });

    for (const item of pipelineItems ?? []) {
      const current = pipelineItemsByAttendanceId.get(item.attendance_id) ?? [];
      current.push(item as PipelineItemRecord);
      pipelineItemsByAttendanceId.set(item.attendance_id, current);
    }
  }

  return (
    <ReceptionDashboard
      initialAttendances={attendances}
      initialItems={queueItems}
      initialPipelineItemsByAttendanceId={pipelineItemsByAttendanceId}
      range={range}
      rooms={rooms}
      selectedDate={formatDateInputValue(selectedDate)}
    />
  );
}
