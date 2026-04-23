import type { PipelineItemRecord, PipelineType } from "@/lib/database.types";
import { PIPELINE_TYPE_LABELS, PIPELINE_STATUS_LABELS } from "@/lib/pipeline-constants";

type PipelineChipsProps = {
  items: PipelineItemRecord[];
  now?: Date;
};

const TYPE_STYLES: Record<PipelineType, { border: string; bg: string; text: string; abbr: string }> = {
  laudo:        { border: "border-blue-200",    bg: "bg-blue-50",    text: "text-blue-700",    abbr: "L" },
  cefalometria: { border: "border-violet-200",  bg: "bg-violet-50",  text: "text-violet-700",  abbr: "C" },
  fotografia:   { border: "border-pink-200",    bg: "bg-pink-50",    text: "text-pink-700",    abbr: "F" },
  escaneamento: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", abbr: "S" },
};

function getStatusDotClass(item: PipelineItemRecord, now: Date): string {
  if (item.status === "publicado_finalizado") return "bg-emerald-500";
  if (item.sla_deadline && new Date(item.sla_deadline) < now) return "bg-red-500";
  return "bg-yellow-400";
}

function buildTooltip(item: PipelineItemRecord, now: Date): string {
  const type = PIPELINE_TYPE_LABELS[item.pipeline_type];
  const status = PIPELINE_STATUS_LABELS[item.status];
  if (
    item.sla_deadline &&
    new Date(item.sla_deadline) < now &&
    item.status !== "publicado_finalizado"
  ) {
    return `${type}\n${status}\n⚠ SLA vencido`;
  }
  return `${type}\n${status}`;
}

export function PipelineChips({ items, now = new Date() }: PipelineChipsProps) {
  if (!items.length) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {items.map((item) => {
          const style = TYPE_STYLES[item.pipeline_type];
          const dotClass = getStatusDotClass(item, now);
          const tooltip = buildTooltip(item, now);

          return (
            <span
              key={item.id}
              title={tooltip}
              className={`inline-flex items-center gap-1 rounded-full border ${style.border} ${style.bg} px-2 py-[3px] text-[11px] font-bold ${style.text} cursor-default select-none`}
            >
              {style.abbr}
              <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            </span>
          );
        })}
      </div>
      <PipelineChipsLegend />
    </div>
  );
}

function PipelineChipsLegend() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-500 border-l border-slate-200 pl-2 ml-1">
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-blue-200 bg-blue-50 text-[8px] font-bold text-blue-700">L</span>
        <span>Laudo</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-violet-200 bg-violet-50 text-[8px] font-bold text-violet-700">C</span>
        <span>Cefalometria</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-pink-200 bg-pink-50 text-[8px] font-bold text-pink-700">F</span>
        <span>Fotografia</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-emerald-200 bg-emerald-50 text-[8px] font-bold text-emerald-700">S</span>
        <span>Escaneamento</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>Finalizado</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        <span>Em andamento</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span>SLA vencido</span>
      </div>
    </div>
  );
}
