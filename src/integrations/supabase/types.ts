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
      ai_analyses: {
        Row: {
          analysis_type: string | null
          confidence: number | null
          created_at: string
          error_message: string | null
          generated_by: string | null
          id: string
          input_snapshot: Json | null
          lead_id: string
          model: string | null
          organisation_id: string | null
          output_json: Json | null
          source_updated_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          analysis_type?: string | null
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          generated_by?: string | null
          id?: string
          input_snapshot?: Json | null
          lead_id: string
          model?: string | null
          organisation_id?: string | null
          output_json?: Json | null
          source_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_type?: string | null
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          generated_by?: string | null
          id?: string
          input_snapshot?: Json | null
          lead_id?: string
          model?: string | null
          organisation_id?: string | null
          output_json?: Json | null
          source_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analyses_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          organisation_id: string | null
          setting_key: string
          setting_value: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id?: string | null
          setting_key: string
          setting_value?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string | null
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          duration_seconds: number | null
          id: string
          interaction_date: string
          interaction_type: string
          lead_id: string | null
          organisation_id: string | null
          property_id: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          interaction_date?: string
          interaction_type: string
          lead_id?: string | null
          organisation_id?: string | null
          property_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          interaction_date?: string
          interaction_type?: string
          lead_id?: string | null
          organisation_id?: string | null
          property_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_property_interests: {
        Row: {
          created_at: string
          id: string
          interest_level: string | null
          lead_id: string
          notes: string | null
          organisation_id: string | null
          property_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interest_level?: string | null
          lead_id: string
          notes?: string | null
          organisation_id?: string | null
          property_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interest_level?: string | null
          lead_id?: string
          notes?: string | null
          organisation_id?: string | null
          property_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_property_interests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          assigned_agent_id: string | null
          budget_max: number | null
          budget_min: number | null
          buying_timeline: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          email: string | null
          financing_status: string | null
          full_name: string
          id: string
          lead_source: string | null
          nationality: string | null
          notes: string | null
          organisation_id: string | null
          phone: string | null
          pipeline_stage: string
          preferred_bedrooms: number[] | null
          preferred_language: string | null
          preferred_locations: string[] | null
          preferred_property_types: string[] | null
          purchase_purpose: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buying_timeline?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          email?: string | null
          financing_status?: string | null
          full_name: string
          id?: string
          lead_source?: string | null
          nationality?: string | null
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          pipeline_stage?: string
          preferred_bedrooms?: number[] | null
          preferred_language?: string | null
          preferred_locations?: string[] | null
          preferred_property_types?: string[] | null
          purchase_purpose?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buying_timeline?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          email?: string | null
          financing_status?: string | null
          full_name?: string
          id?: string
          lead_source?: string | null
          nationality?: string | null
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          pipeline_stage?: string
          preferred_bedrooms?: number[] | null
          preferred_language?: string | null
          preferred_locations?: string[] | null
          preferred_property_types?: string[] | null
          purchase_purpose?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          default_currency: string | null
          id: string
          logo_url: string | null
          name: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string | null
          id?: string
          logo_url?: string | null
          name?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string | null
          id?: string
          logo_url?: string | null
          name?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          lead_id: string
          new_stage: string
          organisation_id: string | null
          previous_stage: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          lead_id: string
          new_stage: string
          organisation_id?: string | null
          previous_stage?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          lead_id?: string
          new_stage?: string
          organisation_id?: string | null
          previous_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_history_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          amenities: string[] | null
          archived_at: string | null
          assigned_team: string[] | null
          availability: string
          bathrooms: number | null
          bedrooms: number | null
          completion_status: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          developer: string | null
          id: string
          location: string | null
          organisation_id: string | null
          price: number | null
          property_type: string | null
          reference_code: string | null
          size: number | null
          size_unit: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amenities?: string[] | null
          archived_at?: string | null
          assigned_team?: string[] | null
          availability?: string
          bathrooms?: number | null
          bedrooms?: number | null
          completion_status?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          developer?: string | null
          id?: string
          location?: string | null
          organisation_id?: string | null
          price?: number | null
          property_type?: string | null
          reference_code?: string | null
          size?: number | null
          size_unit?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amenities?: string[] | null
          archived_at?: string | null
          assigned_team?: string[] | null
          availability?: string
          bathrooms?: number | null
          bedrooms?: number | null
          completion_status?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          developer?: string | null
          id?: string
          location?: string | null
          organisation_id?: string | null
          price?: number | null
          property_type?: string | null
          reference_code?: string | null
          size?: number | null
          size_unit?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media: {
        Row: {
          created_at: string
          display_order: number
          id: string
          media_type: string | null
          organisation_id: string | null
          property_id: string
          upload_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          media_type?: string | null
          organisation_id?: string | null
          property_id: string
          upload_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          media_type?: string | null
          organisation_id?: string | null
          property_id?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_media_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          organisation_id: string | null
          priority: string
          property_id: string | null
          status: string
          task_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          organisation_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          task_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          organisation_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          task_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          organisation_id: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          category: string
          created_at: string
          extracted_text: string | null
          file_size: number | null
          filename: string
          id: string
          lead_id: string | null
          metadata: Json
          mime_type: string | null
          organisation_id: string | null
          processing_error: string | null
          processing_status: string
          property_id: string | null
          public_url: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          extracted_text?: string | null
          file_size?: number | null
          filename: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          mime_type?: string | null
          organisation_id?: string | null
          processing_error?: string | null
          processing_status?: string
          property_id?: string | null
          public_url?: string | null
          storage_bucket: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          extracted_text?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          mime_type?: string | null
          organisation_id?: string | null
          processing_error?: string | null
          processing_status?: string
          property_id?: string | null
          public_url?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
