import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ROLE_LABELS, ROLE_NAVIGATION } from "@/lib/constants";
import type { ProfileRecord } from "@/lib/database.types";

type AppShellProps = {
  profile: ProfileRecord;
  children: ReactNode;
};

export function AppShell({ profile, children }: AppShellProps) {
  return (
    <div className="app-grid min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="app-panel sticky top-5 z-30 rounded-[30px] border border-white/80 px-5 py-4 backdrop-blur md:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                Clínica radiológica
              </p>
              <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Fila digital em tempo real
                </h1>
                <span className="inline-flex w-fit rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-800">
                  {ROLE_LABELS[profile.role]}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <AppNav items={ROLE_NAVIGATION[profile.role]} />
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-white/75 px-3 py-2 font-medium">
                  {profile.full_name}
                </span>
                <SignOutButton />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
