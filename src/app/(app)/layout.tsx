import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const { profile } = await requireAuthenticatedUser();

  return <AppShell profile={profile}>{children}</AppShell>;
}
