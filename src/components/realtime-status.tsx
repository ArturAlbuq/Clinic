import { REALTIME_STATUS_LABELS, type RealtimeStatus } from "@/lib/constants";

type RealtimeStatusProps = {
  error?: string;
  status: RealtimeStatus;
};

const STATUS_STYLES: Record<RealtimeStatus, string> = {
  conectando: "border-slate-200 bg-slate-50 text-slate-700",
  conectado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  instavel: "border-amber-200 bg-amber-50 text-amber-800",
  offline: "border-rose-200 bg-rose-50 text-rose-800",
};

export function RealtimeStatusBadge({ error, status }: RealtimeStatusProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
      >
        {REALTIME_STATUS_LABELS[status]}
      </span>
      {error ? <span className="text-xs text-slate-500">{error}</span> : null}
    </div>
  );
}
