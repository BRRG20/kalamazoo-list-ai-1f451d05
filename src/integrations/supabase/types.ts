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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      authorized_emails: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      autopilot_runs: {
        Row: {
          batch_id: string
          batch_size: number
          created_at: string
          current_batch: number
          id: string
          last_error: string | null
          processed_cards: number
          status: Database["public"]["Enums"]["autopilot_run_status"]
          total_cards: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id: string
          batch_size?: number
          created_at?: string
          current_batch?: number
          id?: string
          last_error?: string | null
          processed_cards?: number
          status?: Database["public"]["Enums"]["autopilot_run_status"]
          total_cards?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string
          batch_size?: number
          created_at?: string
          current_batch?: number
          id?: string
          last_error?: string | null
          processed_cards?: number
          status?: Database["public"]["Enums"]["autopilot_run_status"]
          total_cards?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      default_tags: {
        Row: {
          assigned_garment_types: string[]
          created_at: string
          gender: string | null
          id: string
          keywords: string[] | null
          tag_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_garment_types?: string[]
          created_at?: string
          gender?: string | null
          id?: string
          keywords?: string[] | null
          tag_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_garment_types?: string[]
          created_at?: string
          gender?: string | null
          id?: string
          keywords?: string[] | null
          tag_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      etsy_credentials: {
        Row: {
          access_token_encrypted: string | null
          app_key_encrypted: string
          created_at: string
          id: string
          refresh_token_encrypted: string | null
          shared_secret_encrypted: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          app_key_encrypted: string
          created_at?: string
          id?: string
          refresh_token_encrypted?: string | null
          shared_secret_encrypted: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          app_key_encrypted?: string
          created_at?: string
          id?: string
          refresh_token_encrypted?: string | null
          shared_secret_encrypted?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      images: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          include_in_shopify: boolean
          position: number
          product_id: string | null
          url: string
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          include_in_shopify?: boolean
          position?: number
          product_id?: string | null
          url: string
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          include_in_shopify?: boolean
          position?: number
          product_id?: string | null
          url?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "images_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          connected_at: string | null
          connected_shop_id: string | null
          connected_shop_name: string | null
          created_at: string
          environment: string | null
          id: string
          integration_type: string
          max_requests_per_day: number | null
          max_requests_per_second: number | null
          oauth_status: string | null
          rate_limit_mode: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          connected_shop_id?: string | null
          connected_shop_name?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          integration_type: string
          max_requests_per_day?: number | null
          max_requests_per_second?: number | null
          oauth_status?: string | null
          rate_limit_mode?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          connected_shop_id?: string | null
          connected_shop_name?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          integration_type?: string
          max_requests_per_day?: number | null
          max_requests_per_second?: number | null
          oauth_status?: string | null
          rate_limit_mode?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_connections: {
        Row: {
          connected_at: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          marketplace: string
          shop_id: string | null
          shop_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          marketplace: string
          shop_id?: string | null
          shop_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          marketplace?: string
          shop_id?: string | null
          shop_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          batch_id: string
          batch_number: number | null
          brand: string | null
          category_path: string | null
          collections_tags: string | null
          colour_main: string | null
          colour_secondary: string | null
          condition: Database["public"]["Enums"]["condition_type"] | null
          confidence: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          department: Database["public"]["Enums"]["department"] | null
          description: string | null
          description_style_a: string | null
          description_style_b: string | null
          ebay_listing_id: string | null
          ebay_listing_state: string | null
          era: Database["public"]["Enums"]["era"] | null
          etsy_listing_id: string | null
          etsy_listing_state: string | null
          etsy_tags: string | null
          fit: string | null
          flags: Json | null
          flaws: string | null
          garment_type: string | null
          generated_at: string | null
          id: string
          is_hidden: boolean
          listing_block: string | null
          made_in: string | null
          material: string | null
          notes: string | null
          pattern: string | null
          pit_to_pit: string | null
          price: number | null
          qc_status: Database["public"]["Enums"]["qc_status"] | null
          raw_input_text: string | null
          run_id: string | null
          shopify_handle: string | null
          shopify_product_id: string | null
          shopify_tags: string | null
          size_label: string | null
          size_recommended: string | null
          size_type: string | null
          sku: string | null
          sleeve_length: string | null
          status: Database["public"]["Enums"]["product_status"]
          style: string | null
          title: string | null
          updated_at: string
          upload_error: string | null
          uploaded_at: string | null
          user_id: string | null
          when_made: string | null
          who_made: string | null
        }
        Insert: {
          batch_id: string
          batch_number?: number | null
          brand?: string | null
          category_path?: string | null
          collections_tags?: string | null
          colour_main?: string | null
          colour_secondary?: string | null
          condition?: Database["public"]["Enums"]["condition_type"] | null
          confidence?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          description_style_a?: string | null
          description_style_b?: string | null
          ebay_listing_id?: string | null
          ebay_listing_state?: string | null
          era?: Database["public"]["Enums"]["era"] | null
          etsy_listing_id?: string | null
          etsy_listing_state?: string | null
          etsy_tags?: string | null
          fit?: string | null
          flags?: Json | null
          flaws?: string | null
          garment_type?: string | null
          generated_at?: string | null
          id?: string
          is_hidden?: boolean
          listing_block?: string | null
          made_in?: string | null
          material?: string | null
          notes?: string | null
          pattern?: string | null
          pit_to_pit?: string | null
          price?: number | null
          qc_status?: Database["public"]["Enums"]["qc_status"] | null
          raw_input_text?: string | null
          run_id?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string | null
          shopify_tags?: string | null
          size_label?: string | null
          size_recommended?: string | null
          size_type?: string | null
          sku?: string | null
          sleeve_length?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          style?: string | null
          title?: string | null
          updated_at?: string
          upload_error?: string | null
          uploaded_at?: string | null
          user_id?: string | null
          when_made?: string | null
          who_made?: string | null
        }
        Update: {
          batch_id?: string
          batch_number?: number | null
          brand?: string | null
          category_path?: string | null
          collections_tags?: string | null
          colour_main?: string | null
          colour_secondary?: string | null
          condition?: Database["public"]["Enums"]["condition_type"] | null
          confidence?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          description_style_a?: string | null
          description_style_b?: string | null
          ebay_listing_id?: string | null
          ebay_listing_state?: string | null
          era?: Database["public"]["Enums"]["era"] | null
          etsy_listing_id?: string | null
          etsy_listing_state?: string | null
          etsy_tags?: string | null
          fit?: string | null
          flags?: Json | null
          flaws?: string | null
          garment_type?: string | null
          generated_at?: string | null
          id?: string
          is_hidden?: boolean
          listing_block?: string | null
          made_in?: string | null
          material?: string | null
          notes?: string | null
          pattern?: string | null
          pit_to_pit?: string | null
          price?: number | null
          qc_status?: Database["public"]["Enums"]["qc_status"] | null
          raw_input_text?: string | null
          run_id?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string | null
          shopify_tags?: string | null
          size_label?: string | null
          size_recommended?: string | null
          size_type?: string | null
          sku?: string | null
          sleeve_length?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          style?: string | null
          title?: string | null
          updated_at?: string
          upload_error?: string | null
          uploaded_at?: string | null
          user_id?: string | null
          when_made?: string | null
          who_made?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "autopilot_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          auto_scroll_review: boolean | null
          auto_start_recording: boolean | null
          created_at: string
          default_currency: string
          default_images_per_product: number
          ebay_connected_at: string | null
          etsy_connected_at: string | null
          etsy_shop_id: string | null
          id: string
          shopify_store_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auto_scroll_review?: boolean | null
          auto_start_recording?: boolean | null
          created_at?: string
          default_currency?: string
          default_images_per_product?: number
          ebay_connected_at?: string | null
          etsy_connected_at?: string | null
          etsy_shop_id?: string | null
          id?: string
          shopify_store_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auto_scroll_review?: boolean | null
          auto_start_recording?: boolean | null
          created_at?: string
          default_currency?: string
          default_images_per_product?: number
          ebay_connected_at?: string | null
          etsy_connected_at?: string | null
          etsy_shop_id?: string | null
          id?: string
          shopify_store_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sku_sequences: {
        Row: {
          category_code: string
          created_at: string
          id: string
          last_number: number
          updated_at: string
        }
        Insert: {
          category_code: string
          created_at?: string
          id?: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          category_code?: string
          created_at?: string
          id?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_sku: {
        Args: { p_category_code: string; p_era_code: string; p_size: string }
        Returns: string
      }
      is_email_authorized: { Args: { check_email: string }; Returns: boolean }
    }
    Enums: {
      autopilot_run_status:
        | "running"
        | "awaiting_qc"
        | "publishing"
        | "completed"
        | "failed"
      condition_type: "Excellent" | "Very good" | "Good" | "Fair"
      department: "Women" | "Men" | "Unisex" | "Kids"
      era: "80s" | "90s" | "Y2K" | "Modern"
      product_status:
        | "new"
        | "generated"
        | "ready_for_shopify"
        | "created_in_shopify"
        | "error"
      qc_status:
        | "draft"
        | "generating"
        | "ready"
        | "needs_review"
        | "blocked"
        | "approved"
        | "published"
        | "failed"
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
      autopilot_run_status: [
        "running",
        "awaiting_qc",
        "publishing",
        "completed",
        "failed",
      ],
      condition_type: ["Excellent", "Very good", "Good", "Fair"],
      department: ["Women", "Men", "Unisex", "Kids"],
      era: ["80s", "90s", "Y2K", "Modern"],
      product_status: [
        "new",
        "generated",
        "ready_for_shopify",
        "created_in_shopify",
        "error",
      ],
      qc_status: [
        "draft",
        "generating",
        "ready",
        "needs_review",
        "blocked",
        "approved",
        "published",
        "failed",
      ],
    },
  },
} as const
