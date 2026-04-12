"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import {
  EXAM_LABELS,
  ROOM_BY_SLUG,
  type RoomSlug,
} from "@/lib/constants";
import type { ExamType, ExamRoomRecord, ProfileRecord } from "@/lib/database.types";
import {
  getDefaultRepetitionsDateRange,
  useExamRepetitions,
  type ExamRepetitionsFilters,
} from "@/lib/exam-repetitions";

type Option = readonly [label: string, value: string];

type Props = {
  profiles: ProfileRecord[];
  rooms: ExamRoomRecord[];
};

export function RepetitionsTab({ profiles, rooms }: Props) {
  const defaultRange = getDefaultRepetitionsDateRange();

  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [examType, setExamType] = useState<ExamType | "todos">("todos");
  const [technicianId, setTechnicianId] = useState<string | "todos">("todos");

  const filters: ExamRepetitionsFilters = { startDate, endDate, examType, technicianId };
  const { byExamType, byTechnician, byRoom, isLoading, error } = useExamRepetitions(filters);

  const technicianOptions: readonly Option[] = [
    ["Todos os tecnicos", "todos"] as const,
    ...profiles
      .filter((p) => p.role === "atendimento")
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))
      .map((p) => [p.full_name, p.id] as const),
  ];

  const examOptions: readonly Option[] = [
    ["Todos os exames", "todos"] as const,
    ...Object.entries(EXAM_LABELS).map(([value, label]) => [label, value] as const),
  ];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const roomMap = new Map(rooms.map((r) => [r.slug, r]));

  const isEmpty = !isLoading && !error && byExamType.length === 0;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <section className="app-panel rounded-[30px] px-6 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">De</span>
            <input
              type="date"
              className="bg-transparent text-sm font-medium text-slate-900 outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ate</span>
            <input
              type="date"
              className="bg-transparent text-sm font-medium text-slate-900 outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <SelectField label="Tecnico" value={technicianId} onChange={(v) => setTechnicianId(v)} options={technicianOptions} />
          <SelectField label="Exame" value={examType} onChange={(v) => setExamType(v as ExamType | "todos")} options={examOptions} />
        </div>
      </section>

      {error ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-sm text-red-600">{error}</p>
        </section>
      ) : isLoading ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <p className="text-sm text-slate-500">Carregando...</p>
        </section>
      ) : isEmpty ? (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <EmptyState
            title="Nenhuma repeticao encontrada"
            description="Nenhuma repeticao registrada no periodo selecionado."
          />
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-3">
          {/* Painel 1: Por tipo de exame */}
          <div className="app-panel rounded-[30px] px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Por tipo de exame</p>
            <div className="mt-6 space-y-3">
              {byExamType.map((entry) => (
                <div key={entry.examType} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                  <p className="text-lg font-semibold text-slate-950">{EXAM_LABELS[entry.examType]}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {entry.total} repeticao{entry.total !== 1 ? "oes" : ""} · {entry.pct}% do total
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Painel 2: Por tecnico */}
          <div className="app-panel rounded-[30px] px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Por tecnico</p>
            <div className="mt-6 space-y-3">
              {byTechnician.length === 0 ? (
                <p className="text-sm text-slate-400">Sem dados de tecnico.</p>
              ) : byTechnician.map((entry) => {
                const profile = profileMap.get(entry.technicianId);
                return (
                  <div key={entry.technicianId} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-lg font-semibold text-slate-950">{profile?.full_name ?? "Desconhecido"}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {entry.total} repeticao{entry.total !== 1 ? "oes" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Exame mais repetido: {EXAM_LABELS[entry.topExamType]}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Painel 3: Por sala */}
          <div className="app-panel rounded-[30px] px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Por sala</p>
            <div className="mt-6 space-y-3">
              {byRoom.length === 0 ? (
                <p className="text-sm text-slate-400">Sem dados de sala.</p>
              ) : byRoom.map((entry) => {
                const room = roomMap.get(entry.roomSlug);
                const roomName = room?.name ?? (ROOM_BY_SLUG[entry.roomSlug as RoomSlug]?.roomName ?? entry.roomSlug);
                return (
                  <div key={entry.roomSlug} className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
                    <p className="text-lg font-semibold text-slate-950">{roomName}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {entry.total} repeticao{entry.total !== 1 ? "oes" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Exame mais repetido: {EXAM_LABELS[entry.topExamType]}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  value: string;
}) {
  return (
    <label className="flex min-w-[150px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        className="bg-transparent text-sm font-medium text-slate-900 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
