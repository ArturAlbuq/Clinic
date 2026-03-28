const LEGACY_CANCELLATION_PREFIX = "[legacy_cancel_v1]";

type LegacyCancellationMetadata = {
  authorizedBy?: string | null;
  canceledAt: string;
  canceledBy?: string | null;
  reason: string;
};

export function appendLegacyCancellationMetadata(
  notes: string | null | undefined,
  metadata: LegacyCancellationMetadata,
) {
  const existing = parseLegacyCancellationMetadata(notes).notes;
  const marker = `${LEGACY_CANCELLATION_PREFIX}${JSON.stringify(metadata)}`;

  return existing ? `${marker}\n${existing}` : marker;
}

export function parseLegacyCancellationMetadata(notes: string | null | undefined) {
  const rawNotes = notes?.trim() ?? "";

  if (!rawNotes.startsWith(LEGACY_CANCELLATION_PREFIX)) {
    return {
      authorizedBy: null,
      canceledAt: null,
      canceledBy: null,
      notes: rawNotes || null,
      reason: null,
    };
  }

  const [firstLine, ...rest] = rawNotes.split("\n");
  const encoded = firstLine.slice(LEGACY_CANCELLATION_PREFIX.length);

  try {
    const parsed = JSON.parse(encoded) as LegacyCancellationMetadata;

    return {
      authorizedBy: parsed.authorizedBy ?? null,
      canceledAt: parsed.canceledAt ?? null,
      canceledBy: parsed.canceledBy ?? null,
      notes: rest.join("\n").trim() || null,
      reason: parsed.reason ?? null,
    };
  } catch {
    return {
      authorizedBy: null,
      canceledAt: null,
      canceledBy: null,
      notes: rawNotes,
      reason: null,
    };
  }
}
