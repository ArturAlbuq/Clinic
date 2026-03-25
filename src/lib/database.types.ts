export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "recepcao" | "atendimento" | "admin";
export type ExamType =
  | "fotografia_escaneamento"
  | "periapical"
  | "panoramico"
  | "tomografia";
export type QueueStatus =
  | "aguardando"
  | "chamado"
  | "em_atendimento"
  | "finalizado";
export type AttendancePriority = "normal" | "alta" | "urgente";
export type AttendanceOverallStatus =
  | "aguardando"
  | "em_andamento"
  | "finalizado";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: AppRole;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role: AppRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: AppRole;
          created_at?: string;
        };
        Relationships: [];
      };
      exam_rooms: {
        Row: {
          slug: string;
          exam_type: ExamType;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          slug: string;
          exam_type: ExamType;
          name: string;
          sort_order: number;
          created_at?: string;
        };
        Update: {
          slug?: string;
          exam_type?: ExamType;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      attendances: {
        Row: {
          id: string;
          patient_name: string;
          priority: AttendancePriority;
          notes: string | null;
          created_at: string;
          created_by: string;
          legacy_single_queue_item_id: string | null;
        };
        Insert: {
          id?: string;
          patient_name: string;
          priority?: AttendancePriority;
          notes?: string | null;
          created_at?: string;
          created_by: string;
          legacy_single_queue_item_id?: string | null;
        };
        Update: {
          id?: string;
          patient_name?: string;
          priority?: AttendancePriority;
          notes?: string | null;
          created_at?: string;
          created_by?: string;
          legacy_single_queue_item_id?: string | null;
        };
        Relationships: [];
      };
      queue_items: {
        Row: {
          id: string;
          attendance_id: string;
          patient_name: string | null;
          exam_type: ExamType;
          room_slug: string;
          notes: string | null;
          status: QueueStatus;
          created_by: string | null;
          updated_by: string | null;
          called_at: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attendance_id: string;
          patient_name?: string | null;
          exam_type: ExamType;
          room_slug?: string;
          notes?: string | null;
          status?: QueueStatus;
          created_by?: string | null;
          updated_by?: string | null;
          called_at?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attendance_id?: string;
          patient_name?: string | null;
          exam_type?: ExamType;
          room_slug?: string;
          notes?: string | null;
          status?: QueueStatus;
          created_by?: string | null;
          updated_by?: string | null;
          called_at?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      exam_type: ExamType;
      queue_status: QueueStatus;
      attendance_priority: AttendancePriority;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type ProfileRecord = Database["public"]["Tables"]["profiles"]["Row"];
export type ExamRoomRecord = Database["public"]["Tables"]["exam_rooms"]["Row"];
export type AttendanceRecord = Database["public"]["Tables"]["attendances"]["Row"];
export type QueueItemRecord = Database["public"]["Tables"]["queue_items"]["Row"];

export type QueueItemWithAttendance = QueueItemRecord & {
  attendance: AttendanceRecord | null;
};

export type AttendanceWithQueueItems = AttendanceRecord & {
  queueItems: QueueItemRecord[];
};
