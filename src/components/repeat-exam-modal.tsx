"use client";

import { useEffect, useState } from "react";

const PRESET_REASONS = [
  "ERRO NO POSICIONAMENTO",
  "ERRO NO PROTOCOLO DE AQUISIÇÃO",
  "PACIENTE MOVIMENTOU",
  "FALHA NO EQUIPAMENTO",
  "OUTROS",
] as const;

type PresetReason = (typeof PRESET_REASONS)[number];

type Props = {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  error?: string;
};

export function RepeatExamModal({ isOpen, isLoading, onClose, onSubmit, error }: Props) {
  const [selected, setSelected] = useState<PresetReason | null>(null);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setDetail("");
    }
  }, [isOpen]);

  function handleClose() {
    onClose();
  }

  function buildReason(): string | null {
    if (!selected) return null;
    if (selected === "OUTROS") {
      const trimmed = detail.trim();
      if (trimmed.length < 3) return null;
      return `OUTROS: ${trimmed}`;
    }
    return selected;
  }

  async function handleSubmit() {
    const reason = buildReason();
    if (!reason) return;
    await onSubmit(reason);
    setSelected(null);
    setDetail("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") handleClose();
  }

  const reason = buildReason();
  const canSubmit = reason !== null && !isLoading;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="px-8 py-8">
          <h2 className="text-xl font-bold text-slate-900">Repetir Exame?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Selecione o motivo da repetição para registrar no histórico.
          </p>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {PRESET_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSelected(option)}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  selected === option
                    ? "border-orange-400 bg-orange-50 text-orange-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option === "OUTROS" ? "OUTROS: ESPECIFICAR" : option}
              </button>
            ))}
          </div>

          {selected === "OUTROS" && (
            <div className="mt-4">
              <textarea
                autoFocus
                rows={3}
                maxLength={480}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Descreva o motivo..."
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
              />
              <p className="mt-1 text-xs text-slate-400">{detail.length}/480 caracteres</p>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Salvando..." : "Confirmar Repetição"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
