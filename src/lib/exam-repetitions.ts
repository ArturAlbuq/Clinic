"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { CLINIC_TIMEZONE, clinicLocalDateToUtcDate } from "@/lib/date";
import { EXAM_ORDER } from "@/lib/constants";
import type { ExamType, ExamRepetitionRecord } from "@/lib/database.types";

export type ExamRepetitionsFilters = {
  startDate: string; // "YYYY-MM-DD" no fuso America/Manaus
  endDate: string;   // "YYYY-MM-DD" no fuso America/Manaus
  examType?: ExamType | "todos";
  technicianId?: string | "todos";
  roomSlug?: string | "todos";
};

export type ExamRepetitionsByExamType = {
  examType: ExamType;
  total: number;
  pct: number;
};

export type ExamRepetitionsByTechnician = {
  technicianId: string;
  total: number;
  topExamType: ExamType;
};

export type ExamRepetitionsByRoom = {
  roomSlug: string;
  total: number;
  topExamType: ExamType;
};

export type ExamRepetitionsData = {
  rows: ExamRepetitionRecord[];
  byExamType: ExamRepetitionsByExamType[];
  byTechnician: ExamRepetitionsByTechnician[];
  byRoom: ExamRepetitionsByRoom[];
  isLoading: boolean;
  error: string | null;
};

function toUtcRangeStart(dateStr: string): string {
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return dateStr;
  const utcDate = clinicLocalDateToUtcDate({
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3]),
    hour: 0,
    minute: 0,
    second: 0,
  });
  return utcDate.toISOString();
}

function toUtcRangeEnd(dateStr: string): string {
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return dateStr;
  const utcDate = clinicLocalDateToUtcDate({
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3]),
    hour: 23,
    minute: 59,
    second: 59,
  });
  return utcDate.toISOString();
}

function topExamType(rows: ExamRepetitionRecord[]): ExamType {
  const counts = new Map<ExamType, number>();
  for (const row of rows) {
    counts.set(row.exam_type, (counts.get(row.exam_type) ?? 0) + 1);
  }
  let top: ExamType = rows[0]?.exam_type ?? "fotografia";
  let topCount = 0;
  for (const [exam, count] of counts) {
    if (count > topCount) {
      top = exam;
      topCount = count;
    }
  }
  return top;
}

function groupData(rows: ExamRepetitionRecord[]): Pick<ExamRepetitionsData, "byExamType" | "byTechnician" | "byRoom"> {
  const total = rows.length;

  const examCounts = new Map<ExamType, number>();
  for (const row of rows) {
    examCounts.set(row.exam_type, (examCounts.get(row.exam_type) ?? 0) + 1);
  }
  const byExamType: ExamRepetitionsByExamType[] = EXAM_ORDER
    .filter((exam) => examCounts.has(exam))
    .map((exam) => ({
      examType: exam,
      total: examCounts.get(exam)!,
      pct: total > 0 ? Math.round((examCounts.get(exam)! / total) * 100) : 0,
    }));

  const techMap = new Map<string, ExamRepetitionRecord[]>();
  for (const row of rows) {
    if (!row.technician_id) continue;
    const list = techMap.get(row.technician_id) ?? [];
    list.push(row);
    techMap.set(row.technician_id, list);
  }
  const byTechnician: ExamRepetitionsByTechnician[] = Array.from(techMap.entries())
    .map(([technicianId, techRows]) => ({
      technicianId,
      total: techRows.length,
      topExamType: topExamType(techRows),
    }))
    .sort((a, b) => b.total - a.total);

  const roomMap = new Map<string, ExamRepetitionRecord[]>();
  for (const row of rows) {
    if (!row.room_slug) continue;
    const list = roomMap.get(row.room_slug) ?? [];
    list.push(row);
    roomMap.set(row.room_slug, list);
  }
  const byRoom: ExamRepetitionsByRoom[] = Array.from(roomMap.entries())
    .map(([roomSlug, roomRows]) => ({
      roomSlug,
      total: roomRows.length,
      topExamType: topExamType(roomRows),
    }))
    .sort((a, b) => b.total - a.total);

  return { byExamType, byTechnician, byRoom };
}

export function useExamRepetitions(filters: ExamRepetitionsFilters): ExamRepetitionsData {
  const [rows, setRows] = useState<ExamRepetitionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (!cancelled) {
        setIsLoading(true);
        setError(null);
      }

      const supabase = getBrowserSupabaseClient();
      if (!supabase) {
        if (!cancelled) {
          setError("Supabase não configurado");
          setIsLoading(false);
        }
        return;
      }

      let query = supabase
        .from("exam_repetitions")
        .select("*")
        .gte("repeated_at", toUtcRangeStart(filters.startDate))
        .lte("repeated_at", toUtcRangeEnd(filters.endDate))
        .order("repeated_at", { ascending: false });

      if (filters.examType && filters.examType !== "todos") {
        query = query.eq("exam_type", filters.examType);
      }
      if (filters.technicianId && filters.technicianId !== "todos") {
        query = query.eq("technician_id", filters.technicianId);
      }
      if (filters.roomSlug && filters.roomSlug !== "todos") {
        query = query.eq("room_slug", filters.roomSlug);
      }

      const { data, error: supabaseError } = await query;

      if (cancelled) return;

      if (supabaseError) {
        setError(supabaseError.message);
        setIsLoading(false);
        return;
      }

      setRows((data ?? []) as ExamRepetitionRecord[]);
      setIsLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, [filters.startDate, filters.endDate, filters.examType, filters.technicianId, filters.roomSlug]);

  const grouped = groupData(rows);

  return {
    rows,
    ...grouped,
    isLoading,
    error,
  };
}

export function getDefaultRepetitionsDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  const year = get("year");
  const month = get("month");

  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const pad = (n: string | number) => String(n).padStart(2, "0");

  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${pad(lastDay)}`,
  };
}
