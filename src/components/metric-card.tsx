import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  accent?: "teal" | "amber" | "rose" | "slate";
};

const ACCENTS = {
  amber:
    "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100",
  rose:
    "border-rose-300 bg-gradient-to-br from-rose-100 via-rose-50 to-pink-100",
  slate:
    "border-slate-300 bg-gradient-to-br from-slate-100 via-white to-slate-50",
  teal:
    "border-cyan-300 bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-100",
} as const;

const LABEL_ACCENTS = {
  amber: "text-amber-800",
  rose: "text-rose-800",
  slate: "text-slate-700",
  teal: "text-cyan-800",
} as const;

const HELPER_ACCENTS = {
  amber: "text-amber-900/85",
  rose: "text-rose-900/85",
  slate: "text-slate-700",
  teal: "text-cyan-950/80",
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
        "rounded-[26px] border px-5 py-5 shadow-[0_22px_45px_rgba(15,23,42,0.08)]",
        ACCENTS[accent],
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.18em]",
          LABEL_ACCENTS[accent],
        )}
      >
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className={cn("mt-2 text-sm", HELPER_ACCENTS[accent])}>{helper}</p>
    </div>
  );
}
