export default function AppLoading() {
  return (
    <div className="app-panel rounded-[30px] px-8 py-10 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
        Atualizando
      </p>
      <h2 className="mt-4 text-2xl font-semibold text-slate-950">
        Carregando os dados da fila.
      </h2>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        O sistema está buscando o estado mais recente das salas e atendimentos.
      </p>
    </div>
  );
}
