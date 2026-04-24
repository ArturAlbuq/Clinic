export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      attendances: {
        Row: {
          canceled_at: string | null
          canceled_by: string | null
          cancellation_authorized_by: string | null
          cancellation_reason: string | null
          com_cefalometria: boolean
          com_impressao_fotografia: boolean
          com_laboratorio_externo_escaneamento: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          legacy_single_queue_item_id: string | null
          notes: string | null
          patient_name: string
          patient_registration_number: string | null
          priority: Database["public"]["Enums"]["attendance_priority"]
          return_pending_at: string | null
          return_pending_by: string | null
          return_pending_reason: string | null
        }
        Insert: {
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_authorized_by?: string | null
          cancellation_reason?: string | null
          com_cefalometria?: boolean
          com_impressao_fotografia?: boolean
          com_laboratorio_externo_escaneamento?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          legacy_single_queue_item_id?: string | null
          notes?: string | null
          patient_name: string
          patient_registration_number?: string | null
          priority?: Database["public"]["Enums"]["attendance_priority"]
          return_pending_at?: string | null
          return_pending_by?: string | null
          return_pending_reason?: string | null
        }
        Update: {
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_authorized_by?: string | null
          cancellation_reason?: string | null
          com_cefalometria?: boolean
          com_impressao_fotografia?: boolean
          com_laboratorio_externo_escaneamento?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          legacy_single_queue_item_id?: string | null
          notes?: string | null
          patient_name?: string
          patient_registration_number?: string | null
          priority?: Database["public"]["Enums"]["attendance_priority"]
          return_pending_at?: string | null
          return_pending_by?: string | null
          return_pending_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_cancellation_authorized_by_fkey"
            columns: ["cancellation_authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_return_pending_by_fkey"
            columns: ["return_pending_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_repetitions: {
        Row: {
          exam_type: Database["public"]["Enums"]["exam_type"]
          id: string
          queue_item_id: string
          repeated_at: string
          repetition_index: number
          repetition_reason: string | null
          repetition_sequence: number
          room_slug: string | null
          technician_id: string | null
        }
        Insert: {
          exam_type: Database["public"]["Enums"]["exam_type"]
          id?: string
          queue_item_id: string
          repeated_at?: string
          repetition_index: number
          repetition_reason?: string | null
          repetition_sequence?: number
          room_slug?: string | null
          technician_id?: string | null
        }
        Update: {
          exam_type?: Database["public"]["Enums"]["exam_type"]
          id?: string
          queue_item_id?: string
          repeated_at?: string
          repetition_index?: number
          repetition_reason?: string | null
          repetition_sequence?: number
          room_slug?: string | null
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_repetitions_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "queue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_repetitions_room_slug_fkey"
            columns: ["room_slug"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "exam_repetitions_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_rooms: {
        Row: {
          created_at: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          name: string
          slug: string
          sort_order: number
        }
        Update: {
          created_at?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      manager_approval_attempts: {
        Row: {
          actor_user_id: string
          attempted_at: string
          attendance_id: string
          authorized_manager_id: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          manager_email: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          actor_user_id: string
          attempted_at?: string
          attendance_id: string
          authorized_manager_id?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          manager_email: string
          success: boolean
          user_agent?: string | null
        }
        Update: {
          actor_user_id?: string
          attempted_at?: string
          attendance_id?: string
          authorized_manager_id?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          manager_email?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_approval_attempts_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_approval_attempts_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_approval_attempts_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_approval_attempts_authorized_manager_id_fkey"
            columns: ["authorized_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_events: {
        Row: {
          id: string
          metadata: Json | null
          new_status: Database["public"]["Enums"]["pipeline_status"]
          notes: string | null
          occurred_at: string
          performed_by: string | null
          pipeline_item_id: string
          previous_status: Database["public"]["Enums"]["pipeline_status"] | null
        }
        Insert: {
          id?: string
          metadata?: Json | null
          new_status: Database["public"]["Enums"]["pipeline_status"]
          notes?: string | null
          occurred_at?: string
          performed_by?: string | null
          pipeline_item_id: string
          previous_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
        }
        Update: {
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["pipeline_status"]
          notes?: string | null
          occurred_at?: string
          performed_by?: string | null
          pipeline_item_id?: string
          previous_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_events_pipeline_item_id_fkey"
            columns: ["pipeline_item_id"]
            isOneToOne: false
            referencedRelation: "pipeline_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_items: {
        Row: {
          attendance_id: string
          created_by: string | null
          finished_at: string | null
          id: string
          metadata: Json
          notes: string | null
          opened_at: string
          pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          queue_item_id: string | null
          responsible_id: string | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
        }
        Insert: {
          attendance_id: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          opened_at?: string
          pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          queue_item_id?: string | null
          responsible_id?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Update: {
          attendance_id?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          opened_at?: string
          pipeline_type?: Database["public"]["Enums"]["pipeline_type"]
          queue_item_id?: string | null
          responsible_id?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_items_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_items_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_items_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "queue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_items_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_item_queue_items: {
        Row: {
          created_at: string
          pipeline_item_id: string
          queue_item_id: string
        }
        Insert: {
          created_at?: string
          pipeline_item_id: string
          queue_item_id: string
        }
        Update: {
          created_at?: string
          pipeline_item_id?: string
          queue_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_item_queue_items_pipeline_item_id_fkey"
            columns: ["pipeline_item_id"]
            isOneToOne: false
            referencedRelation: "pipeline_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_item_queue_items_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "queue_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_room_access: {
        Row: {
          created_at: string
          profile_id: string
          room_slug: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          room_slug: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          room_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_room_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_room_access_room_slug_fkey"
            columns: ["room_slug"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      queue_items: {
        Row: {
          attendance_id: string | null
          called_at: string | null
          called_by: string | null
          canceled_at: string | null
          canceled_by: string | null
          cancellation_authorized_by: string | null
          cancellation_reason: string | null
          com_laudo: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          finished_at: string | null
          finished_by: string | null
          id: string
          notes: string | null
          patient_name: string | null
          reactivated_at: string | null
          reactivated_by: string | null
          requested_quantity: number
          return_pending_at: string | null
          return_pending_by: string | null
          return_pending_reason: string | null
          room_slug: string
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attendance_id?: string | null
          called_at?: string | null
          called_by?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_authorized_by?: string | null
          cancellation_reason?: string | null
          com_laudo?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          finished_at?: string | null
          finished_by?: string | null
          id?: string
          notes?: string | null
          patient_name?: string | null
          reactivated_at?: string | null
          reactivated_by?: string | null
          requested_quantity?: number
          return_pending_at?: string | null
          return_pending_by?: string | null
          return_pending_reason?: string | null
          room_slug: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attendance_id?: string | null
          called_at?: string | null
          called_by?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_authorized_by?: string | null
          cancellation_reason?: string | null
          com_laudo?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          finished_at?: string | null
          finished_by?: string | null
          id?: string
          notes?: string | null
          patient_name?: string | null
          reactivated_at?: string | null
          reactivated_by?: string | null
          requested_quantity?: number
          return_pending_at?: string | null
          return_pending_by?: string | null
          return_pending_reason?: string | null
          room_slug?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_items_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_called_by_fkey"
            columns: ["called_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_cancellation_authorized_by_fkey"
            columns: ["cancellation_authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_finished_by_fkey"
            columns: ["finished_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_reactivated_by_fkey"
            columns: ["reactivated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_return_pending_by_fkey"
            columns: ["return_pending_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_room_slug_fkey"
            columns: ["room_slug"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "queue_items_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_config: {
        Row: {
          business_days: number
          id: string
          pipeline_subtype: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_days: number
          id?: string
          pipeline_subtype: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_days?: number
          id?: string
          pipeline_subtype?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      attendance_overview: {
        Row: {
          active_steps: number | null
          canceled_at: string | null
          canceled_by: string | null
          canceled_steps: number | null
          cancellation_authorized_by: string | null
          cancellation_reason: string | null
          created_at: string | null
          created_by: string | null
          current_room_slug: string | null
          finished_steps: number | null
          id: string | null
          notes: string | null
          overall_status: string | null
          patient_name: string | null
          patient_registration_number: string | null
          priority: Database["public"]["Enums"]["attendance_priority"] | null
          return_pending_steps: number | null
          total_steps: number | null
          waiting_steps: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_cancellation_authorized_by_fkey"
            columns: ["cancellation_authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_business_days: {
        Args: { p_days: number; p_start: string }
        Returns: string
      }
      backfill_sla_deadline_for_subtype: {
        Args: { p_business_days: number; p_pipeline_subtype: string }
        Returns: undefined
      }
      cancel_attendance: {
        Args: {
          p_attendance_id: string
          p_authorized_by?: string
          p_reason: string
        }
        Returns: Json
      }
      cancel_queue_item: {
        Args: {
          p_authorized_by?: string
          p_queue_item_id: string
          p_reason: string
        }
        Returns: Json
      }
      create_attendance_with_queue_items:
        | {
            Args: {
              p_exam_quantities?: Json
              p_exam_types: Database["public"]["Enums"]["exam_type"][]
              p_notes: string
              p_patient_name: string
              p_priority: Database["public"]["Enums"]["attendance_priority"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_exam_quantities?: Json
              p_exam_types: Database["public"]["Enums"]["exam_type"][]
              p_notes: string
              p_patient_name: string
              p_patient_registration_number?: string
              p_priority: Database["public"]["Enums"]["attendance_priority"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_com_cefalometria?: boolean
              p_com_impressao_fotografia?: boolean
              p_com_laboratorio_externo_escaneamento?: boolean
              p_com_laudo_per_exam?: Json
              p_exam_quantities?: Json
              p_exam_types: Database["public"]["Enums"]["exam_type"][]
              p_notes: string
              p_patient_name: string
              p_patient_registration_number?: string
              p_priority: Database["public"]["Enums"]["attendance_priority"]
            }
            Returns: Json
          }
      create_pipeline_item_if_missing: {
        Args: {
          p_attendance_id: string
          p_created_by?: string
          p_metadata?: Json
          p_notes?: string
          p_pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          p_queue_item_id: string
        }
        Returns: string
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      delete_attendance: {
        Args: { p_attendance_id: string; p_reason?: string }
        Returns: Json
      }
      register_exam_repetition: {
        Args: { p_queue_item_id: string; p_reason: string }
        Returns: Json
      }
      resolve_sla_subtype: {
        Args: {
          p_metadata: Json
          p_pipeline_type: Database["public"]["Enums"]["pipeline_type"]
        }
        Returns: string
      }
      set_attendance_return_pending: {
        Args: {
          p_attendance_id: string
          p_is_pending: boolean
          p_reason?: string
        }
        Returns: Json
      }
      set_queue_item_return_pending: {
        Args: {
          p_is_pending: boolean
          p_queue_item_id: string
          p_reason?: string
        }
        Returns: Json
      }
      update_attendance_registration:
        | {
            Args: {
              p_attendance_id: string
              p_exam_quantities?: Json
              p_notes: string
              p_patient_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_attendance_id: string
              p_exam_quantities?: Json
              p_notes: string
              p_patient_name: string
              p_patient_registration_number?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_attendance_id: string
              p_com_cefalometria?: boolean
              p_com_impressao_fotografia?: boolean
              p_com_laboratorio_externo_escaneamento?: boolean
              p_com_laudo_per_exam?: Json
              p_exam_quantities?: Json
              p_notes: string
              p_patient_name: string
              p_patient_registration_number?: string
            }
            Returns: Json
          }
      user_can_access_attendance: {
        Args: { target_attendance_id: string }
        Returns: boolean
      }
      user_has_room_access: {
        Args: { target_room_slug: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "recepcao" | "atendimento" | "admin" | "gerencia"
      attendance_priority: "normal" | "sessenta_mais_outras" | "oitenta_mais"
      exam_type:
        | "fotografia_escaneamento"
        | "periapical"
        | "panoramico"
        | "tomografia"
        | "fotografia"
        | "escaneamento_intra_oral"
        | "interproximal"
        | "panoramica"
        | "telerradiografia"
      pipeline_status:
        | "nao_iniciado"
        | "pendente_envio"
        | "enviado_radiologista"
        | "devolvido_radiologista"
        | "recebido_corrigido"
        | "revisado_liberado"
        | "em_ajuste"
        | "publicado_idoc"
        | "disponivel_impressao"
        | "enviado_impressao"
        | "enviado_laboratorio_externo"
        | "retornado_laboratorio"
        | "publicado_finalizado"
      pipeline_type: "laudo" | "cefalometria" | "fotografia" | "escaneamento"
      queue_status:
        | "aguardando"
        | "chamado"
        | "em_atendimento"
        | "finalizado"
        | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["recepcao", "atendimento", "admin", "gerencia"],
      attendance_priority: ["normal", "sessenta_mais_outras", "oitenta_mais"],
      exam_type: [
        "fotografia_escaneamento",
        "periapical",
        "panoramico",
        "tomografia",
        "fotografia",
        "escaneamento_intra_oral",
        "interproximal",
        "panoramica",
        "telerradiografia",
      ],
      pipeline_status: [
        "nao_iniciado",
        "pendente_envio",
        "enviado_radiologista",
        "devolvido_radiologista",
        "recebido_corrigido",
        "revisado_liberado",
        "em_ajuste",
        "publicado_idoc",
        "disponivel_impressao",
        "enviado_impressao",
        "enviado_laboratorio_externo",
        "retornado_laboratorio",
        "publicado_finalizado",
      ],
      pipeline_type: ["laudo", "cefalometria", "fotografia", "escaneamento"],
      queue_status: [
        "aguardando",
        "chamado",
        "em_atendimento",
        "finalizado",
        "cancelado",
      ],
    },
  },
} as const

// Convenience type aliases
export type PipelineStatus = Database["public"]["Enums"]["pipeline_status"];
export type PipelineType = Database["public"]["Enums"]["pipeline_type"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type ProfileRecord = Tables<"profiles">;
export type AttendanceRecord = Tables<"attendances">;
export type QueueItemRecord = Tables<"queue_items">;
export type QueueStatus = Database["public"]["Enums"]["queue_status"];
export type ExamType = Database["public"]["Enums"]["exam_type"];
export type AttendancePriority = Database["public"]["Enums"]["attendance_priority"];
export type AttendanceOverallStatus = "aguardando" | "pendente_retorno" | "em_andamento" | "finalizado" | "cancelado";
export type ExamRepetitionRecord = Tables<"exam_repetitions">;

export type ExamRoomRecord = Tables<"exam_rooms">;

export type QueueItemWithAttendance = QueueItemRecord & {
  attendance: AttendanceRecord | null;
};

export type AttendanceWithQueueItems = AttendanceRecord & {
  queueItems: QueueItemRecord[];
};

export type PipelineFlags = {
  com_cefalometria: boolean;
  com_impressao_fotografia: boolean;
  com_laboratorio_externo_escaneamento: boolean;
};

export type PipelineItemRecord = Tables<"pipeline_items">;
