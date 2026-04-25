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

export type RealtimeStatus =
  | "conectando"
  | "conectado"
  | "instavel"
  | "offline";

export const NEW_ITEM_WINDOW_MINUTES = 3;

export const ROOM_ORDER: RoomSlug[] = [
  "fotografia-escaneamento",
  "periapical",
  "panoramico",
  "tomografia",
];

export const ROOM_BY_SLUG: Record<
  RoomSlug,
  {
    route: string;
    roomName: string;
    shortName: string;
    supportedExamTypes: ExamType[];
  }
> = {
  "fotografia-escaneamento": {
    route: "/atendimento/fotografia-escaneamento",
    roomName: "Fotos/escaneamento",
    shortName: "Foto/scan",
    supportedExamTypes: ["fotografia", "escaneamento_intra_oral"],
  },
  periapical: {
    route: "/atendimento/periapical",
    roomName: "Radiografia intra-oral",
    shortName: "Intra-oral",
    supportedExamTypes: ["periapical", "interproximal"],
  },
  panoramico: {
    route: "/atendimento/panoramico",
    roomName: "Radiografia extra-oral",
    shortName: "Extra-oral",
    supportedExamTypes: ["panoramica", "telerradiografia"],
  },
  tomografia: {
    route: "/atendimento/tomografia",
    roomName: "Tomografia",
    shortName: "Tomografia",
    supportedExamTypes: ["tomografia"],
  },
};

export const ROOM_CONFIG = ROOM_BY_SLUG;

export const EXAM_TYPE_ORDER: ExamType[] = [
  "fotografia",
  "escaneamento_intra_oral",
  "periapical",
  "interproximal",
  "panoramica",
  "telerradiografia",
  "tomografia",
];

export const EXAM_ORDER = EXAM_TYPE_ORDER;

export const EXAM_LABELS: Record<ExamType, string> = {
  fotografia: "Fotografia",
  escaneamento_intra_oral: "Escaneamento intra-oral",
  fotografia_escaneamento: "Foto/Escaneamento",
  periapical: "Periapical",
  interproximal: "Interproximal",
  panoramica: "Panoramica",
  panoramico: "Panoramico",
  telerradiografia: "Telerradiografia",
  tomografia: "Tomografia",
};

export const EXAM_SHORT_LABELS: Record<ExamType, string> = {
  fotografia: "Foto",
  escaneamento_intra_oral: "Scan intra",
  fotografia_escaneamento: "Foto/Scan",
  periapical: "Periapical",
  interproximal: "Interprox.",
  panoramica: "Panoramica",
  panoramico: "Panoramico",
  telerradiografia: "Telerradio",
  tomografia: "Tomografia",
};

export const EXAM_TO_ROOM_SLUG: Record<ExamType, RoomSlug> = {
  fotografia: "fotografia-escaneamento",
  escaneamento_intra_oral: "fotografia-escaneamento",
  fotografia_escaneamento: "fotografia-escaneamento",
  periapical: "periapical",
  interproximal: "periapical",
  panoramica: "panoramico",
  panoramico: "panoramico",
  telerradiografia: "panoramico",
  tomografia: "tomografia",
};

export const ROOM_EXAM_TYPES: Record<RoomSlug, ExamType[]> = {
  "fotografia-escaneamento": ["fotografia", "escaneamento_intra_oral"],
  periapical: ["periapical", "interproximal"],
  panoramico: ["panoramica", "telerradiografia"],
  tomografia: ["tomografia"],
};

export const ROOM_EXAM_LABELS: Record<RoomSlug, string> = {
  "fotografia-escaneamento": "Fotografia e escaneamento intra-oral",
  periapical: "Periapical e interproximal",
  panoramico: "Panoramica e telerradiografia",
  tomografia: "Tomografia",
};

export const STATUS_LABELS: Record<QueueStatus, string> = {
  aguardando: "Aguardando",
  chamado: "Chamado",
  em_atendimento: "Em exame",
  finalizado: "Concluido",
  cancelado: "Cancelado",
};

export const ROOM_STATUS_LABELS: Record<QueueStatus, string> = {
  aguardando: "Aguardando",
  chamado: "Chamado",
  em_atendimento: "Em exame",
  finalizado: "Concluido",
  cancelado: "Atendimento cancelado",
};

export const PRIORITY_LABELS: Record<AttendancePriority, string> = {
  normal: "Normal",
  sessenta_mais_outras: "60+ e outras",
  oitenta_mais: "80+",
};

export const ATTENDANCE_STATUS_LABELS: Record<
  AttendanceOverallStatus,
  string
> = {
  aguardando: "Aguardando",
  pendente_retorno: "Pendente de retorno",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  recepcao: "Recepcao",
  atendimento: "Atendimento",
  admin: "Admin",
  gerencia: "Gerência",
};

export const ROLE_HOME: Record<AppRole, string> = {
  recepcao: "/recepcao",
  atendimento: "/atendimento",
  admin: "/admin",
  gerencia: "/gerencia",
};

export const ROLE_NAVIGATION: Record<
  AppRole,
  Array<{
    href: string;
    label: string;
  }>
> = {
  recepcao: [
    { href: "/recepcao", label: "Recepcao" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
  ],
  atendimento: [
    { href: "/atendimento", label: "Salas" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
  ],
  admin: [
    { href: "/admin", label: "Resumo do dia" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
    { href: "/pos-atendimento/gerencial", label: "Gerencial" },
    { href: "/admin/sla", label: "SLA" },
  ],
  gerencia: [
    { href: "/gerencia", label: "Operação" },
    { href: "/pos-atendimento", label: "Pós-atendimento" },
    { href: "/pos-atendimento/gerencial", label: "Gerencial" },
  ],
};

export const REALTIME_STATUS_LABELS: Record<RealtimeStatus, string> = {
  conectando: "Conectando",
  conectado: "Tempo real ativo",
  instavel: "Reconectando",
  offline: "Sem sincronizacao",
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
> = [
  "todos",
  "aguardando",
  "pendente_retorno",
  "em_andamento",
  "finalizado",
  "cancelado",
];

export function isRoomSlug(value: string): value is RoomSlug {
  return ROOM_ORDER.includes(value as RoomSlug);
}
