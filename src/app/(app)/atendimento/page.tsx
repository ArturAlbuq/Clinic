import { requireRole } from "@/lib/auth";
import { fetchAttendances, fetchExamRooms, fetchQueueItems } from "@/lib/queue";
import { AttendanceOverview } from "./attendance-overview";

export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  const { supabase } = await requireRole(["atendimento", "admin"]);
  const [attendances, queueItems, rooms] = await Promise.all([
    fetchAttendances(supabase),
    fetchQueueItems(supabase),
    fetchExamRooms(supabase),
  ]);

  return (
    <AttendanceOverview
      initialAttendances={attendances}
      initialItems={queueItems}
      rooms={rooms}
    />
  );
}
