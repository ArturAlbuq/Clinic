export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="app-panel w-full max-w-2xl rounded-[30px] px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
          Carregando
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">
          Sincronizando a operação da clínica.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Aguarde alguns segundos enquanto os dados mais recentes são preparados.
        </p>
      </div>
    </div>
  );
}
