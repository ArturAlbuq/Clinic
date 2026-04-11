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

  return (
    <ReceptionDashboard
      initialAttendances={attendances}
      initialItems={queueItems}
      range={range}
      rooms={rooms}
      selectedDate={formatDateInputValue(selectedDate)}
    />
  );
}
