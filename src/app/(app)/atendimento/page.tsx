import { EmptyState } from "@/components/empty-state";
import { isRoomSlug } from "@/lib/constants";
import { listAccessibleRoomSlugs, requireRole } from "@/lib/auth";
import { fetchAttendances, fetchExamRooms, fetchQueueItems } from "@/lib/queue";
import { AttendanceOverview } from "./attendance-overview";

export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const [attendances, queueItems, rooms, accessibleRoomSlugs] = await Promise.all([
    fetchAttendances(supabase),
    fetchQueueItems(supabase),
    fetchExamRooms(supabase),
    listAccessibleRoomSlugs(supabase, profile),
  ]);
  const visibleRooms =
    profile.role === "admin"
      ? rooms
      : rooms.filter(
          (room) => isRoomSlug(room.slug) && accessibleRoomSlugs.includes(room.slug),
        );

  if (profile.role === "atendimento" && visibleRooms.length === 0) {
    return (
      <EmptyState
        title="Nenhuma sala vinculada"
        description="Peça para o admin vincular sua conta a pelo menos uma sala de atendimento."
      />
    );
  }

  return (
    <AttendanceOverview
      initialAttendances={attendances}
      initialItems={queueItems}
      rooms={visibleRooms}
    />
  );
}
