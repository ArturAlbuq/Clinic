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
    roomName: "Fotografia / escaneamento intra-oral",
    shortName: "Foto / scan",
    route: "/atendimento/fotografia-escaneamento",
  },
  periapical: {
    slug: "periapical",
    roomName: "Periapical",
    shortName: "Periapical",
    route: "/atendimento/periapical",
  },
  panoramico: {
    slug: "panoramico",
    roomName: "Panorâmico",
    shortName: "Panorâmico",
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
    roomName: "Fotografia / escaneamento intra-oral",
    shortName: "Foto / scan",
    route: "/atendimento/fotografia-escaneamento",
  },
  periapical: {
    examType: "periapical",
    roomName: "Periapical",
    shortName: "Periapical",
    route: "/atendimento/periapical",
  },
  panoramico: {
    examType: "panoramico",
    roomName: "Panorâmico",
    shortName: "Panorâmico",
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
  fotografia_escaneamento: "Fotografia / escaneamento intra-oral",
  periapical: "Periapical",
  panoramico: "Panorâmico",
  tomografia: "Tomografia",
};

export const STATUS_LABELS: Record<QueueStatus, string> = {
  aguardando: "Aguardando",
  chamado: "Chamado",
  em_atendimento: "Em atendimento",
  finalizado: "Finalizado",
};

export const PRIORITY_LABELS: Record<AttendancePriority, string> = {
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceOverallStatus, string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
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

export const STATUS_ORDER: QueueStatus[] = [
  "aguardando",
  "chamado",
  "em_atendimento",
  "finalizado",
];

export const PRIORITY_ORDER: AttendancePriority[] = [
  "urgente",
  "alta",
  "normal",
];

export const RECEPTION_STATUS_FILTERS: Array<
  AttendanceOverallStatus | "todos"
> = ["todos", "aguardando", "em_andamento", "finalizado"];

export function isRoomSlug(value: string): value is RoomSlug {
  return ROOM_ORDER.includes(value as RoomSlug);
}
