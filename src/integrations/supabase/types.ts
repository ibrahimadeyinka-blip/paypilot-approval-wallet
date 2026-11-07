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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_history: {
        Row: {
          actor: string
          created_at: string
          detail: string | null
          event: string
          from_status: string | null
          id: string
          metadata: Json
          owner_id: string
          request_id: string
          to_status: string
        }
        Insert: {
          actor: string
          created_at?: string
          detail?: string | null
          event: string
          from_status?: string | null
          id?: string
          metadata?: Json
          owner_id: string
          request_id: string
          to_status: string
        }
        Update: {
          actor?: string
          created_at?: string
          detail?: string | null
          event?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          owner_id?: string
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "agent_payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_payment_requests: {
        Row: {
          amount_cents: number
          approved_at: string | null
          authorization_attempt: number
          authorization_error: string | null
          block_reason: string | null
          capture_attempt: number
          captured_at: string | null
          captured_by: string | null
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          delivery_requirements: string | null
          description: string
          id: string
          idempotency_key: string | null
          merchant_handle: string
          owner_id: string
          paypal_approve_url: string | null
          paypal_authorization_expires_at: string | null
          paypal_authorization_id: string | null
          paypal_authorization_status: string | null
          paypal_capture_id: string | null
          paypal_capture_status: string | null
          paypal_order_id: string | null
          settlement_error: string | null
          source_context: string
          status: string
          token_id: string
          transaction_id: string | null
          updated_at: string
          vendor_name: string
          void_attempt: number
          voided_at: string | null
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          authorization_attempt?: number
          authorization_error?: string | null
          block_reason?: string | null
          capture_attempt?: number
          captured_at?: string | null
          captured_by?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          delivery_requirements?: string | null
          description?: string
          id?: string
          idempotency_key?: string | null
          merchant_handle?: string
          owner_id: string
          paypal_approve_url?: string | null
          paypal_authorization_expires_at?: string | null
          paypal_authorization_id?: string | null
          paypal_authorization_status?: string | null
          paypal_capture_id?: string | null
          paypal_capture_status?: string | null
          paypal_order_id?: string | null
          settlement_error?: string | null
          source_context?: string
          status: string
          token_id: string
          transaction_id?: string | null
          updated_at?: string
          vendor_name?: string
          void_attempt?: number
          voided_at?: string | null
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          authorization_attempt?: number
          authorization_error?: string | null
          block_reason?: string | null
          capture_attempt?: number
          captured_at?: string | null
          captured_by?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          delivery_requirements?: string | null
          description?: string
          id?: string
          idempotency_key?: string | null
          merchant_handle?: string
          owner_id?: string
          paypal_approve_url?: string | null
          paypal_authorization_expires_at?: string | null
          paypal_authorization_id?: string | null
          paypal_authorization_status?: string | null
          paypal_capture_id?: string | null
          paypal_capture_status?: string | null
          paypal_order_id?: string | null
          settlement_error?: string | null
          source_context?: string
          status?: string
          token_id?: string
          transaction_id?: string | null
          updated_at?: string
          vendor_name?: string
          void_attempt?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_payment_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_payment_requests_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "agent_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_payment_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tokens: {
        Row: {
          created_at: string
          daily_cap_cents: number
          expires_at: string
          id: string
          label: string
          merchant_whitelist: string[]
          owner_id: string
          revoked: boolean
          single_cap_cents: number
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          daily_cap_cents?: number
          expires_at: string
          id?: string
          label: string
          merchant_whitelist?: string[]
          owner_id?: string
          revoked?: boolean
          single_cap_cents?: number
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          daily_cap_cents?: number
          expires_at?: string
          id?: string
          label?: string
          merchant_whitelist?: string[]
          owner_id?: string
          revoked?: boolean
          single_cap_cents?: number
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tokens_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_timeline: {
        Row: {
          actor: string
          created_at: string
          detail: string | null
          id: string
          metadata: Json
          step: string
          title: string
          transaction_id: string
        }
        Insert: {
          actor?: string
          created_at?: string
          detail?: string | null
          id?: string
          metadata?: Json
          step: string
          title?: string
          transaction_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          detail?: string | null
          id?: string
          metadata?: Json
          step?: string
          title?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_timeline_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          product_id: string
          seller_id: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          buyer_id?: string
          created_at?: string
          id?: string
          product_id: string
          seller_id: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          product_id?: string
          seller_id?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          ai_confidence: number | null
          ai_model: string | null
          ai_notes: string | null
          ai_verdict: string
          filename: string
          id: string
          link_id: string | null
          mime_type: string | null
          request_id: string | null
          reviewed_at: string | null
          size_bytes: number | null
          storage_path: string
          transaction_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_model?: string | null
          ai_notes?: string | null
          ai_verdict?: string
          filename?: string
          id?: string
          link_id?: string | null
          mime_type?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          size_bytes?: number | null
          storage_path?: string
          transaction_id: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_model?: string | null
          ai_notes?: string | null
          ai_verdict?: string
          filename?: string
          id?: string
          link_id?: string | null
          mime_type?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          size_bytes?: number | null
          storage_path?: string
          transaction_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "delivery_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "agent_payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          owner_id: string
          request_id: string
          revoked: boolean
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          owner_id: string
          request_id: string
          revoked?: boolean
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          owner_id?: string
          request_id?: string
          revoked?: boolean
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_links_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "agent_payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          detail: string | null
          event_type: string
          id: string
          transaction_id: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          transaction_id: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          draft_transaction: Json | null
          id: string
          role: string
          sender_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          draft_transaction?: Json | null
          id?: string
          role?: string
          sender_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          draft_transaction?: Json | null
          id?: string
          role?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          description: string
          id: string
          image_url: string | null
          price_cents: number
          seller_id: string
          status: string
          stock: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          image_url?: string | null
          price_cents?: number
          seller_id?: string
          status?: string
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          image_url?: string | null
          price_cents?: number
          seller_id?: string
          status?: string
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          paypal_connected: boolean
          paypal_handle: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          paypal_connected?: boolean
          paypal_handle?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          paypal_connected?: boolean
          paypal_handle?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          ai_reasoning: string | null
          ai_request: string
          amount_cents: number
          created_at: string
          currency: string
          description: string
          id: string
          proof_verified: boolean
          source_filename: string | null
          source_text: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_handle: string | null
          vendor_name: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_request?: string
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string
          id?: string
          proof_verified?: boolean
          source_filename?: string | null
          source_text?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vendor_handle?: string | null
          vendor_name?: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_request?: string
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string
          id?: string
          proof_verified?: boolean
          source_filename?: string | null
          source_text?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vendor_handle?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_transaction: {
        Args: { p_action: string; p_transaction_id: string }
        Returns: undefined
      }
      agent_budget_statuses: { Args: never; Returns: string[] }
      agent_request_violation: {
        Args: {
          p_req: Database["public"]["Tables"]["agent_payment_requests"]["Row"]
          p_token: Database["public"]["Tables"]["agent_tokens"]["Row"]
        }
        Returns: string
      }
      attach_agent_paypal_order: {
        Args: {
          p_approve_url: string
          p_attempt: number
          p_order_id: string
          p_request_id: string
        }
        Returns: boolean
      }
      begin_agent_authorization: {
        Args: { p_owner_id: string; p_request_id: string }
        Returns: Json
      }
      begin_agent_capture: {
        Args: { p_actor: string; p_owner_id: string; p_request_id: string }
        Returns: Json
      }
      begin_agent_void: {
        Args: { p_owner_id: string; p_request_id: string }
        Returns: Json
      }
      check_agent_authorization: {
        Args: { p_order_id: string; p_owner_id: string; p_request_id: string }
        Returns: Json
      }
      claim_delivery_link: { Args: { p_token_hash: string }; Returns: Json }
      create_delivery_link: {
        Args: {
          p_days: number
          p_request_id: string
          p_requirements: string
          p_token_hash: string
        }
        Returns: Json
      }
      decide_agent_payment: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: string
      }
      decline_agent_payment: { Args: { p_request_id: string }; Returns: string }
      fail_agent_authorization: {
        Args: { p_attempt: number; p_error: string; p_request_id: string }
        Returns: boolean
      }
      fail_agent_capture: {
        Args: {
          p_attempt: number
          p_error: string
          p_request_id: string
          p_terminal: boolean
        }
        Returns: boolean
      }
      fail_agent_void: {
        Args: { p_attempt: number; p_error: string; p_request_id: string }
        Returns: boolean
      }
      get_delivery_link_info: { Args: { p_token_hash: string }; Returns: Json }
      record_agent_authorization: {
        Args: {
          p_attempt: number
          p_authorization_id: string
          p_authorization_status: string
          p_expires_at: string
          p_order_id: string
          p_request_id: string
        }
        Returns: Json
      }
      record_agent_capture: {
        Args: {
          p_attempt: number
          p_capture_id: string
          p_capture_status: string
          p_request_id: string
        }
        Returns: Json
      }
      record_agent_void: {
        Args: { p_attempt: number; p_note: string; p_request_id: string }
        Returns: Json
      }
      record_deliverable: {
        Args: {
          p_deliverable_id: string
          p_filename: string
          p_link_id: string
          p_mime: string
          p_request_id: string
          p_size: number
          p_storage_path: string
        }
        Returns: string
      }
      record_deliverable_review: {
        Args: {
          p_confidence: number
          p_deliverable_id: string
          p_model: string
          p_summary: string
          p_verdict: string
        }
        Returns: undefined
      }
      release_delivery_link: { Args: { p_link_id: string }; Returns: undefined }
      respond_to_order: {
        Args: { p_accept: boolean; p_message_id: string }
        Returns: string
      }
      submit_agent_payment: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_description: string
          p_idempotency_key: string
          p_merchant_handle: string
          p_source_context: string
          p_token_hash: string
          p_vendor_name: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
