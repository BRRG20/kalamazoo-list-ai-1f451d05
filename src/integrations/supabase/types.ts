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
      products: {
        Row: {
          batch_id: string
          brand: string | null
          collections_tags: string | null
          colour_main: string | null
          colour_secondary: string | null
          condition: Database["public"]["Enums"]["condition_type"] | null
          created_at: string
          currency: string
          department: Database["public"]["Enums"]["department"] | null
          description: string | null
          description_style_a: string | null
          description_style_b: string | null
          era: Database["public"]["Enums"]["era"] | null
          etsy_tags: string | null
          fit: string | null
          flaws: string | null
          garment_type: string | null
          id: string
          listing_block: string | null
          made_in: string | null
          material: string | null
          notes: string | null
          pattern: string | null
          price: number | null
          raw_input_text: string | null
          shopify_handle: string | null
          shopify_product_id: string | null
          shopify_tags: string | null
          size_label: string | null
          size_recommended: string | null
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          batch_id: string
          brand?: string | null
          collections_tags?: string | null
          colour_main?: string | null
          colour_secondary?: string | null
          condition?: Database["public"]["Enums"]["condition_type"] | null
          created_at?: string
          currency?: string
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          description_style_a?: string | null
          description_style_b?: string | null
          era?: Database["public"]["Enums"]["era"] | null
          etsy_tags?: string | null
          fit?: string | null
          flaws?: string | null
          garment_type?: string | null
          id?: string
          listing_block?: string | null
          made_in?: string | null
          material?: string | null
          notes?: string | null
          pattern?: string | null
          price?: number | null
          raw_input_text?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string | null
          shopify_tags?: string | null
          size_label?: string | null
          size_recommended?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          batch_id?: string
          brand?: string | null
          collections_tags?: string | null
          colour_main?: string | null
          colour_secondary?: string | null
          condition?: Database["public"]["Enums"]["condition_type"] | null
          created_at?: string
          currency?: string
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          description_style_a?: string | null
          description_style_b?: string | null
          era?: Database["public"]["Enums"]["era"] | null
          etsy_tags?: string | null
          fit?: string | null
          flaws?: string | null
          garment_type?: string | null
          id?: string
          listing_block?: string | null
          made_in?: string | null
          material?: string | null
          notes?: string | null
          pattern?: string | null
          price?: number | null
          raw_input_text?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string | null
          shopify_tags?: string | null
          size_label?: string | null
          size_recommended?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          default_currency: string
          default_images_per_product: number
          id: string
          shopify_store_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          default_currency?: string
          default_images_per_product?: number
          id?: string
          shopify_store_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          default_currency?: string
          default_images_per_product?: number
          id?: string
          shopify_store_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_email_authorized: { Args: { check_email: string }; Returns: boolean }
    }
    Enums: {
      condition_type: "Excellent" | "Very good" | "Good" | "Fair"
      department: "Women" | "Men" | "Unisex" | "Kids"
      era: "80s" | "90s" | "Y2K" | "Modern"
      product_status:
        | "new"
        | "generated"
        | "ready_for_shopify"
        | "created_in_shopify"
        | "error"
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
    },
  },
} as const
