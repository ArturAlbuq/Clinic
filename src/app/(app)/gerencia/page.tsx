import { requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
import {
  fetchAttendances,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
} from "@/lib/queue";
import { GerenciaDashboard } from "@/components/gerencia-dashboard";

export const dynamic = "force-dynamic";

export default async function GerenciaPage() {
  const { supabase } = await requireRole("gerencia");

  const today = formatDateInputValue(new Date());
  const selectedDate = parseDateInput(today);
  const range = getRangeBounds("day", selectedDate);

  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
    fetchExamRooms(supabase),
  ]);

  return (
    <GerenciaDashboard
      initialAttendances={attendances}
      initialQueueItems={queueItems}
      rooms={rooms}
    />
  );
}
