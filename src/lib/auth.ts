import { cache } from "react";
import { redirect } from "next/navigation";
import type { AppRole, ProfileRecord } from "@/lib/database.types";
import type { RoomSlug } from "@/lib/constants";
import { ROLE_HOME } from "@/lib/constants";
import { resolveEffectiveAppRole } from "@/lib/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionContext = {
  profile: ProfileRecord | null;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string | null;
};

export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createServerSupabaseClient();

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return { profile: null, supabase, userId: null };
  }

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

  const normalizedProfile = profile
    ? ({
        ...(profile as ProfileRecord),
        role: resolveEffectiveAppRole({
          appMetadataRole: user.app_metadata?.role,
          profileRole: (profile as ProfileRecord).role,
          userEmail: user.email,
          userMetadataRole: user.user_metadata?.role,
        }),
      } satisfies ProfileRecord)
    : null;

  return {
    profile: normalizedProfile,
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
