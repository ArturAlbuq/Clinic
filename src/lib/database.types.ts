export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "recepcao" | "atendimento" | "admin";
export type ExamType =
  | "fotografia"
  | "escaneamento_intra_oral"
  | "periapical"
  | "interproximal"
  | "panoramica"
  | "telerradiografia"
  | "tomografia";
export type QueueStatus =
  | "aguardando"
  | "chamado"
  | "em_atendimento"
  | "finalizado"
  | "cancelado";
export type AttendancePriority =
  | "normal"
  | "sessenta_mais_outras"
  | "oitenta_mais";
export type AttendanceOverallStatus =
  | "aguardando"
  | "pendente_retorno"
  | "em_andamento"
  | "finalizado"
  | "cancelado";

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
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          sort_order: number;
          created_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      profile_room_access: {
        Row: {
          profile_id: string;
          room_slug: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          room_slug: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          room_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      manager_approval_attempts: {
        Row: {
          id: string;
          actor_user_id: string;
          attendance_id: string;
          manager_email: string;
          authorized_manager_id: string | null;
          success: boolean;
          failure_reason: string | null;
          ip_address: string | null;
          user_agent: string | null;
          attempted_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id: string;
          attendance_id: string;
          manager_email: string;
          authorized_manager_id?: string | null;
          success: boolean;
          failure_reason?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          attempted_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string;
          attendance_id?: string;
          manager_email?: string;
          authorized_manager_id?: string | null;
          success?: boolean;
          failure_reason?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          attempted_at?: string;
        };
        Relationships: [];
      };
      attendances: {
        Row: {
          id: string;
          patient_name: string;
          patient_registration_number: string | null;
          priority: AttendancePriority;
          notes: string | null;
          created_at: string;
          created_by: string;
          return_pending_at: string | null;
          return_pending_by: string | null;
          return_pending_reason: string | null;
          canceled_at: string | null;
          canceled_by: string | null;
          cancellation_reason: string | null;
          cancellation_authorized_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          deletion_reason: string | null;
          legacy_single_queue_item_id: string | null;
        };
        Insert: {
          id?: string;
          patient_name: string;
          patient_registration_number?: string | null;
          priority?: AttendancePriority;
          notes?: string | null;
          created_at?: string;
          created_by: string;
          return_pending_at?: string | null;
          return_pending_by?: string | null;
          return_pending_reason?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          cancellation_reason?: string | null;
          cancellation_authorized_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deletion_reason?: string | null;
          legacy_single_queue_item_id?: string | null;
        };
        Update: {
          id?: string;
          patient_name?: string;
          patient_registration_number?: string | null;
          priority?: AttendancePriority;
          notes?: string | null;
          created_at?: string;
          created_by?: string;
          return_pending_at?: string | null;
          return_pending_by?: string | null;
          return_pending_reason?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          cancellation_reason?: string | null;
          cancellation_authorized_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deletion_reason?: string | null;
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
          requested_quantity: number;
          updated_by: string | null;
          called_at: string | null;
          called_by: string | null;
          started_at: string | null;
          started_by: string | null;
          finished_at: string | null;
          finished_by: string | null;
          canceled_at: string | null;
          canceled_by: string | null;
          cancellation_reason: string | null;
          cancellation_authorized_by: string | null;
          return_pending_at: string | null;
          return_pending_by: string | null;
          return_pending_reason: string | null;
          reactivated_at: string | null;
          reactivated_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
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
          requested_quantity?: number;
          updated_by?: string | null;
          called_at?: string | null;
          called_by?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          finished_at?: string | null;
          finished_by?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          cancellation_reason?: string | null;
          cancellation_authorized_by?: string | null;
          return_pending_at?: string | null;
          return_pending_by?: string | null;
          return_pending_reason?: string | null;
          reactivated_at?: string | null;
          reactivated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
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
          requested_quantity?: number;
          updated_by?: string | null;
          called_at?: string | null;
          called_by?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          finished_at?: string | null;
          finished_by?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          cancellation_reason?: string | null;
          cancellation_authorized_by?: string | null;
          return_pending_at?: string | null;
          return_pending_by?: string | null;
          return_pending_reason?: string | null;
          reactivated_at?: string | null;
          reactivated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      exam_repetitions: {
        Row: {
          id: string;
          queue_item_id: string;
          attendance_id: string;
          exam_type: ExamType;
          room_slug: string | null;
          technician_id: string | null;
          repeated_at: string;
          repetition_index: number;
        };
        Insert: {
          id?: string;
          queue_item_id: string;
          attendance_id: string;
          exam_type: ExamType;
          room_slug?: string | null;
          technician_id?: string | null;
          repeated_at?: string;
          repetition_index: number;
        };
        Update: {
          id?: string;
          queue_item_id?: string;
          attendance_id?: string;
          exam_type?: ExamType;
          room_slug?: string | null;
          technician_id?: string | null;
          repeated_at?: string;
          repetition_index?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      cancel_queue_item: {
        Args: {
          p_authorized_by?: string | null;
          p_queue_item_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      create_attendance_with_queue_items: {
        Args: {
          p_exam_types: ExamType[];
          p_exam_quantities?: Json;
          p_notes: string | null;
          p_patient_name: string;
          p_patient_registration_number?: string | null;
          p_priority: AttendancePriority;
        };
        Returns: Json;
      };
      cancel_attendance: {
        Args: {
          p_attendance_id: string;
          p_authorized_by?: string | null;
          p_reason: string;
        };
        Returns: Json;
      };
      delete_attendance: {
        Args: {
          p_attendance_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      set_attendance_return_pending: {
        Args: {
          p_attendance_id: string;
          p_is_pending: boolean;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      set_queue_item_return_pending: {
        Args: {
          p_is_pending: boolean;
          p_queue_item_id: string;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      update_attendance_registration: {
        Args: {
          p_attendance_id: string;
          p_exam_quantities?: Json;
          p_notes: string | null;
          p_patient_name: string;
          p_patient_registration_number?: string | null;
        };
        Returns: Json;
      };
    };
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
export type ProfileRoomAccessRecord =
  Database["public"]["Tables"]["profile_room_access"]["Row"];
export type AttendanceRecord = Database["public"]["Tables"]["attendances"]["Row"];
export type QueueItemRecord = Database["public"]["Tables"]["queue_items"]["Row"];
export type ExamRepetitionRecord =
  Database["public"]["Tables"]["exam_repetitions"]["Row"];

export type QueueItemWithAttendance = QueueItemRecord & {
  attendance: AttendanceRecord | null;
};

export type AttendanceWithQueueItems = AttendanceRecord & {
  queueItems: QueueItemRecord[];
};
