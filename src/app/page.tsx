import { redirect } from "next/navigation";
import { redirectToRoleHome } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  await redirectToRoleHome();
}
