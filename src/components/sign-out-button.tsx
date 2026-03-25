"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      return;
    }

    setIsPending(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
    setIsPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Saindo..." : "Sair"}
    </button>
  );
}
