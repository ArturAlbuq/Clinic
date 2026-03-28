import type {
  AppRole,
  AttendanceOverallStatus,
  AttendancePriority,
  ExamType,
  QueueStatus,
} from "@/lib/database.types";

export type RoomSlug =
  | "fotografia-escaneamento"
  | "periapical"
  | "panoramico"
  | "tomografia";

export type RealtimeStatus = "conectando" | "conectado" | "instavel" | "offline";

export const NEW_ITEM_WINDOW_MINUTES = 3;

export const ROOM_ORDER: RoomSlug[] = [
  "fotografia-escaneamento",
  "periapical",
  "panoramico",
  "tomografia",
];

export const ROOM_CONFIG = {
  fotografia_escaneamento: {
    slug: "fotografia-escaneamento",
    roomName: "Fotos/escaneamento",
    shortName: "Foto/scan",
    route: "/atendimento/fotografia-escaneamento",
  },
  periapical: {
    slug: "periapical",
    roomName: "Radiografia intra-oral",
    shortName: "Intra-oral",
    route: "/atendimento/periapical",
  },
  panoramico: {
    slug: "panoramico",
    roomName: "Radiografia extra-oral",
    shortName: "Extra-oral",
    route: "/atendimento/panoramico",
  },
  tomografia: {
    slug: "tomografia",
    roomName: "Tomografia",
    shortName: "Tomografia",
    route: "/atendimento/tomografia",
  },
} as const satisfies Record<
  ExamType,
  {
    slug: RoomSlug;
    roomName: string;
    shortName: string;
    route: string;
  }
>;

export const ROOM_BY_SLUG: Record<
  RoomSlug,
  {
    examType: ExamType;
    roomName: string;
    shortName: string;
    route: string;
  }
> = {
  "fotografia-escaneamento": {
    examType: "fotografia_escaneamento",
    roomName: "Fotos/escaneamento",
    shortName: "Foto/scan",
    route: "/atendimento/fotografia-escaneamento",
  },
  periapical: {
    examType: "periapical",
    roomName: "Radiografia intra-oral",
    shortName: "Intra-oral",
    route: "/atendimento/periapical",
  },
  panoramico: {
    examType: "panoramico",
    roomName: "Radiografia extra-oral",
    shortName: "Extra-oral",
    route: "/atendimento/panoramico",
  },
  tomografia: {
    examType: "tomografia",
    roomName: "Tomografia",
    shortName: "Tomografia",
    route: "/atendimento/tomografia",
  },
};

export const EXAM_LABELS: Record<ExamType, string> = {
  fotografia_escaneamento: "Fotografia e escaneamento",
  periapical: "Periapical e interproximal",
  panoramico: "Panorâmica e telerradiografia",
  tomografia: "Tomografia",
};

export const STATUS_LABELS: Record<QueueStatus, string> = {
  aguardando: "Aguardando",
  chamado: "Chamado",
  em_atendimento: "Em atendimento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const ROOM_STATUS_LABELS: Record<QueueStatus, string> = {
  aguardando: "Na fila",
  chamado: "Paciente chamado",
  em_atendimento: "Em exame",
  finalizado: "Etapa concluída",
  cancelado: "Atendimento cancelado",
};

export const PRIORITY_LABELS: Record<AttendancePriority, string> = {
  normal: "Normal",
  sessenta_mais_outras: "60+ e outras",
  oitenta_mais: "80+",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceOverallStatus, string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  recepcao: "Recepção",
  atendimento: "Atendimento",
  admin: "Admin",
};

export const ROLE_HOME: Record<AppRole, string> = {
  recepcao: "/recepcao",
  atendimento: "/atendimento",
  admin: "/admin",
};

export const ROLE_NAVIGATION: Record<
  AppRole,
  Array<{
    href: string;
    label: string;
  }>
> = {
  recepcao: [{ href: "/recepcao", label: "Recepção" }],
  atendimento: [{ href: "/atendimento", label: "Salas" }],
  admin: [{ href: "/admin", label: "Resumo do dia" }],
};

export const REALTIME_STATUS_LABELS: Record<RealtimeStatus, string> = {
  conectando: "Conectando",
  conectado: "Tempo real ativo",
  instavel: "Reconectando",
  offline: "Sem sincronização",
};

export const STATUS_ORDER: QueueStatus[] = [
  "aguardando",
  "chamado",
  "em_atendimento",
  "finalizado",
  "cancelado",
];

export const PRIORITY_ORDER: AttendancePriority[] = [
  "oitenta_mais",
  "sessenta_mais_outras",
  "normal",
];

export const RECEPTION_STATUS_FILTERS: Array<
  AttendanceOverallStatus | "todos"
> = ["todos", "aguardando", "em_andamento", "finalizado", "cancelado"];

export function isRoomSlug(value: string): value is RoomSlug {
  return ROOM_ORDER.includes(value as RoomSlug);
}
