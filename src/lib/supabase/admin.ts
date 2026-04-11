import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/env";

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminSupabaseClient() {
  if (!adminClient) {
    const { url } = getSupabasePublicEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();

    adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}
