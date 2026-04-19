"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/date";

type SlaRow = {
  id: string;
  pipeline_subtype: string;
  business_days: number;
  updated_at: string;
};

type Props = {
  initialRows: SlaRow[];
  subtypeLabels: Record<string, string>;
};

export function SlaConfigEditor({ initialRows, subtypeLabels }: Props) {
  const [rows, setRows] = useState<SlaRow[]>(initialRows);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleChange(subtype: string, value: string) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 30) {
      setEdited((prev) => ({ ...prev, [subtype]: parsed }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const updates = Object.entries(edited).map(([pipeline_subtype, business_days]) => ({
      pipeline_subtype,
      business_days,
    }));

    if (updates.length === 0) {
      setSaving(false);
      return;
    }

    const response = await fetch("/api/clinic/sla-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ updates }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar configuração.");
      setSaving(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        edited[row.pipeline_subtype] !== undefined
          ? { ...row, business_days: edited[row.pipeline_subtype], updated_at: new Date().toISOString() }
          : row
      )
    );
    setEdited({});
    setSuccess(true);
    setSaving(false);
  }

  const hasChanges = Object.keys(edited).length > 0;

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Configuração de SLA</h1>
        <p className="text-sm text-slate-500">
          Defina o prazo em dias úteis para cada tipo de esteira. Novos atendimentos já usarão os valores atualizados.
        </p>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">Tipo de esteira</th>
              <th className="px-4 py-3 font-medium">Dias úteis</th>
              <th className="px-4 py-3 font-medium">Última atualização</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => {
              const currentValue = edited[row.pipeline_subtype] ?? row.business_days;
              const changed = edited[row.pipeline_subtype] !== undefined;

              return (
                <tr key={row.id} className={changed ? "bg-amber-50" : "hover:bg-slate-50/60"}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {subtypeLabels[row.pipeline_subtype] ?? row.pipeline_subtype}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={currentValue}
                      onChange={(e) => handleChange(row.pipeline_subtype, e.target.value)}
                      className="w-20 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                    <span className="ml-2 text-xs text-slate-400">dias úteis</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(row.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Configuração salva com sucesso.
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-slate-700"
        >
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}
