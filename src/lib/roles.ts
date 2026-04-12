import type { AppRole } from "@/lib/database.types";

const APP_ROLES: AppRole[] = ["recepcao", "atendimento", "admin", "gerencia"];
const GERENCIA_FALLBACK_EMAIL = "gerencia@clinic.local";

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function resolveEffectiveAppRole(options: {
  appMetadataRole?: unknown;
  profileRole: AppRole;
  userEmail?: string | null;
  userMetadataRole?: unknown;
}): AppRole {
  const { appMetadataRole, profileRole, userEmail, userMetadataRole } = options;

  if (profileRole === "gerencia") {
    return profileRole;
  }

  const isGerenciaFallbackUser =
    typeof userEmail === "string" &&
    userEmail.trim().toLowerCase() === GERENCIA_FALLBACK_EMAIL &&
    (appMetadataRole === "gerencia" || userMetadataRole === "gerencia");

  if (profileRole === "recepcao" && isGerenciaFallbackUser) {
    return "gerencia";
  }

  return profileRole;
}
