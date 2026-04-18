"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EXAM_LABELS, ROOM_BY_SLUG, type RoomSlug } from "@/lib/constants";
import type { ExamType, ExamRoomRecord, ProfileRecord } from "@/lib/database.types";
import { formatDateInputValue, formatDateTime } from "@/lib/date";
import { readJsonResponse } from "@/lib/fetch-json";

type Option = readonly [label: string, value: string];

type RepetitionEntry = {
  id: string;
  repeated_at: string;
  repetition_reason: string | null;
  technician_id: string | null;
};

type RepetitionRecord = {
  id: string;
  queue_item_id: string;
  exam_type: ExamType;
  room_slug: string | null;
  technician_id: string | null;
  repeated_at: string;
  repetition_reason?: string | null;
  repetition_count?: number;
  repetitions?: RepetitionEntry[];
  patient_name?: string | null;
  patient_registration_number?: string | null;
};

type Props = {
  profiles: ProfileRecord[];
  rooms: ExamRoomRecord[];
};

type PageSize = 5 | 10 | 15;

function ExpandableMotivo({ repetitions }: { repetitions?: RepetitionEntry[] }) {
  const [open, setOpen] = useState(false);

  if (!repetitions || repetitions.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  const latest = repetitions[repetitions.length - 1];
  const prior = repetitions.length - 1;

  if (prior === 0) {
    return (
      <span className="text-slate-700">
        {latest.repetition_reason ?? <span className="text-slate-400">-</span>}
      </span>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-start gap-1.5 text-left text-sm text-slate-700 hover:text-slate-900"
      >
        <span
          className="mt-0.5 shrink-0 text-[10px] text-slate-400 transition-transform"
          style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9654;
        </span>
        <span>
          {latest.repetition_reason ?? "-"}{" "}
          <span className="text-xs text-slate-400">(+{prior} anterior{prior > 1 ? "es" : ""})</span>
        </span>
      </button>
      {open && (
        <div className="mt-2 border-l-2 border-slate-200 pl-3">
          {repetitions.map((r, i) => (
            <div key={r.id} className="flex gap-2 py-1 text-xs text-slate-500">
              <span className="shrink-0 font-bold text-slate-400">{i + 1}ª</span>
              <span>{r.repetition_reason ?? "-"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RepetitionsReportTable({ profiles, rooms }: Props) {
  const [repetitions, setRepetitions] = useState<RepetitionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [total, setTotal] = useState(0);
  const [startDate, setStartDate] = useState(() => formatDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(() => formatDateInputValue(new Date()));
  const [technicianId, setTechnicianId] = useState<string | "todos">("todos");
  const [roomSlug, setRoomSlug] = useState<RoomSlug | "todas">("todas");
  const [examType, setExamType] = useState<ExamType | "todos">("todos");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const roomMap = new Map(rooms.map((r) => [r.slug, r]));

  useEffect(() => {
    let cancelled = false;

    async function fetchRepetitions() {
      setIsLoading(true);
      setError(undefined);

      const params = new URLSearchParams({
        startDate,
        endDate,
        technicianId,
        roomSlug,
        examType,
        limit: "5000",
      });

      const response = await fetch(`/api/clinic/repetitions?${params.toString()}`, {
        credentials: "same-origin",
      });
      const payload = (await readJsonResponse<{
        data?: RepetitionRecord[];
        error?: string;
        total?: number;
      }>(response)) ?? {};

      if (cancelled) {
        return;
      }

      if (!response.ok || !Array.isArray(payload.data)) {
        setRepetitions([]);
        setTotal(0);
        setError(payload.error || "Nao foi possivel carregar as repeticoes.");
        setIsLoading(false);
        return;
      }

      setRepetitions(payload.data);
      setTotal(typeof payload.total === "number" ? payload.total : payload.data.length);
      setIsLoading(false);
    }

    fetchRepetitions();

    return () => {
      cancelled = true;
    };
  }, [endDate, examType, roomSlug, startDate, technicianId]);

  const totalPages = Math.max(1, Math.ceil(repetitions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedReps = repetitions.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );

  const technicianOptions: readonly Option[] = [
    ["Todos os tecnicos", "todos"] as const,
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

  const isEmpty = !isLoading && !error && repetitions.length === 0;

  return (
    <div className="space-y-4">
      <section className="app-panel rounded-[30px] px-6 py-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Filtros
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[140px] flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              De
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setCurrentPage(1);
              }}
              className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex min-w-[140px] flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Ate
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setCurrentPage(1);
              }}
              className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <SelectField
            label="Tecnico"
            value={technicianId}
            onChange={(value) => {
              setTechnicianId(value);
              setCurrentPage(1);
            }}
            options={technicianOptions}
          />
          <SelectField
            label="Sala"
            value={roomSlug}
            onChange={(value) => {
              setRoomSlug(value as RoomSlug | "todas");
              setCurrentPage(1);
            }}
            options={roomOptions}
          />
          <SelectField
            label="Exame"
            value={examType}
            onChange={(value) => {
              setExamType(value as ExamType | "todos");
              setCurrentPage(1);
            }}
            options={examOptions}
          />
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
        <section className="app-panel rounded-[30px] px-6 py-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Resultados: {total} repeticao{total !== 1 ? "oes" : ""}
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Por pagina:
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value) as PageSize);
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
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Paciente</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Exame</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Tecnico</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Sala</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Data/Hora</th>
                  <th className="px-3 py-3 text-center font-semibold text-slate-700">Repeticoes</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReps.map((rep) => {
                  const technician = profileMap.get(rep.technician_id ?? "");
                  const room = roomMap.get((rep.room_slug ?? "") as RoomSlug);
                  const roomName =
                    room?.name ??
                    (ROOM_BY_SLUG[(rep.room_slug ?? "") as RoomSlug]?.roomName ??
                      rep.room_slug ??
                      "-");

                  return (
                    <tr key={rep.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">
                          {rep.patient_name ?? "-"}
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
                        {technician?.full_name ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-900">{roomName}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatDateTime(rep.repeated_at)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-sm font-semibold text-orange-700">
                          {rep.repetition_count ?? 1}
                        </span>
                      </td>
                      <td className="max-w-xs px-3 py-3">
                        <ExpandableMotivo repetitions={rep.repetitions} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Mostrando {paginatedReps.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0}-
              {Math.min(safeCurrentPage * pageSize, repetitions.length)} de {repetitions.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="flex items-center px-2 text-xs text-slate-600">
                {safeCurrentPage}/{totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Proxima
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
        onChange={(event) => onChange(event.target.value)}
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
