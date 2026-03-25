import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  accent?: "teal" | "amber" | "slate";
};

const ACCENTS = {
  amber: "border-amber-200/70 bg-amber-50/80",
  slate: "border-slate-200 bg-white/90",
  teal: "border-cyan-200/80 bg-cyan-50/80",
} as const;

export function MetricCard({
  label,
  value,
  helper,
  accent = "slate",
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-[26px] border px-5 py-5 shadow-[0_20px_45px_rgba(15,23,42,0.05)]",
        ACCENTS[accent],
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-600">{helper}</p>
    </div>
  );
}
