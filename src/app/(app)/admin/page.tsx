import { requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
import type { ProfileRecord } from "@/lib/database.types";
import {
  fetchAttendances,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
  parseQueuePeriod,
} from "@/lib/queue";
import { AdminDashboard } from "./admin-dashboard";

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
  const period = parseQueuePeriod(params.period);
  const selectedDate = parseDateInput(params.date);
  const range = getRangeBounds(period, selectedDate);
  const [{ data: profiles }, attendances, queueItems, rooms] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name", { ascending: true }),
    fetchAttendances(supabase, { range }),
    fetchQueueItems(supabase, { range }),
    fetchExamRooms(supabase),
  ]);

  return (
    <AdminDashboard
      initialAttendances={attendances}
      initialItems={queueItems}
      initialPeriod={period}
      initialSelectedDate={formatDateInputValue(selectedDate)}
      profiles={(profiles ?? []) as ProfileRecord[]}
      range={range}
      rooms={rooms}
    />
  );
}
