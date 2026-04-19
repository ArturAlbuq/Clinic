import { cn } from "@/lib/utils";
import {
  EXAM_LABELS,
  ROOM_EXAM_TYPES,
} from "@/lib/constants";
import type {
  ExamRoomRecord,
  ExamType,
  PipelineFlags,
} from "@/lib/database.types";

const LAUDO_EXAMS = new Set<ExamType>([
  "periapical",
  "interproximal",
  "panoramica",
  "tomografia",
]);

type ExamsSectionProps = {
  rooms: ExamRoomRecord[];
  selectedExams: ExamType[];
  examQuantities: Partial<Record<ExamType, number>>;
  onToggleExam: (examType: ExamType) => void;
  onUpdateExamQuantity: (examType: ExamType, quantity: string) => void;
  pipelineFlags: PipelineFlags;
  onTogglePipelineFlag: (flag: keyof PipelineFlags, value: boolean) => void;
  pipelineFlagsReadOnly?: boolean;
};

export function ExamsSection({
  rooms,
  selectedExams,
  examQuantities,
  onToggleExam,
  onUpdateExamQuantity,
  pipelineFlags,
  onTogglePipelineFlag,
  pipelineFlagsReadOnly = false,
}: ExamsSectionProps) {
  const showLaudo = selectedExams.some((e) => LAUDO_EXAMS.has(e));

  return (
    <div>
      <span className="mb-4 block text-sm font-semibold text-slate-700">
        Exames
      </span>
      <div className="space-y-4">
        {rooms.map((room) => {
          const roomExams = ROOM_EXAM_TYPES[room.slug as keyof typeof ROOM_EXAM_TYPES];
          const showCefalometria =
            room.slug === "panoramico" && selectedExams.includes("telerradiografia");
          const showImpressao =
            room.slug === "fotografia-escaneamento" && selectedExams.includes("fotografia");
          const showLaboratorio =
            room.slug === "fotografia-escaneamento" && selectedExams.includes("escaneamento_intra_oral");

          return (
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
                {roomExams.map((examType) => {
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
                })}
              </div>

              {showCefalometria ? (
                <label className={cn("mt-3 flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_cefalometria}
                    onChange={(e) => onTogglePipelineFlag("com_cefalometria", e.target.checked)}
                    disabled={pipelineFlagsReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-700">Cefalometria</span>
                </label>
              ) : null}

              {showImpressao ? (
                <label className={cn("mt-3 flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_impressao_fotografia}
                    onChange={(e) => onTogglePipelineFlag("com_impressao_fotografia", e.target.checked)}
                    disabled={pipelineFlagsReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-700">Com impressão</span>
                </label>
              ) : null}

              {showLaboratorio ? (
                <label className={cn("mt-3 flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={pipelineFlags.com_laboratorio_externo_escaneamento}
                    onChange={(e) => onTogglePipelineFlag("com_laboratorio_externo_escaneamento", e.target.checked)}
                    disabled={pipelineFlagsReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-700">Laboratório externo</span>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      {showLaudo ? (
        <div className="mt-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Desdobramentos</p>
          <label className={cn("flex items-center gap-2", pipelineFlagsReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
            <input
              type="checkbox"
              checked={pipelineFlags.com_laudo}
              onChange={(e) => onTogglePipelineFlag("com_laudo", e.target.checked)}
              disabled={pipelineFlagsReadOnly}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-700">Laudo</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
