import { cn } from "@/lib/utils";
import {
  EXAM_LABELS,
  ROOM_EXAM_TYPES,
} from "@/lib/constants";
import type {
  ExamRoomRecord,
  ExamType,
} from "@/lib/database.types";

type ExamsSectionProps = {
  rooms: ExamRoomRecord[];
  selectedExams: ExamType[];
  examQuantities: Partial<Record<ExamType, number>>;
  onToggleExam: (examType: ExamType) => void;
  onUpdateExamQuantity: (examType: ExamType, quantity: string) => void;
};

export function ExamsSection({
  rooms,
  selectedExams,
  examQuantities,
  onToggleExam,
  onUpdateExamQuantity,
}: ExamsSectionProps) {
  return (
    <div>
      <span className="mb-4 block text-sm font-semibold text-slate-700">
        Exames
      </span>
      <div className="space-y-4">
        {rooms.map((room) => (
          <div
            key={room.slug}
            className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{room.name}</p>
              <p className="mt-1 text-xs text-slate-600">
                Selecione os exames que entram nesta sala.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ROOM_EXAM_TYPES[room.slug as keyof typeof ROOM_EXAM_TYPES].map(
                (examType) => {
                  const checked = selectedExams.includes(examType);
                  const quantity = examQuantities[examType] ?? 1;

                  return (
                    <label
                      key={examType}
                      className={cn(
                        checked
                          ? "rounded-[22px] border border-cyan-300 bg-cyan-50 px-4 py-4"
                          : "rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4",
                        "flex items-start gap-3 cursor-pointer"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleExam(examType)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {EXAM_LABELS[examType]}
                          </p>
                          <p className="text-xs text-slate-600">
                            Vai para {room.name}
                          </p>
                        </div>
                        {checked ? (
                          <div className="flex max-w-[160px] flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Quantidade
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={quantity}
                              onChange={(event) =>
                                onUpdateExamQuantity(examType, event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                            />
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                }
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
