"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRecord } from "@/lib/database.types";
import { ROLE_HOME } from "@/lib/constants";
import { resolveEffectiveAppRole } from "@/lib/roles";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  serverError?: string;
};

const ROLE_HINTS = [
  "Recepção cadastra o paciente em poucos cliques.",
  "Atendimento acompanha cada sala em tempo real.",
  "Admin enxerga o resumo operacional do dia.",
];

export function LoginForm({ serverError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(serverError ?? "");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      setError("Supabase não configurado. Revise as variáveis de ambiente.");
      return;
    }

    setIsPending(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError(signInError?.message || "Credenciais inválidas.");
      setIsPending(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      if (
        profileError?.message?.includes("Could not find the table") ||
        profileError?.message?.includes("schema cache")
      ) {
        setError(
          "Banco não inicializado. Aplique as migrations do projeto e depois execute o seed.",
        );
      } else {
        setError(
          "Usuário autenticado, mas o perfil interno não existe. Rode o seed do projeto.",
        );
      }
      setIsPending(false);
      return;
    }

    const userProfile = profile as ProfileRecord;
    const effectiveRole = resolveEffectiveAppRole({
      appMetadataRole: data.user.app_metadata?.role,
      profileRole: userProfile.role,
      userEmail: data.user.email,
      userMetadataRole: data.user.user_metadata?.role,
    });

    router.replace(ROLE_HOME[effectiveRole]);
    router.refresh();
    setIsPending(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(11,114,133,0.16),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(255,183,77,0.18),transparent_22%)]" />
      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="app-panel rounded-[34px] px-7 py-8 md:px-10 md:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
            Operação interna
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Fluxo simples entre recepção, salas e visão administrativa.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            O foco aqui é visibilidade imediata da fila. A recepção registra, a sala
            correta recebe sem papel e o admin acompanha o dia em uma tela objetiva.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {ROLE_HINTS.map((hint) => (
              <div
                key={hint}
                className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
              >
                <p className="text-sm font-medium leading-6 text-slate-700">{hint}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-[34px] px-7 py-8 md:px-8 md:py-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Login
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Entrar no sistema
              </h2>
            </div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-800">
              pt-BR
            </span>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                placeholder="voce@clinica.local"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Senha
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                placeholder="Sua senha"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-base font-semibold text-white hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
