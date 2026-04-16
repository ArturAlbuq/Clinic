import { RealtimeStatusBadge } from "@/components/realtime-status";
import { DayFilterControls } from "@/components/day-filter-controls";
import { formatDate } from "@/lib/date";

type ReceptionHeaderProps = {
  isToday: boolean;
  selectedDate: string;
  realtimeStatus: "connected" | "disconnected" | "reconnecting";
  realtimeError: string | null;
};

export function ReceptionHeader({
  isToday,
  selectedDate,
  realtimeStatus,
  realtimeError,
}: ReceptionHeaderProps) {
  return (
    <div className="app-panel rounded-[30px] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Recepcao
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Cadastro rapido por exame
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {isToday
              ? "A recepcao escolhe os exames, informa a quantidade quando fizer sentido e o sistema direciona cada exame para a sala correta."
              : `Consulta dos registros de ${formatDate(selectedDate)}. O cadastro rapido fica liberado apenas no dia atual.`}
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-4">
          <RealtimeStatusBadge error={realtimeError} status={realtimeStatus} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Data em foco
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {formatDate(selectedDate)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {isToday ? "Hoje" : "Histórico"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <DayFilterControls
          historyMessage="Modo consulta ativo. Para cadastrar novos pacientes, volte para Hoje."
          selectedDate={selectedDate}
        />
      </div>
    </div>
  );
}
