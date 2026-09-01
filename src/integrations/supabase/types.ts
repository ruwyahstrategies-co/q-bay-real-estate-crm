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
      agent_whatsapp_connections: {
        Row: {
          access_token_secret_id: string | null
          connection_status: string
          created_at: string
          display_phone_number: string | null
          id: string
          last_error: string | null
          last_verified_at: string | null
          phone_number_id: string | null
          team_member_id: string
          updated_at: string
          waba_id: string | null
          webhook_verify_token_secret_id: string | null
        }
        Insert: {
          access_token_secret_id?: string | null
          connection_status?: string
          created_at?: string
          display_phone_number?: string | null
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          phone_number_id?: string | null
          team_member_id: string
          updated_at?: string
          waba_id?: string | null
          webhook_verify_token_secret_id?: string | null
        }
        Update: {
          access_token_secret_id?: string | null
          connection_status?: string
          created_at?: string
          display_phone_number?: string | null
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          phone_number_id?: string | null
          team_member_id?: string
          updated_at?: string
          waba_id?: string | null
          webhook_verify_token_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_whatsapp_connections_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_analyses: {
        Row: {
          analysis_type: string | null
          confidence: number | null
          created_at: string
          error_message: string | null
          generated_by: string | null
          id: string
          input_snapshot: Json | null
          is_outdated: boolean
          lead_id: string
          model: string | null
          organisation_id: string | null
          outdated_reason: string | null
          output_json: Json | null
          source_signature: string | null
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
          is_outdated?: boolean
          lead_id: string
          model?: string | null
          organisation_id?: string | null
          outdated_reason?: string | null
          output_json?: Json | null
          source_signature?: string | null
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
          is_outdated?: boolean
          lead_id?: string
          model?: string | null
          organisation_id?: string | null
          outdated_reason?: string | null
          output_json?: Json | null
          source_signature?: string | null
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
      areas: {
        Row: {
          about: string | null
          blurb: string | null
          country_id: string
          created_at: string
          display_order: number
          hero_image_url: string | null
          id: string
          is_active: boolean
          lifestyle: string | null
          name: string
          slug: string
          tagline: string | null
          updated_at: string
        }
        Insert: {
          about?: string | null
          blurb?: string | null
          country_id: string
          created_at?: string
          display_order?: number
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          lifestyle?: string | null
          name: string
          slug: string
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          about?: string | null
          blurb?: string | null
          country_id?: string
          created_at?: string
          display_order?: number
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          lifestyle?: string | null
          name?: string
          slug?: string
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category: string | null
          content: string | null
          created_at: string
          excerpt: string | null
          featured_image: string | null
          id: string
          is_published: boolean
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      development_media: {
        Row: {
          created_at: string
          development_id: string
          display_order: number
          id: string
          media_type: string | null
          organisation_id: string | null
          upload_id: string | null
        }
        Insert: {
          created_at?: string
          development_id: string
          display_order?: number
          id?: string
          media_type?: string | null
          organisation_id?: string | null
          upload_id?: string | null
        }
        Update: {
          created_at?: string
          development_id?: string
          display_order?: number
          id?: string
          media_type?: string | null
          organisation_id?: string | null
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "development_media_development_id_fkey"
            columns: ["development_id"]
            isOneToOne: false
            referencedRelation: "developments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_media_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_media_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      developments: {
        Row: {
          amenities: string[] | null
          area_id: string | null
          assigned_agent_id: string | null
          brochure_upload_id: string | null
          completion_status: string | null
          country_id: string | null
          created_at: string
          currency: string | null
          delivery_timeline: string | null
          description: string | null
          developer: string | null
          hero_image_url: string | null
          hero_video_url: string | null
          id: string
          is_published: boolean
          latitude: number | null
          longitude: number | null
          name: string
          organisation_id: string | null
          owner_id: string | null
          payment_plan: Json | null
          price_from: number | null
          price_to: number | null
          property_types: string[] | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string | null
          tour_360_url: string | null
          unit_mix: Json | null
          updated_at: string
        }
        Insert: {
          amenities?: string[] | null
          area_id?: string | null
          assigned_agent_id?: string | null
          brochure_upload_id?: string | null
          completion_status?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          delivery_timeline?: string | null
          description?: string | null
          developer?: string | null
          hero_image_url?: string | null
          hero_video_url?: string | null
          id?: string
          is_published?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          organisation_id?: string | null
          owner_id?: string | null
          payment_plan?: Json | null
          price_from?: number | null
          price_to?: number | null
          property_types?: string[] | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string | null
          tour_360_url?: string | null
          unit_mix?: Json | null
          updated_at?: string
        }
        Update: {
          amenities?: string[] | null
          area_id?: string | null
          assigned_agent_id?: string | null
          brochure_upload_id?: string | null
          completion_status?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          delivery_timeline?: string | null
          description?: string | null
          developer?: string | null
          hero_image_url?: string | null
          hero_video_url?: string | null
          id?: string
          is_published?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          organisation_id?: string | null
          owner_id?: string | null
          payment_plan?: Json | null
          price_from?: number | null
          price_to?: number | null
          property_types?: string[] | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string | null
          tour_360_url?: string | null
          unit_mix?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developments_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developments_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      external_market_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          price_info: Json | null
          publisher: string | null
          query: string | null
          raw: Json | null
          relevant_locations: string[]
          relevant_property_types: string[]
          retrieved_at: string
          summary: string | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          price_info?: Json | null
          publisher?: string | null
          query?: string | null
          raw?: Json | null
          relevant_locations?: string[]
          relevant_property_types?: string[]
          retrieved_at?: string
          summary?: string | null
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          price_info?: Json | null
          publisher?: string | null
          query?: string | null
          raw?: Json | null
          relevant_locations?: string[]
          relevant_property_types?: string[]
          retrieved_at?: string
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          ai_processed_at: string | null
          content: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          duration_seconds: number | null
          id: string
          interaction_date: string
          interaction_type: string
          lead_id: string | null
          metadata: Json
          organisation_id: string | null
          owner_id: string | null
          property_id: string | null
          subject: string | null
          transcript: string | null
          updated_at: string
          upload_id: string | null
        }
        Insert: {
          ai_processed_at?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          interaction_date?: string
          interaction_type: string
          lead_id?: string | null
          metadata?: Json
          organisation_id?: string | null
          owner_id?: string | null
          property_id?: string | null
          subject?: string | null
          transcript?: string | null
          updated_at?: string
          upload_id?: string | null
        }
        Update: {
          ai_processed_at?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          interaction_date?: string
          interaction_type?: string
          lead_id?: string | null
          metadata?: Json
          organisation_id?: string | null
          owner_id?: string | null
          property_id?: string | null
          subject?: string | null
          transcript?: string | null
          updated_at?: string
          upload_id?: string | null
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
            foreignKeyName: "interactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "interactions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
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
          {
            foreignKeyName: "lead_property_interests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
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
          classification: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          development_id: string | null
          email: string | null
          financing_status: string | null
          full_name: string
          id: string
          intent_score: number | null
          lead_source: string | null
          nationality: string | null
          notes: string | null
          organisation_id: string | null
          phone: string | null
          pipeline_stage: string
          preferred_area_id: string | null
          preferred_bedrooms: number[] | null
          preferred_country_id: string | null
          preferred_language: string | null
          preferred_locations: string[] | null
          preferred_property_types: string[] | null
          priority: string | null
          purchase_purpose: string | null
          status: string
          team_id: string | null
          telesales_outcome: string | null
          telesales_qualified: boolean | null
          updated_at: string
          workflow: string
        }
        Insert: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buying_timeline?: string | null
          classification?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          development_id?: string | null
          email?: string | null
          financing_status?: string | null
          full_name: string
          id?: string
          intent_score?: number | null
          lead_source?: string | null
          nationality?: string | null
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          pipeline_stage?: string
          preferred_area_id?: string | null
          preferred_bedrooms?: number[] | null
          preferred_country_id?: string | null
          preferred_language?: string | null
          preferred_locations?: string[] | null
          preferred_property_types?: string[] | null
          priority?: string | null
          purchase_purpose?: string | null
          status?: string
          team_id?: string | null
          telesales_outcome?: string | null
          telesales_qualified?: boolean | null
          updated_at?: string
          workflow?: string
        }
        Update: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buying_timeline?: string | null
          classification?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          development_id?: string | null
          email?: string | null
          financing_status?: string | null
          full_name?: string
          id?: string
          intent_score?: number | null
          lead_source?: string | null
          nationality?: string | null
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          pipeline_stage?: string
          preferred_area_id?: string | null
          preferred_bedrooms?: number[] | null
          preferred_country_id?: string | null
          preferred_language?: string | null
          preferred_locations?: string[] | null
          preferred_property_types?: string[] | null
          priority?: string | null
          purchase_purpose?: string | null
          status?: string
          team_id?: string | null
          telesales_outcome?: string | null
          telesales_qualified?: boolean | null
          updated_at?: string
          workflow?: string
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
            foreignKeyName: "leads_development_id_fkey"
            columns: ["development_id"]
            isOneToOne: false
            referencedRelation: "developments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_preferred_area_id_fkey"
            columns: ["preferred_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_preferred_country_id_fkey"
            columns: ["preferred_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_reports: {
        Row: {
          conversation_count: number
          created_at: string
          error_message: string | null
          id: string
          input_snapshot: Json | null
          label: string
          lead_count: number
          model: string | null
          output_json: Json | null
          source_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          conversation_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          input_snapshot?: Json | null
          label?: string
          lead_count?: number
          model?: string | null
          output_json?: Json | null
          source_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          conversation_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          input_snapshot?: Json | null
          label?: string
          lead_count?: number
          model?: string | null
          output_json?: Json | null
          source_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          agent_id: string | null
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          decided_at: string | null
          development_id: string | null
          expiry_date: string | null
          id: string
          lead_id: string
          notes: string | null
          offer_date: string
          organisation_id: string | null
          property_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decided_at?: string | null
          development_id?: string | null
          expiry_date?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          offer_date?: string
          organisation_id?: string | null
          property_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decided_at?: string | null
          development_id?: string | null
          expiry_date?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          offer_date?: string
          organisation_id?: string | null
          property_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_development_id_fkey"
            columns: ["development_id"]
            isOneToOne: false
            referencedRelation: "developments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
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
      owners: {
        Row: {
          address: string | null
          assigned_agent_id: string | null
          code: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          is_developer: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_agent_id?: string | null
          code?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_developer?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_agent_id?: string | null
          code?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_developer?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
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
      pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_lost: boolean
          is_won: boolean
          name: string
          organisation_id: string | null
          position: number
          stage_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name: string
          organisation_id?: string | null
          position?: number
          stage_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name?: string
          organisation_id?: string | null
          position?: number
          stage_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organisation_id_fkey"
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
          area_id: string | null
          assigned_agent_id: string | null
          assigned_team: string[] | null
          availability: string
          bathrooms: number | null
          bedrooms: number | null
          completion_status: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          developer: string | null
          development_id: string | null
          expires_at: string | null
          hero_image_url: string | null
          hero_video_url: string | null
          highlights: string[] | null
          id: string
          is_published: boolean
          last_refreshed_at: string | null
          latitude: number | null
          listing_source: string | null
          location: string | null
          longitude: number | null
          organisation_id: string | null
          owner_id: string | null
          plot_size: number | null
          price: number | null
          property_type: string | null
          purpose: string
          reference_code: string | null
          seo_description: string | null
          seo_title: string | null
          size: number | null
          size_unit: string | null
          slug: string | null
          status: string
          title: string
          tour_360_url: string | null
          updated_at: string
        }
        Insert: {
          amenities?: string[] | null
          archived_at?: string | null
          area_id?: string | null
          assigned_agent_id?: string | null
          assigned_team?: string[] | null
          availability?: string
          bathrooms?: number | null
          bedrooms?: number | null
          completion_status?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          developer?: string | null
          development_id?: string | null
          expires_at?: string | null
          hero_image_url?: string | null
          hero_video_url?: string | null
          highlights?: string[] | null
          id?: string
          is_published?: boolean
          last_refreshed_at?: string | null
          latitude?: number | null
          listing_source?: string | null
          location?: string | null
          longitude?: number | null
          organisation_id?: string | null
          owner_id?: string | null
          plot_size?: number | null
          price?: number | null
          property_type?: string | null
          purpose?: string
          reference_code?: string | null
          seo_description?: string | null
          seo_title?: string | null
          size?: number | null
          size_unit?: string | null
          slug?: string | null
          status?: string
          title: string
          tour_360_url?: string | null
          updated_at?: string
        }
        Update: {
          amenities?: string[] | null
          archived_at?: string | null
          area_id?: string | null
          assigned_agent_id?: string | null
          assigned_team?: string[] | null
          availability?: string
          bathrooms?: number | null
          bedrooms?: number | null
          completion_status?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          developer?: string | null
          development_id?: string | null
          expires_at?: string | null
          hero_image_url?: string | null
          hero_video_url?: string | null
          highlights?: string[] | null
          id?: string
          is_published?: boolean
          last_refreshed_at?: string | null
          latitude?: number | null
          listing_source?: string | null
          location?: string | null
          longitude?: number | null
          organisation_id?: string | null
          owner_id?: string | null
          plot_size?: number | null
          price?: number | null
          property_type?: string | null
          purpose?: string
          reference_code?: string | null
          seo_description?: string | null
          seo_title?: string | null
          size?: number | null
          size_unit?: string | null
          slug?: string | null
          status?: string
          title?: string
          tour_360_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_development_id_fkey"
            columns: ["development_id"]
            isOneToOne: false
            referencedRelation: "developments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      property_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          metadata: Json
          occurred_at: string
          property_id: string | null
          source: string | null
          source_ref: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          property_id?: string | null
          source?: string | null
          source_ref?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          property_id?: string | null
          source?: string | null
          source_ref?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
        ]
      }
      property_leases: {
        Row: {
          contract_upload_id: string | null
          created_at: string
          currency: string | null
          id: string
          lease_end: string | null
          lease_start: string | null
          maintenance_notes: string | null
          payment_status: string | null
          property_id: string
          rent_amount: number | null
          tenant_email: string | null
          tenant_name: string | null
          tenant_phone: string | null
          updated_at: string
        }
        Insert: {
          contract_upload_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          lease_end?: string | null
          lease_start?: string | null
          maintenance_notes?: string | null
          payment_status?: string | null
          property_id: string
          rent_amount?: number | null
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          updated_at?: string
        }
        Update: {
          contract_upload_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          lease_end?: string | null
          lease_start?: string | null
          maintenance_notes?: string | null
          payment_status?: string | null
          property_id?: string
          rent_amount?: number | null
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
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
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
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
      property_reference_counters: {
        Row: {
          last_value: number
          prefix: string
          updated_at: string
        }
        Insert: {
          last_value?: number
          prefix: string
          updated_at?: string
        }
        Update: {
          last_value?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_submissions: {
        Row: {
          area_id: string | null
          bathrooms: number | null
          bedrooms: number | null
          converted_property_id: string | null
          country_id: string | null
          created_at: string
          currency: string | null
          description: string | null
          documents: Json
          email: string | null
          full_name: string | null
          id: string
          last_refreshed_at: string | null
          location: string | null
          media: Json
          phone: string | null
          price: number | null
          property_type: string | null
          purpose: string | null
          review_notes: string | null
          reviewed_by: string | null
          size: number | null
          status: string
          submitted_at: string | null
          updated_at: string
          website_profile_id: string | null
        }
        Insert: {
          area_id?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          converted_property_id?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          documents?: Json
          email?: string | null
          full_name?: string | null
          id?: string
          last_refreshed_at?: string | null
          location?: string | null
          media?: Json
          phone?: string | null
          price?: number | null
          property_type?: string | null
          purpose?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          size?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          website_profile_id?: string | null
        }
        Update: {
          area_id?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          converted_property_id?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          documents?: Json
          email?: string | null
          full_name?: string | null
          id?: string
          last_refreshed_at?: string | null
          location?: string | null
          media?: Json
          phone?: string | null
          price?: number | null
          property_type?: string | null
          purpose?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          size?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          website_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_submissions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_submissions_converted_property_id_fkey"
            columns: ["converted_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_submissions_converted_property_id_fkey"
            columns: ["converted_property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_submissions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_submissions_website_profile_id_fkey"
            columns: ["website_profile_id"]
            isOneToOne: false
            referencedRelation: "website_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_activity_events: {
        Row: {
          event_type: string
          id: string
          lead_id: string | null
          metadata: Json
          occurred_at: string
          property_id: string | null
          team_member_id: string
          viewing_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          property_id?: string | null
          team_member_id: string
          viewing_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          property_id?: string | null
          team_member_id?: string
          viewing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_activity_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_activity_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_activity_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "staff_activity_events_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_activity_events_viewing_id_fkey"
            columns: ["viewing_id"]
            isOneToOne: false
            referencedRelation: "viewings"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_sessions: {
        Row: {
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          checked_in_at: string
          checked_out_at: string | null
          created_at: string
          id: string
          team_member_id: string
        }
        Insert: {
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          team_member_id: string
        }
        Update: {
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sessions_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
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
          marketing_report_id: string | null
          organisation_id: string | null
          owner_id: string | null
          priority: string
          property_id: string | null
          refs: Json
          source: string | null
          source_ref: string | null
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
          marketing_report_id?: string | null
          organisation_id?: string | null
          owner_id?: string | null
          priority?: string
          property_id?: string | null
          refs?: Json
          source?: string | null
          source_ref?: string | null
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
          marketing_report_id?: string | null
          organisation_id?: string | null
          owner_id?: string | null
          priority?: string
          property_id?: string | null
          refs?: Json
          source?: string | null
          source_ref?: string | null
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
            foreignKeyName: "tasks_marketing_report_id_fkey"
            columns: ["marketing_report_id"]
            isOneToOne: false
            referencedRelation: "market_intelligence_reports"
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
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
        ]
      }
      team_members: {
        Row: {
          avatar_url: string | null
          code: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          organisation_id: string | null
          permissions: Json | null
          phone: string | null
          role: string | null
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organisation_id?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organisation_id?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          leader_id: string | null
          name: string
          organisation_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          leader_id?: string | null
          name: string
          organisation_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          leader_id?: string | null
          name?: string
          organisation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          agent_id: string | null
          closed_at: string | null
          commission_value: number | null
          created_at: string
          currency: string | null
          expense: number | null
          id: string
          income: number | null
          lead_id: string | null
          notes: string | null
          organisation_id: string | null
          property_id: string | null
          status: string
          transaction_type: string
          transaction_value: number | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          closed_at?: string | null
          commission_value?: number | null
          created_at?: string
          currency?: string | null
          expense?: number | null
          id?: string
          income?: number | null
          lead_id?: string | null
          notes?: string | null
          organisation_id?: string | null
          property_id?: string | null
          status?: string
          transaction_type?: string
          transaction_value?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          closed_at?: string | null
          commission_value?: number | null
          created_at?: string
          currency?: string | null
          expense?: number | null
          id?: string
          income?: number | null
          lead_id?: string | null
          notes?: string | null
          organisation_id?: string | null
          property_id?: string | null
          status?: string
          transaction_type?: string
          transaction_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
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
          owner_id: string | null
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
          owner_id?: string | null
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
          owner_id?: string | null
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
            foreignKeyName: "uploads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
        ]
      }
      viewings: {
        Row: {
          assigned_agent_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          latitude: number | null
          lead_id: string | null
          longitude: number | null
          notes: string | null
          property_id: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          lead_id?: string | null
          longitude?: number | null
          notes?: string | null
          property_id?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          lead_id?: string | null
          longitude?: number | null
          notes?: string | null
          property_id?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viewings_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
        ]
      }
      website_enquiries: {
        Row: {
          assigned_agent_id: string | null
          created_at: string
          development_id: string | null
          email: string | null
          id: string
          lead_id: string | null
          message: string | null
          name: string
          phone: string | null
          property_id: string | null
          source_url: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          created_at?: string
          development_id?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          message?: string | null
          name: string
          phone?: string | null
          property_id?: string | null
          source_url?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          created_at?: string
          development_id?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          message?: string | null
          name?: string
          phone?: string | null
          property_id?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_enquiries_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_enquiries_development_id_fkey"
            columns: ["development_id"]
            isOneToOne: false
            referencedRelation: "developments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_enquiries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_enquiries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_enquiries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_demand_scores"
            referencedColumns: ["property_id"]
          },
        ]
      }
      website_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_webhook_routes: {
        Row: {
          created_at: string
          phone_number_id: string
          team_member_id: string
        }
        Insert: {
          created_at?: string
          phone_number_id: string
          team_member_id: string
        }
        Update: {
          created_at?: string
          phone_number_id?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_routes_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      property_demand_scores: {
        Row: {
          brochure_downloads: number | null
          closed_deals: number | null
          demand_score: number | null
          enquiries: number | null
          interested_leads: number | null
          last_event_at: string | null
          mentions: number | null
          offers: number | null
          property_id: string | null
          rejections: number | null
          shortlists: number | null
          unique_event_leads: number | null
          viewing_requests: number | null
          views: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_two_letter_code: {
        Args: { _seed: string; _table: string }
        Returns: string
      }
      check_rate_limit: {
        Args: { _key: string; _max_per_minute: number }
        Returns: boolean
      }
      current_team_id: { Args: never; Returns: string }
      current_team_member_id: { Args: never; Returns: string }
      current_team_permissions: { Args: never; Returns: Json }
      has_permission: {
        Args: { _action: string; _module: string }
        Returns: boolean
      }
      match_properties_for_lead: {
        Args: { _lead_id: string; _limit?: number }
        Returns: {
          property_id: string
          reasons: string[]
          score: number
        }[]
      }
      match_prospects_for_property: {
        Args: { _limit?: number; _property_id: string }
        Returns: {
          lead_id: string
          reasons: string[]
          score: number
        }[]
      }
      preview_property_reference: {
        Args: { _agent_id: string; _owner_id: string }
        Returns: string
      }
      public_agents: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          role: string
        }[]
      }
      public_blog_posts: {
        Args: never
        Returns: {
          author_avatar: string
          author_name: string
          category: string
          content: string
          excerpt: string
          featured_image: string
          id: string
          published_at: string
          seo_description: string
          seo_title: string
          slug: string
          title: string
        }[]
      }
      public_developments: {
        Args: never
        Returns: {
          amenities: string[]
          area_id: string
          area_name: string
          area_slug: string
          assigned_agent_avatar: string
          assigned_agent_id: string
          assigned_agent_name: string
          completion_status: string
          country_id: string
          country_name: string
          country_slug: string
          created_at: string
          currency: string
          delivery_timeline: string
          description: string
          developer: string
          has_brochure: boolean
          hero_image_url: string
          hero_video_url: string
          id: string
          latitude: number
          longitude: number
          name: string
          payment_plan: Json
          price_from: number
          price_to: number
          property_types: string[]
          seo_description: string
          seo_title: string
          slug: string
          status: string
          tour_360_url: string
          unit_mix: Json
          updated_at: string
        }[]
      }
      public_properties: {
        Args: never
        Returns: {
          amenities: string[]
          area_id: string
          area_name: string
          area_slug: string
          assigned_agent_avatar: string
          assigned_agent_id: string
          assigned_agent_name: string
          availability: string
          bathrooms: number
          bedrooms: number
          completion_status: string
          country_id: string
          country_name: string
          country_slug: string
          created_at: string
          currency: string
          description: string
          developer: string
          development_id: string
          development_name: string
          development_slug: string
          hero_image_url: string
          hero_video_url: string
          highlights: string[]
          id: string
          last_refreshed_at: string
          latitude: number
          listing_source: string
          location: string
          longitude: number
          plot_size: number
          price: number
          property_type: string
          purpose: string
          reference_code: string
          seo_description: string
          seo_title: string
          size: number
          size_unit: string
          slug: string
          title: string
          tour_360_url: string
          updated_at: string
        }[]
      }
      similar_properties: {
        Args: { _limit?: number; _property_id: string }
        Returns: {
          property_id: string
          reasons: string[]
          score: number
        }[]
      }
      vault_create_secret: {
        Args: { _name: string; _secret: string }
        Returns: string
      }
      vault_delete_secret: { Args: { _id: string }; Returns: undefined }
      vault_read_secret: { Args: { _id: string }; Returns: string }
      vault_update_secret: {
        Args: { _id: string; _secret: string }
        Returns: undefined
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
