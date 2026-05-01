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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_request_logs: {
        Row: {
          action: string
          created_at: string
          device_fingerprint: string | null
          id: number
          ip: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          device_fingerprint?: string | null
          id?: number
          ip?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          device_fingerprint?: string | null
          id?: number
          ip?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          rollout_percent: number
          rules: Json
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          rollout_percent?: number
          rules?: Json
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          rollout_percent?: number
          rules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      fraud_signals: {
        Row: {
          created_at: string
          id: number
          payload: Json
          round_id: string | null
          score: number
          signal: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          payload?: Json
          round_id?: string | null
          score?: number
          signal: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          round_id?: string | null
          score?: number
          signal?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_signals_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rounds: {
        Row: {
          client_report: Json
          created_at: string
          ended_at: string | null
          id: string
          idempotency_key: string | null
          layout_seed: string
          layout_signature: string
          max_duration_seconds: number
          mode: string
          net_result: number
          payout: number
          result_multiplier: number
          round_status: string
          stake: number
          target_barrier: number
          target_multiplier: number
          user_id: string
          visual_result: Json
        }
        Insert: {
          client_report?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          idempotency_key?: string | null
          layout_seed: string
          layout_signature: string
          max_duration_seconds: number
          mode?: string
          net_result: number
          payout: number
          result_multiplier: number
          round_status?: string
          stake: number
          target_barrier: number
          target_multiplier?: number
          user_id: string
          visual_result?: Json
        }
        Update: {
          client_report?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          idempotency_key?: string | null
          layout_seed?: string
          layout_signature?: string
          max_duration_seconds?: number
          mode?: string
          net_result?: number
          payout?: number
          result_multiplier?: number
          round_status?: string
          stake?: number
          target_barrier?: number
          target_multiplier?: number
          user_id?: string
          visual_result?: Json
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          idempotency_key: string | null
          kind: string
          meta: Json
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kind: string
          meta?: Json
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kind?: string
          meta?: Json
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          display_name: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          over_18_confirmed_at: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          display_name?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          over_18_confirmed_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          display_name?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          over_18_confirmed_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          created_at: string
          duration_seconds: number
          id: string
          max_multiplier: number
          nickname: string
          round_id: string | null
          score: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds: number
          id?: string
          max_multiplier: number
          nickname: string
          round_id?: string | null
          score: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          max_multiplier?: number
          nickname?: string
          round_id?: string | null
          score?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      close_stale_open_rounds: {
        Args: { p_grace_seconds?: number }
        Returns: number
      }
      confirm_age_18: { Args: never; Returns: string }
      get_user_pix_identity: {
        Args: { p_user_id: string }
        Returns: {
          cpf: string
          phone: string
        }[]
      }
      guard_request_rate: {
        Args: {
          p_action: string
          p_device_fingerprint: string
          p_ip: string
          p_limit?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_valid_cpf_digits: { Args: { p_digits: string }; Returns: boolean }
      log_fraud_signal: {
        Args: {
          p_payload?: Json
          p_round_id: string
          p_score?: number
          p_signal: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_profile_display_name: {
        Args: { p_display_name: string }
        Returns: undefined
      }
      set_profile_pix_identity: {
        Args: { p_cpf: string; p_phone: string }
        Returns: undefined
      }
      start_round_atomic: {
        Args: {
          p_idempotency_key: string
          p_layout_seed: string
          p_layout_signature: string
          p_max_duration_seconds: number
          p_net: number
          p_payout: number
          p_result_mult: number
          p_stake: number
          p_target_barrier: number
          p_user_id: string
          p_visual: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      kyc_status: "none" | "pending" | "approved"
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
      app_role: ["admin", "moderator", "user"],
      kyc_status: ["none", "pending", "approved"],
    },
  },
} as const
