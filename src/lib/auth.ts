import { cache } from "react";
import { redirect } from "next/navigation";
import type { AppRole, ProfileRecord } from "@/lib/database.types";
import type { RoomSlug } from "@/lib/constants";
import { ROLE_HOME } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionContext = {
  profile: ProfileRecord | null;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string | null;
};

export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      profile: null,
      supabase,
      userId: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    profile: (profile as ProfileRecord | null) ?? null,
    supabase,
    userId: user.id,
  };
});

export async function requireAuthenticatedUser() {
  const session = await getSessionContext();

  if (!session.userId || !session.profile) {
    redirect("/login?error=perfil");
  }

  return session as SessionContext & {
    profile: ProfileRecord;
    userId: string;
  };
}

export async function requireRole(allowedRoles: AppRole | AppRole[]) {
  const session = await requireAuthenticatedUser();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!roles.includes(session.profile.role)) {
    redirect(ROLE_HOME[session.profile.role]);
  }

  return session;
}

export async function listAccessibleRoomSlugs(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  profile: ProfileRecord,
): Promise<RoomSlug[]> {
  if (profile.role !== "atendimento") {
    return [];
  }

  const { data, error } = await supabase
    .from("profile_room_access")
    .select("room_slug")
    .eq("profile_id", profile.id);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => entry.room_slug as RoomSlug);
}

export async function redirectToRoleHome() {
  const session = await getSessionContext();

  if (!session.userId || !session.profile) {
    redirect("/login");
  }

  redirect(ROLE_HOME[session.profile.role]);
}
