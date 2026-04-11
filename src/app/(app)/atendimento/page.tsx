import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { isRoomSlug } from "@/lib/constants";
import { listAccessibleRoomSlugs, requireRole } from "@/lib/auth";
import { formatDateInputValue } from "@/lib/date";
import {
  fetchAttendances,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
} from "@/lib/queue";
import { AttendanceOverview } from "./attendance-overview";

export const dynamic = "force-dynamic";

type AtendimentoPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function AtendimentoPage({
  searchParams,
}: AtendimentoPageProps) {
  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const params = await searchParams;

  if (!params.date) {
    redirect(`/atendimento?date=${formatDateInputValue(new Date())}`);
  }

  const selectedDate = parseDateInput(params.date);
  const range = getRangeBounds("day", selectedDate);
  const [attendances, queueItems, rooms, accessibleRoomSlugs] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range }),
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
      range={range}
      rooms={visibleRooms}
      selectedDate={formatDateInputValue(selectedDate)}
    />
  );
}
