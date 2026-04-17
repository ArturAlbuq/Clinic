"use client";

import { EXAM_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ProfileRecord, QueueItemRecord } from "@/lib/database.types";
import { sortAttendanceQueueItemsByFlow } from "@/lib/queue";

interface AttendanceExamsTableProps {
  items: QueueItemRecord[];
  profileMap: Map<string, ProfileRecord>;
}

export function AttendanceExamsTable({
  items,
  profileMap,
}: AttendanceExamsTableProps) {
  const orderedItems = sortAttendanceQueueItemsByFlow(items);

  if (!orderedItems.length) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">
        Exames vinculados
      </p>

      {/* Desktop/Tablet: Table */}
      <div className="hidden md:block">
        <DesktopTable items={orderedItems} profileMap={profileMap} />
      </div>

      {/* Mobile: Cards */}
      <div className="block md:hidden">
        <MobileCards items={orderedItems} profileMap={profileMap} />
      </div>
    </div>
  );
}

interface TableProps {
  items: QueueItemRecord[];
  profileMap: Map<string, ProfileRecord>;
}

function DesktopTable({ items, profileMap }: TableProps) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Exame
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Status
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Atendente
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Tempo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <TableRow key={item.id} item={item} profileMap={profileMap} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  item,
  profileMap,
}: {
  item: QueueItemRecord;
  profileMap: Map<string, ProfileRecord>;
}) {
  const attendantName = getAttendantName(item.started_by, profileMap);
  const executionTime = getExecutionTimeLabel(item.started_at, item.finished_at);
  const statusLabel = STATUS_LABELS[item.status];

  return (
    <tr className="hover:bg-slate-50 transition">
      <td className="px-4 py-3 font-medium text-slate-950">
        {EXAM_LABELS[item.exam_type]}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={item.status} label={statusLabel} />
      </td>
      <td className="px-4 py-3 text-slate-950">{attendantName}</td>
      <td className="px-4 py-3 text-slate-950">{executionTime}</td>
    </tr>
  );
}

function MobileCards({ items, profileMap }: TableProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MobileCard key={item.id} item={item} profileMap={profileMap} />
      ))}
    </div>
  );
}

function MobileCard({
  item,
  profileMap,
}: {
  item: QueueItemRecord;
  profileMap: Map<string, ProfileRecord>;
}) {
  const attendantName = getAttendantName(item.started_by, profileMap);
  const executionTime = getExecutionTimeLabel(item.started_at, item.finished_at);
  const statusLabel = STATUS_LABELS[item.status];
  const cardBgClass = getCardBackgroundClass(item.status);
  const borderClass = getCardBorderClass(item.status);

  return (
    <div className={`${borderClass} ${cardBgClass} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-slate-950">
          {EXAM_LABELS[item.exam_type]}
        </p>
        <StatusBadge status={item.status} label={statusLabel} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Atendente
          </p>
          <p className={`text-sm font-semibold mt-1 ${getTextColorClass(attendantName)}`}>
            {attendantName}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Tempo
          </p>
          <p className={`text-sm font-semibold mt-1 ${getTextColorClass(executionTime)}`}>
            {executionTime}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: QueueItemRecord["status"];
  label: string;
}) {
  const styles = {
    aguardando: "border-amber-200 bg-amber-50 text-amber-800",
    chamado: "border-sky-200 bg-sky-50 text-sky-800",
    em_atendimento: "border-emerald-200 bg-emerald-100 text-emerald-900",
    finalizado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {label}
    </span>
  );
}

// Helper functions

function getAttendantName(
  startedById: string | null,
  profileMap: Map<string, ProfileRecord>
): string {
  if (!startedById) return "Pendente";
  const profile = profileMap.get(startedById);
  return profile?.full_name ?? "Pendente";
}

function getExecutionTimeLabel(
  startedAt: string | null,
  finishedAt: string | null
): string {
  if (!startedAt || !finishedAt) return "Pendente";

  const startTime = new Date(startedAt).getTime();
  const endTime = new Date(finishedAt).getTime();
  const durationMs = endTime - startTime;
  const durationMinutes = Math.floor(durationMs / 60000);

  return `${durationMinutes} min`;
}

function getCardBorderClass(status: QueueItemRecord["status"]): string {
  const styles = {
    aguardando: "border-amber-200",
    chamado: "border-sky-200",
    em_atendimento: "border-emerald-200",
    finalizado: "border-emerald-200",
    cancelado: "border-rose-200",
  } as const;
  return `border ${styles[status]}`;
}

function getCardBackgroundClass(status: QueueItemRecord["status"]): string {
  const styles = {
    aguardando: "bg-amber-50/40",
    chamado: "bg-sky-50/40",
    em_atendimento: "bg-emerald-50/40",
    finalizado: "bg-emerald-50/40",
    cancelado: "bg-rose-50/40",
  } as const;
  return styles[status];
}

function getTextColorClass(value: string): string {
  return value === "Pendente" ? "text-slate-500" : "text-slate-950";
}
