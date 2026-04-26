"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EXAM_LABELS } from "@/lib/constants";
import { readJsonResponse } from "@/lib/fetch-json";
import type {
  AttendanceRecord,
  AttendanceWithQueueItems,
  QueueItemRecord,
} from "@/lib/database.types";

type EditPipelineFlagsModalProps = {
  attendance: AttendanceWithQueueItems;
  onSaved: (
    updatedAttendance: AttendanceRecord,
    updatedQueueItems: QueueItemRecord[],
  ) => void;
  onClose: () => void;
};

type UpdateFlagsResponse = {
  attendance?: AttendanceRecord;
  queueItems?: QueueItemRecord[];
  error?: string;
};

function buildComLaudoPerItem(items: QueueItemRecord[]) {
  return Object.fromEntries(
    items.map((item) => [item.id, item.com_laudo]),
  ) as Record<string, boolean>;
}

export function EditPipelineFlagsModal({
  attendance,
  onSaved,
  onClose,
}: EditPipelineFlagsModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const latestAttendanceIdRef = useRef(attendance.id);
  latestAttendanceIdRef.current = attendance.id;
  const editableItems = useMemo(
    () =>
      attendance.queueItems.filter((item) => item.status !== "cancelado"),
    [attendance.queueItems],
  );
  const editableItemsSyncKey = useMemo(
    () =>
      editableItems
        .map((item) => `${item.id}:${item.status}:${item.com_laudo}`)
        .join("|"),
    [editableItems],
  );

  const [comLaudoPerItem, setComLaudoPerItem] = useState<Record<string, boolean>>(
    () => buildComLaudoPerItem(editableItems),
  );
  const [comCefalometria, setComCefalometria] = useState(
    attendance.com_cefalometria,
  );
  const [comImpressaoFotografia, setComImpressaoFotografia] = useState(
    attendance.com_impressao_fotografia,
  );
  const [
    comLaboratorioExternoEscaneamento,
    setComLaboratorioExternoEscaneamento,
  ] = useState(attendance.com_laboratorio_externo_escaneamento);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasEditableItems = editableItems.length > 0;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    latestAttendanceIdRef.current = attendance.id;
    setComLaudoPerItem(buildComLaudoPerItem(editableItems));
    setComCefalometria(attendance.com_cefalometria);
    setComImpressaoFotografia(attendance.com_impressao_fotografia);
    setComLaboratorioExternoEscaneamento(
      attendance.com_laboratorio_externo_escaneamento,
    );
    setError("");
  }, [
    attendance.id,
    attendance.com_cefalometria,
    attendance.com_impressao_fotografia,
    attendance.com_laboratorio_externo_escaneamento,
    editableItemsSyncKey,
  ]);

  async function handleSave() {
    if (isSubmittingRef.current) {
      return;
    }

    setError("");

    if (!hasEditableItems) {
      setError("Nao ha exames editaveis para salvar.");
      return;
    }

    const submittedAttendanceId = attendance.id;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/clinic/queue-items/update-flags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          attendanceId: attendance.id,
          items: editableItems.map((item) => ({
            queueItemId: item.id,
            comLaudo: Boolean(comLaudoPerItem[item.id]),
          })),
          comCefalometria,
          comImpressaoFotografia,
          comLaboratorioExternoEscaneamento,
        }),
      });

      const payload =
        (await readJsonResponse<UpdateFlagsResponse>(response)) ?? {};

      if (!isMountedRef.current) {
        isSubmittingRef.current = false;
        return;
      }

      if (latestAttendanceIdRef.current !== submittedAttendanceId) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      if (!response.ok || !payload.attendance) {
        setError(payload.error || "Nao foi possivel salvar os flags.");
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      isSubmittingRef.current = false;
      setIsSubmitting(false);
      onSaved(payload.attendance, payload.queueItems ?? []);
    } catch {
      if (!isMountedRef.current) {
        isSubmittingRef.current = false;
        return;
      }

      if (latestAttendanceIdRef.current !== submittedAttendanceId) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      setError("Nao foi possivel salvar os flags.");
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function toggleComLaudo(itemId: string) {
    setComLaudoPerItem((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isSubmittingRef.current) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-[24px] bg-white shadow-2xl"
      >
        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-slate-950">
              Editar flags - {attendance.patient_name}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">
              Ajuste os marcadores usados no fluxo de pos-atendimento.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Flags por exame
              </p>
              <div className="mt-3 space-y-2">
                {hasEditableItems ? (
                  editableItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(comLaudoPerItem[item.id])}
                        onChange={() => toggleComLaudo(item.id)}
                        disabled={isSubmitting}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <span className="text-sm font-semibold text-slate-900">
                        {EXAM_LABELS[item.exam_type]} - com laudo
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                    Nao ha exames editaveis para este atendimento.
                  </div>
                )}
              </div>
            </div>

            {hasEditableItems ? (
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Flags do atendimento
                </p>
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={comCefalometria}
                      onChange={() => setComCefalometria((current) => !current)}
                      disabled={isSubmitting}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="text-sm font-semibold text-slate-900">
                      Com cefalometria
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={comImpressaoFotografia}
                      onChange={() =>
                        setComImpressaoFotografia((current) => !current)
                      }
                      disabled={isSubmitting}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="text-sm font-semibold text-slate-900">
                      Com impressao/fotografia
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={comLaboratorioExternoEscaneamento}
                      onChange={() =>
                        setComLaboratorioExternoEscaneamento(
                          (current) => !current,
                        )
                      }
                      disabled={isSubmitting}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="text-sm font-semibold text-slate-900">
                      Com laboratorio externo / escaneamento
                    </span>
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-5 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            {hasEditableItems ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Salvando..." : "Salvar"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
