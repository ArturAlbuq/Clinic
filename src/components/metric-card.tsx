import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  accent?: "teal" | "amber" | "rose" | "slate";
  compact?: boolean;
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

const COMPACT_ACCENTS = {
  amber:
    "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100",
  rose:
    "border-rose-300 bg-gradient-to-br from-rose-100 via-rose-50 to-pink-100",
  slate:
    "border-slate-300 bg-gradient-to-br from-slate-100 via-white to-slate-50",
  teal:
    "border-cyan-300 bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-100",
} as const;

const COMPACT_LABEL_ACCENTS = {
  amber: "text-amber-800",
  rose: "text-rose-800",
  slate: "text-slate-700",
  teal: "text-cyan-800",
} as const;

const COMPACT_HELPER_ACCENTS = {
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
  compact = false,
}: MetricCardProps) {
  const accentStyles = compact ? COMPACT_ACCENTS : ACCENTS;
  const labelStyles = compact ? COMPACT_LABEL_ACCENTS : LABEL_ACCENTS;
  const helperStyles = compact ? COMPACT_HELPER_ACCENTS : HELPER_ACCENTS;

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-[20px] border px-3 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.06)]",
          accentStyles[accent],
        )}
      >
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.18em]",
            labelStyles[accent],
          )}
        >
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
        <p className={cn("mt-1 text-xs", helperStyles[accent])}>{helper}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[26px] border px-5 py-5 shadow-[0_22px_45px_rgba(15,23,42,0.08)]",
        accentStyles[accent],
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.18em]",
          labelStyles[accent],
        )}
      >
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className={cn("mt-2 text-sm", helperStyles[accent])}>{helper}</p>
    </div>
  );
}
