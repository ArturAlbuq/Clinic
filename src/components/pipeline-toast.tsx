"use client";

import { useEffect, useRef } from "react";
import type { PipelineItemRecord, PipelineType } from "@/lib/database.types";
import { PIPELINE_TYPE_LABELS } from "@/lib/pipeline-constants";

type PipelineToastProps = {
  items: PipelineItemRecord[];
  onClose: () => void;
};

function getPipelineLabel(item: PipelineItemRecord): string {
  const meta = item.metadata as Record<string, unknown>;

  if (item.pipeline_type === "fotografia" && meta.com_impressao) {
    return "Fotografia com impressão";
  }
  if (item.pipeline_type === "escaneamento" && meta.laboratorio_externo) {
    return "Escaneamento com laboratório externo";
  }
  return PIPELINE_TYPE_LABELS[item.pipeline_type];
}

const TYPE_ABBR: Record<
  PipelineType,
  { abbr: string; border: string; bg: string; text: string }
> = {
  laudo:        { abbr: "L", border: "border-blue-200",    bg: "bg-blue-50",    text: "text-blue-700" },
  cefalometria: { abbr: "C", border: "border-violet-200",  bg: "bg-violet-50",  text: "text-violet-700" },
  fotografia:   { abbr: "F", border: "border-pink-200",    bg: "bg-pink-50",    text: "text-pink-700" },
  escaneamento: { abbr: "S", border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" },
};

const DURATION_MS = 6000;

export function PipelineToast({ items, onClose }: PipelineToastProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "100%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.transition = `width ${DURATION_MS}ms linear`;
          bar.style.width = "0%";
        });
      });
    }
    const timer = setTimeout(onClose, DURATION_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!items.length) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-80"
      style={{
        animation: "pipeline-toast-in 0.35s cubic-bezier(.22,.68,0,1.2) forwards",
      }}
    >
      <style>{`
        @keyframes pipeline-toast-in {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
      <div className="rounded-[20px] border border-emerald-300 bg-white shadow-[0_24px_60px_rgba(16,185,129,0.18)] px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-4 w-4 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Exame concluído</p>
            <p className="mt-0.5 text-xs text-slate-500">Esteiras abertas:</p>
            <ul className="mt-2 space-y-1">
              {items.map((item) => {
                const s = TYPE_ABBR[item.pipeline_type];
                return (
                  <li key={item.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${s.border} ${s.bg} text-[10px] font-bold ${s.text} shrink-0`}
                    >
                      {s.abbr}
                    </span>
                    {getPipelineLabel(item)}
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none mt-0.5"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="mt-4 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            ref={barRef}
            className="h-full bg-emerald-400 rounded-full"
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
