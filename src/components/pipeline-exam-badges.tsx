import { getPipelineExamLabel, type PipelineLinkedExam } from "@/lib/pipeline";

type PipelineExamBadgesProps = {
  exams: PipelineLinkedExam[];
};

export function PipelineExamBadges({
  exams,
}: PipelineExamBadgesProps) {
  if (!exams.length) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {exams.map((exam) => (
        <span
          key={exam.id}
          className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          {getPipelineExamLabel(exam)}
        </span>
      ))}
    </div>
  );
}
