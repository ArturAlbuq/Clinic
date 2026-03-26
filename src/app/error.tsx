"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:error]", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="app-panel w-full max-w-2xl rounded-[30px] px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-600">
          Falha operacional
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">
          Não foi possível carregar esta tela.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Tente novamente. Se o erro persistir, valide a conexão com o Supabase e
          os logs do deploy.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
