"use client";

import { useEffect, useRef } from "react";

type Props = {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  error?: string;
};

export function RepeatExamModal({ isOpen, isLoading, onClose, onSubmit, error }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef("");

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      reasonRef.current = "";
      textareaRef.current.value = "";
    }
  }, [isOpen]);

  async function handleSubmit() {
    const reason = (textareaRef.current?.value ?? "").trim();
    if (reason.length < 3) {
      return;
    }
    await onSubmit(reason);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="px-8 py-8">
          <h2 className="text-xl font-bold text-slate-900">Repetir Exame?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Descreva o motivo da repetição para registrar no histórico.
          </p>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <div className="mt-6">
            <label className="block text-sm font-semibold text-slate-700">
              Motivo da Repetição
            </label>
            <textarea
              ref={textareaRef}
              rows={4}
              maxLength={500}
              onKeyDown={handleKeyDown}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
              placeholder="Ex: Qualidade ruim, posicionamento incorreto, equipamento com falha..."
            />
            <p className="mt-2 text-xs text-slate-400">
              {textareaRef.current?.value.length ?? 0}/500 caracteres
            </p>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || (textareaRef.current?.value.trim().length ?? 0) < 3}
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
