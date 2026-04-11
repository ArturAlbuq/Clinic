import { notFound, redirect } from "next/navigation";
import { listAccessibleRoomSlugs, requireRole } from "@/lib/auth";
import { isRoomSlug, ROOM_BY_SLUG } from "@/lib/constants";
import { formatDateInputValue } from "@/lib/date";
import {
  fetchAttendances,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
} from "@/lib/queue";
import { RoomQueueBoard } from "./room-queue-board";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{
    roomSlug: string;
  }>;
  searchParams: Promise<{
    date?: string;
  }>;
};

export function generateStaticParams() {
  return Object.keys(ROOM_BY_SLUG).map((roomSlug) => ({
    roomSlug,
  }));
}

export default async function AtendimentoRoomPage({
  params,
  searchParams,
}: RoomPageProps) {
  const { roomSlug } = await params;
  const query = await searchParams;

  if (!isRoomSlug(roomSlug)) {
    notFound();
  }

  if (!query.date) {
    redirect(
      `${ROOM_BY_SLUG[roomSlug].route}?date=${formatDateInputValue(new Date())}`,
    );
  }

  const selectedDate = parseDateInput(query.date);
  const range = getRangeBounds("day", selectedDate);

  const { profile, supabase } = await requireRole(["atendimento", "admin"]);
  const [attendances, queueItems, accessibleRoomSlugs] = await Promise.all([
    fetchAttendances(supabase, { includePendingReturns: true, range }),
    fetchQueueItems(supabase, { includePendingReturns: true, range, roomSlug }),
    listAccessibleRoomSlugs(supabase, profile),
  ]);

  if (
    profile.role === "atendimento" &&
    !accessibleRoomSlugs.includes(roomSlug)
  ) {
    redirect("/atendimento");
  }

  return (
    <RoomQueueBoard
      initialAttendances={attendances}
      initialItems={queueItems}
      range={range}
      room={ROOM_BY_SLUG[roomSlug]}
      roomSlug={roomSlug}
      selectedDate={formatDateInputValue(selectedDate)}
    />
  );
}
