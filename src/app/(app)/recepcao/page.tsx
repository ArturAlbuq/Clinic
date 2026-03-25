import { requireRole } from "@/lib/auth";
import { fetchAttendances, fetchExamRooms, fetchQueueItems } from "@/lib/queue";
import { ReceptionDashboard } from "./reception-dashboard";

export const dynamic = "force-dynamic";

export default async function RecepcaoPage() {
  const { supabase } = await requireRole(["recepcao", "admin"]);
  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase),
    fetchQueueItems(supabase),
    fetchExamRooms(supabase),
  ]);

  return (
    <ReceptionDashboard
      initialAttendances={attendances}
      initialItems={queueItems}
      rooms={rooms}
    />
  );
}
