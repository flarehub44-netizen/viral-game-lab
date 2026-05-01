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
      admin_action_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          payload: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Relationships: []
      }
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
      data_access_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          context: Json
          created_at: string
          id: number
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          context?: Json
          created_at?: string
          id?: number
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          context?: Json
          created_at?: string
          id?: number
          target_user_id?: string | null
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
      lgpd_deletion_requests: {
        Row: {
          completed_at: string | null
          id: string
          reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pix_deposits: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string | null
          provider_ref: string | null
          qr_code: string
          status: string
          user_id: string
          webhook_payload: Json
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key?: string | null
          provider_ref?: string | null
          qr_code?: string
          status?: string
          user_id: string
          webhook_payload?: Json
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          provider_ref?: string | null
          qr_code?: string
          status?: string
          user_id?: string
          webhook_payload?: Json
        }
        Relationships: []
      }
      pix_withdrawals: {
        Row: {
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          pix_key: string
          pix_key_type: string
          processed_at: string | null
          provider_ref: string | null
          status: string
          user_id: string
          webhook_payload: Json
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          pix_key: string
          pix_key_type: string
          processed_at?: string | null
          provider_ref?: string | null
          status?: string
          user_id: string
          webhook_payload?: Json
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          pix_key?: string
          pix_key_type?: string
          processed_at?: string | null
          provider_ref?: string | null
          status?: string
          user_id?: string
          webhook_payload?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      user_consents: {
        Row: {
          accepted_at: string
          document_type: string
          document_version: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          document_version: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          document_version?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      webhook_events: {
        Row: {
          event_type: string
          id: number
          payload: Json
          processed_at: string
          provider: string
          provider_event_id: string
          source_ip: string | null
          status: string
        }
        Insert: {
          event_type: string
          id?: number
          payload?: Json
          processed_at?: string
          provider: string
          provider_event_id: string
          source_ip?: string | null
          status: string
        }
        Update: {
          event_type?: string
          id?: number
          payload?: Json
          processed_at?: string
          provider?: string
          provider_event_id?: string
          source_ip?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_monitor_alerts: {
        Row: {
          generated_at: string | null
          open_rounds_over_5min: number | null
          rate_limit_exceeded_1h: number | null
          rejected_rate: number | null
          rejected_rounds: number | null
          rtp: number | null
          status: string | null
          total_rounds: number | null
          webhook_duplicates_1h: number | null
        }
        Relationships: []
      }
      v_round_health: {
        Row: {
          bucket_hour: string | null
          closed_rounds: number | null
          expired_rounds: number | null
          rejected_rounds: number | null
          total_rounds: number | null
        }
        Relationships: []
      }
      v_rtp_live: {
        Row: {
          bucket_hour: string | null
          rtp: number | null
          total_payout: number | null
          total_stake: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_ban_user: {
        Args: { p_actor: string; p_target: string }
        Returns: undefined
      }
      admin_credit_wallet: {
        Args: {
          p_actor: string
          p_amount: number
          p_note?: string
          p_target: string
        }
        Returns: number
      }
      admin_debit_wallet: {
        Args: {
          p_actor: string
          p_amount: number
          p_note?: string
          p_target: string
        }
        Returns: number
      }
      admin_delete_sandbox_rounds: {
        Args: { p_actor: string }
        Returns: number
      }
      admin_log_action: {
        Args: {
          p_action: string
          p_admin_id: string
          p_payload: Json
          p_target: string
        }
        Returns: undefined
      }
      admin_sandbox_round: {
        Args: {
          p_admin_id: string
          p_idempotency_key: string
          p_layout_seed: string
          p_layout_signature: string
          p_max_duration_seconds: number
          p_net: number
          p_payout: number
          p_result_mult: number
          p_stake: number
          p_target_barrier: number
          p_visual: Json
        }
        Returns: string
      }
      admin_search_users: {
        Args: { p_actor: string; p_limit?: number; p_query: string }
        Returns: {
          balance: number
          deleted_at: string
          display_name: string
          email: string
          is_admin: boolean
          kyc_status: string
          user_id: string
        }[]
      }
      admin_set_age_confirmed: {
        Args: { p_actor: string; p_confirmed: boolean; p_target: string }
        Returns: undefined
      }
      admin_set_feature_flag: {
        Args: {
          p_actor: string
          p_enabled: boolean
          p_key: string
          p_rollout?: number
        }
        Returns: undefined
      }
      admin_set_kyc: {
        Args: { p_actor: string; p_status: string; p_target: string }
        Returns: undefined
      }
      admin_unban_user: {
        Args: { p_actor: string; p_target: string }
        Returns: undefined
      }
      apply_syncpay_cashout_webhook: {
        Args: { p_payload?: Json; p_reference_id: string; p_status: string }
        Returns: string
      }
      auto_process_lgpd_deletions: { Args: never; Returns: number }
      cancel_pix_deposit_pending: {
        Args: { p_deposit_id: string }
        Returns: undefined
      }
      close_stale_open_rounds: {
        Args: { p_grace_seconds?: number }
        Returns: number
      }
      confirm_age_18: { Args: never; Returns: string }
      confirm_pix_deposit: {
        Args: {
          p_amount: number
          p_provider_ref: string
          p_webhook_payload?: Json
        }
        Returns: string
      }
      create_pix_deposit_pending: {
        Args: {
          p_amount: number
          p_expires_at: string
          p_idempotency_key?: string
          p_user_id: string
        }
        Returns: string
      }
      finalize_pix_deposit_pending: {
        Args: {
          p_deposit_id: string
          p_provider_ref: string
          p_qr_code: string
        }
        Returns: undefined
      }
      finalize_pix_withdrawal: {
        Args: { p_provider_ref: string; p_withdrawal_id: string }
        Returns: undefined
      }
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
      log_data_access_event: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_context?: Json
          p_target_user_id: string
        }
        Returns: undefined
      }
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
      process_lgpd_deletion: { Args: { p_user_id: string }; Returns: undefined }
      register_webhook_event: {
        Args: {
          p_event_type: string
          p_payload: Json
          p_provider: string
          p_provider_event_id: string
          p_source_ip: string
          p_status: string
        }
        Returns: boolean
      }
      request_lgpd_deletion: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: string
      }
      request_pix_withdrawal: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_pix_key: string
          p_pix_key_type: string
          p_provider_ref?: string
          p_user_id: string
        }
        Returns: string
      }
      reverse_pix_withdrawal: {
        Args: { p_withdrawal_id: string }
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
