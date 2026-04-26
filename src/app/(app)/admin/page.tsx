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

  async function fetchAll() {
    console.log("[admin] start", { period, range });
    const { data: profiles } = await supabase.from("profiles").select("*").order("full_name", { ascending: true });
    console.log("[admin] profiles ok");
    const attendances = await fetchAttendances(supabase, { includePendingReturns: true, range });
    console.log("[admin] attendances ok", attendances.length);
    const deletionRecords = await fetchDeletedAttendanceRecords(supabase, { range });
    console.log("[admin] deletionRecords ok", deletionRecords.length);
    const queueItems = await fetchQueueItems(supabase, { includePendingReturns: true, range });
    console.log("[admin] queueItems ok", queueItems.length);
    const rooms = await fetchExamRooms(supabase);
    console.log("[admin] rooms ok", rooms.length);
    return { profiles, attendances, deletionRecords, queueItems, rooms };
  }

  const { profiles, attendances, deletionRecords, queueItems, rooms } = await fetchAll().catch((err) => {
    console.error("[admin] FETCH ERROR", JSON.stringify(err), err);
    throw err;
  });

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
