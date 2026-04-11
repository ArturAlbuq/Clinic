import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
import type { ProfileRecord } from "@/lib/database.types";
import {
  fetchAttendances,
  fetchDeletedAttendanceRecords,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
  parseQueuePeriod,
} from "@/lib/queue";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{
    date?: string;
    period?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { supabase } = await requireRole("admin");
  const params = await searchParams;

  if (!params.date || !params.period) {
    const today = formatDateInputValue(new Date());
    redirect(`/admin?period=${params.period ?? "day"}&date=${params.date ?? today}`);
  }

  const period = parseQueuePeriod(params.period);
  const selectedDate = parseDateInput(params.date);
  const range = getRangeBounds(period, selectedDate);
  const [{ data: profiles }, attendances, deletionRecords, queueItems, rooms] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name", { ascending: true }),
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchDeletedAttendanceRecords(supabase, { range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
    fetchExamRooms(supabase),
  ]);
  const deletedAttendances = deletionRecords.map((record) => ({
    ...record.attendance,
    queueItems: record.queueItems,
  }));

  return (
    <AdminDashboard
      initialAttendances={attendances}
      initialDeletedAttendances={deletedAttendances}
      initialItems={queueItems}
      initialPeriod={period}
      initialSelectedDate={formatDateInputValue(selectedDate)}
      profiles={(profiles ?? []) as ProfileRecord[]}
      range={range}
      rooms={rooms}
    />
  );
}
