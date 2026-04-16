import {
  PRIORITY_LABELS,
} from "@/lib/constants";
import type { AttendancePriority } from "@/lib/database.types";

type PriorityNotesSectionProps = {
  priority: AttendancePriority;
  notes: string;
  onPriorityChange: (priority: AttendancePriority) => void;
  onNotesChange: (notes: string) => void;
};

const PRIORITY_OPTIONS: AttendancePriority[] = [
  "normal",
  "sessenta_mais_outras",
  "oitenta_mais",
];

export function PriorityNotesSection({
  priority,
  notes,
  onPriorityChange,
  onNotesChange,
}: PriorityNotesSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Prioridade
        </span>
        <select
          value={priority}
          onChange={(event) =>
            onPriorityChange(event.target.value as AttendancePriority)
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {PRIORITY_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Observação
        </span>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={1}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          placeholder="Opcional. Ex.: encaixe, retorno, prioridade clínica."
        />
      </label>
    </div>
  );
}
