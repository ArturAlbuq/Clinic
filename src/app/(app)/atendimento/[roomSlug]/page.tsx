import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isRoomSlug, ROOM_BY_SLUG } from "@/lib/constants";
import { fetchAttendances, fetchQueueItems } from "@/lib/queue";
import { RoomQueueBoard } from "./room-queue-board";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{
    roomSlug: string;
  }>;
};

export function generateStaticParams() {
  return Object.keys(ROOM_BY_SLUG).map((roomSlug) => ({
    roomSlug,
  }));
}

export default async function AtendimentoRoomPage({ params }: RoomPageProps) {
  const { roomSlug } = await params;

  if (!isRoomSlug(roomSlug)) {
    notFound();
  }

  const { supabase } = await requireRole(["atendimento", "admin"]);
  const [attendances, queueItems] = await Promise.all([
    fetchAttendances(supabase),
    fetchQueueItems(supabase),
  ]);

  return (
    <RoomQueueBoard
      initialAttendances={attendances}
      initialItems={queueItems}
      room={ROOM_BY_SLUG[roomSlug]}
      roomSlug={roomSlug}
    />
  );
}
