"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateInputValue, shiftClinicDate } from "@/lib/date";

type DayFilterControlsProps = {
  historyMessage?: string;
  selectedDate: string;
};

export function DayFilterControls({
  historyMessage,
  selectedDate,
}: DayFilterControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = formatDateInputValue(new Date());
  const isToday = selectedDate === today;

  function updateDate(nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDate);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[180px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Data em foco
          </span>
          <input
            className="bg-transparent text-sm font-medium text-slate-900 outline-none"
            type="date"
            value={selectedDate}
            onChange={(event) => updateDate(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <NavButton
            label="Anterior"
            onClick={() =>
              updateDate(formatDateInputValue(shiftClinicDate(selectedDate, "day", -1)))
            }
          />
          <NavButton label="Hoje" onClick={() => updateDate(today)} />
          <NavButton
            label="Proximo"
            onClick={() =>
              updateDate(formatDateInputValue(shiftClinicDate(selectedDate, "day", 1)))
            }
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={
            isToday
              ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800"
              : "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800"
          }
        >
          {isToday ? "Modo operacional" : "Modo consulta"}
        </span>
      </div>
      {!isToday && historyMessage ? (
        <p className="text-sm text-slate-600">{historyMessage}</p>
      ) : null}
    </div>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
