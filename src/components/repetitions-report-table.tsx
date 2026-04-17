"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EXAM_LABELS, ROOM_BY_SLUG, type RoomSlug } from "@/lib/constants";
import type { ExamType, ExamRoomRecord, ProfileRecord } from "@/lib/database.types";

type Option = readonly [label: string, value: string];

type RepetitionRecord = {
  id: string;
  queue_item_id: string;
  exam_type: ExamType;
  room_slug: string | null;
  technician_id: string | null;
  repeated_at: string;
  repetition_reason?: string | null;
  patient_name?: string;
  patient_registration_number?: string;
};

type Props = {
  repetitions: RepetitionRecord[];
  isLoading?: boolean;
  error?: string;
  profiles: ProfileRecord[];
  rooms: ExamRoomRecord[];
};

type PageSize = 5 | 10 | 15;

export function RepetitionsReportTable({
  repetitions,
  isLoading = false,
  error,
  profiles,
  rooms,
}: Props) {
  const [startDate, setStartDate] = useState(formatToday());
  const [endDate, setEndDate] = useState(formatToday());
  const [technicianId, setTechnicianId] = useState<string | "todos">("todos");
  const [roomSlug, setRoomSlug] = useState<RoomSlug | "todas">("todas");
  const [examType, setExamType] = useState<ExamType | "todos">("todos");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const roomMap = new Map(rooms.map((r) => [r.slug, r]));

  // Filter repetitions
  const filtered = repetitions.filter((rep) => {
    const repDate = new Date(rep.repeated_at).toISOString().split("T")[0];
    const dateInRange = repDate >= startDate && repDate <= endDate;
    const techMatch = technicianId === "todos" || rep.technician_id === technicianId;
    const roomMatch = roomSlug === "todas" || rep.room_slug === roomSlug;
    const examMatch = examType === "todos" || rep.exam_type === examType;

    return dateInRange && techMatch && roomMatch && examMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedReps = filtered.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );

  const technicianOptions: readonly Option[] = [
    ["Todos os técnicos", "todos"] as const,
    ...profiles
      .filter((p) => p.role === "atendimento")
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))
      .map((p) => [p.full_name, p.id] as const),
  ];

  const roomOptions: readonly Option[] = [
    ["Todas as salas", "todas"] as const,
    ...rooms
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((r) => [r.name, r.slug] as const),
  ];

  const examOptions: readonly Option[] = [
    ["Todos os exames", "todos"] as const,
    ...Object.entries(EXAM_LABELS).map(([value, label]) => [label, value] as const),
  ];

  const isEmpty = !isLoading && !error && filtered.length === 0;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <section className="app-panel rounded-[30px] px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">
          Filtros
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[140px] flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">De</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex min-w-[140px] flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <SelectField
            label="Técnico"
            value={technicianId}
            onChange={(v) => {
              setTechnicianId(v);
              setCurrentPage(1);
            }}
            options={technicianOptions}
          />
          <SelectField
            label="Sala"
            value={roomSlug}
            onChange={(v) => {
              setRoomSlug(v as RoomSlug);
              setCurrentPage(1);
            }}
            options={roomOptions}
          />
          <SelectField
            label="Exame"
            value={examType}
            onChange={(v) => {
              setExamType(v as ExamType);
              setCurrentPage(1);
            }}
            options={examOptions}
          />
        </div>
      </section>

      {/* Conteúdo */}
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
            title="Nenhuma repetição encontrada"
            description="Nenhuma repetição registrada no período selecionado."
          />
        </section>
      ) : (
        <section className="app-panel rounded-[30px] px-6 py-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Resultados: {filtered.length} repetição{filtered.length !== 1 ? "ões" : ""}
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Por página:
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as PageSize);
                  setCurrentPage(1);
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Paciente</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Exame</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Técnico</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Sala</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Data/Hora</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReps.map((rep) => {
                  const technician = profileMap.get(rep.technician_id ?? "");
                  const room = roomMap.get((rep.room_slug ?? "") as RoomSlug);
                  const roomName =
                    room?.name ??
                    (ROOM_BY_SLUG[(rep.room_slug ?? "") as RoomSlug]?.roomName ?? rep.room_slug ?? "—");

                  return (
                    <tr key={rep.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">
                          {rep.patient_name ?? "—"}
                        </p>
                        {rep.patient_registration_number ? (
                          <p className="text-xs text-slate-500">
                            {rep.patient_registration_number}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-900">
                        {EXAM_LABELS[rep.exam_type]}
                      </td>
                      <td className="px-3 py-3 text-slate-900">
                        {technician?.full_name ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-900">{roomName}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatDateTime(rep.repeated_at)}
                      </td>
                      <td className="px-3 py-3 text-slate-600 max-w-xs">
                        {rep.repetition_reason ? (
                          <span className="line-clamp-2">{rep.repetition_reason}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Mostrando {paginatedReps.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0}–
              {Math.min(safeCurrentPage * pageSize, filtered.length)} de {filtered.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ← Anterior
              </button>
              <span className="flex items-center px-2 text-xs text-slate-600">
                {safeCurrentPage}/{totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima →
              </button>
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
    <label className="flex min-w-[140px] flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return "—";
  }
}

function formatToday(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
