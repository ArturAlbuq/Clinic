import { requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
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
  const [attendances, queueItems, rooms] = await Promise.all([
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
      range={range}
      rooms={rooms}
    />
  );
}
