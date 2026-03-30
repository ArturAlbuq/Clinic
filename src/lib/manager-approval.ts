import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicEnv } from "@/lib/env";

type QueueClient = SupabaseClient<Database>;

type ManagerApprovalAttempt = {
  actor_user_id: string;
  attendance_id: string;
  authorized_manager_id?: string | null;
  failure_reason?: string | null;
  ip_address?: string | null;
  manager_email: string;
  success: boolean;
  user_agent?: string | null;
};

export const MANAGER_APPROVAL_MAX_FAILED_ATTEMPTS = 5;
export const MANAGER_APPROVAL_WINDOW_MINUTES = 15;

export function normalizeManagerEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getManagerApprovalWindowStart(nowMs = Date.now()) {
  return new Date(
    nowMs - MANAGER_APPROVAL_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
}

export function getManagerApprovalRequestMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  return {
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function getRecentFailedManagerApprovalCount(
  supabase: QueueClient,
  actorUserId: string,
  nowMs = Date.now(),
) {
  const { count, error } = await supabase
    .from("manager_approval_attempts")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", actorUserId)
    .eq("success", false)
    .gte("attempted_at", getManagerApprovalWindowStart(nowMs));

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export function isManagerApprovalRateLimited(count: number) {
  return count >= MANAGER_APPROVAL_MAX_FAILED_ATTEMPTS;
}

export async function recordManagerApprovalAttempt(
  supabase: QueueClient,
  attempt: ManagerApprovalAttempt,
) {
  const { error } = await supabase
    .from("manager_approval_attempts")
    .insert(attempt);

  if (error) {
    throw error;
  }
}

export async function verifyManagerCredentials(
  managerEmail: string,
  managerPassword: string,
) {
  const { anonKey, url } = getSupabasePublicEnv();
  const approvalClient = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const email = normalizeManagerEmail(managerEmail);
  const password = managerPassword.trim();
  const { data, error } = await approvalClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return null;
  }

  const { data: profile, error: profileError } = await approvalClient
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile || profile.role !== "admin") {
    return null;
  }

  return {
    email,
    id: profile.id,
  };
}
