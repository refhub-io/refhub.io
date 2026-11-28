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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      api_key_vaults: {
        Row: {
          api_key_id: string
          created_at: string
          vault_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          vault_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_vaults_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_vaults_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          owner_user_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          owner_user_id: string
          revoked_at?: string | null
          scopes: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          owner_user_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      api_request_audit_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          duration_ms: number | null
          id: string
          ip_address: string | null
          metadata: Json
          method: string
          owner_user_id: string | null
          path: string
          request_id: string
          response_status: number
          user_agent: string | null
          vault_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          method: string
          owner_user_id?: string | null
          path: string
          request_id: string
          response_status: number
          user_agent?: string | null
          vault_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          method?: string
          owner_user_id?: string | null
          path?: string
          request_id?: string
          response_status?: number
          user_agent?: string | null
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_audit_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_audit_logs_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          created_at: string
          duplicate_of_publication_id: string | null
          filed_publication_id: string | null
          id: string
          parsed_fields: Json
          sort_order: number
          source_ref: string
          source_type: string
          status: string
          suggested_tag_ids: string[] | null
          suggested_vault_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duplicate_of_publication_id?: string | null
          filed_publication_id?: string | null
          id?: string
          parsed_fields?: Json
          sort_order?: number
          source_ref: string
          source_type: string
          status?: string
          suggested_tag_ids?: string[] | null
          suggested_vault_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duplicate_of_publication_id?: string | null
          filed_publication_id?: string | null
          id?: string
          parsed_fields?: Json
          sort_order?: number
          source_ref?: string
          source_type?: string
          status?: string
          suggested_tag_ids?: string[] | null
          suggested_vault_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_items_duplicate_of_publication_id_fkey"
            columns: ["duplicate_of_publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_items_filed_publication_id_fkey"
            columns: ["filed_publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_items_suggested_vault_id_fkey"
            columns: ["suggested_vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      openalex_budget_state: {
        Row: {
          bucket_key: string
          spent_usd: number
          window_reset_at: string
        }
        Insert: {
          bucket_key: string
          spent_usd?: number
          window_reset_at: string
        }
        Update: {
          bucket_key?: string
          spent_usd?: number
          window_reset_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          bluesky_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          github_url: string | null
          id: string
          is_setup: boolean
          linkedin_url: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          bluesky_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          github_url?: string | null
          id?: string
          is_setup?: boolean
          linkedin_url?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          bluesky_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          github_url?: string | null
          id?: string
          is_setup?: boolean
          linkedin_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      publication_pdf_assets: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          publication_id: string | null
          source_pdf_url: string | null
          status: string
          storage_provider: string
          stored_file_id: string | null
          stored_pdf_url: string | null
          updated_at: string
          user_id: string
          vault_publication_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          publication_id?: string | null
          source_pdf_url?: string | null
          status?: string
          storage_provider?: string
          stored_file_id?: string | null
          stored_pdf_url?: string | null
          updated_at?: string
          user_id: string
          vault_publication_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          publication_id?: string | null
          source_pdf_url?: string | null
          status?: string
          storage_provider?: string
          stored_file_id?: string | null
          stored_pdf_url?: string | null
          updated_at?: string
          user_id?: string
          vault_publication_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_pdf_assets_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_pdf_assets_vault_publication_id_fkey"
            columns: ["vault_publication_id"]
            isOneToOne: false
            referencedRelation: "vault_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_relations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          publication_id: string
          related_publication_id: string
          relation_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          publication_id: string
          related_publication_id: string
          relation_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          publication_id?: string
          related_publication_id?: string
          relation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_relations_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "vault_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_relations_related_publication_id_fkey"
            columns: ["related_publication_id"]
            isOneToOne: false
            referencedRelation: "vault_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_tags: {
        Row: {
          id: string
          publication_id: string | null
          tag_id: string
          vault_publication_id: string | null
        }
        Insert: {
          id?: string
          publication_id?: string | null
          tag_id: string
          vault_publication_id?: string | null
        }
        Update: {
          id?: string
          publication_id?: string | null
          tag_id?: string
          vault_publication_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_tags_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_tags_vault_publication_id_fkey"
            columns: ["vault_publication_id"]
            isOneToOne: false
            referencedRelation: "vault_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          abstract: string | null
          authors: string[] | null
          bibtex_key: string | null
          booktitle: string | null
          chapter: string | null
          created_at: string
          doi: string | null
          edition: string | null
          editor: string[] | null
          eid: string | null
          howpublished: string | null
          id: string
          important: boolean
          institution: string | null
          isbn: string | null
          issn: string | null
          issue: string | null
          journal: string | null
          keywords: string[] | null
          notes: string | null
          number: string | null
          organization: string | null
          pages: string | null
          pdf_url: string | null
          publication_type: string | null
          publisher: string | null
          reading_state: string
          school: string | null
          series: string | null
          title: string
          type: string | null
          updated_at: string
          url: string | null
          user_id: string
          volume: string | null
          year: number | null
        }
        Insert: {
          abstract?: string | null
          authors?: string[] | null
          bibtex_key?: string | null
          booktitle?: string | null
          chapter?: string | null
          created_at?: string
          doi?: string | null
          edition?: string | null
          editor?: string[] | null
          eid?: string | null
          howpublished?: string | null
          id?: string
          important?: boolean
          institution?: string | null
          isbn?: string | null
          issn?: string | null
          issue?: string | null
          journal?: string | null
          keywords?: string[] | null
          notes?: string | null
          number?: string | null
          organization?: string | null
          pages?: string | null
          pdf_url?: string | null
          publication_type?: string | null
          publisher?: string | null
          reading_state?: string
          school?: string | null
          series?: string | null
          title: string
          type?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          volume?: string | null
          year?: number | null
        }
        Update: {
          abstract?: string | null
          authors?: string[] | null
          bibtex_key?: string | null
          booktitle?: string | null
          chapter?: string | null
          created_at?: string
          doi?: string | null
          edition?: string | null
          editor?: string[] | null
          eid?: string | null
          howpublished?: string | null
          id?: string
          important?: boolean
          institution?: string | null
          isbn?: string | null
          issn?: string | null
          issue?: string | null
          journal?: string | null
          keywords?: string[] | null
          notes?: string | null
          number?: string | null
          organization?: string | null
          pages?: string | null
          pdf_url?: string | null
          publication_type?: string | null
          publisher?: string | null
          reading_state?: string
          school?: string | null
          series?: string | null
          title?: string
          type?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          volume?: string | null
          year?: number | null
        }
        Relationships: []
      }
      semantic_scholar_rate_limit_state: {
        Row: {
          bucket_key: string
          request_count: number
          window_reset_at: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          window_reset_at: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          window_reset_at?: string
        }
        Relationships: []
      }
      smart_collections: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          filters: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          filters?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          depth: number
          id: string
          name: string
          parent_id: string | null
          user_id: string
          vault_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          depth?: number
          id?: string
          name: string
          parent_id?: string | null
          user_id: string
          vault_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          depth?: number
          id?: string
          name?: string
          parent_id?: string | null
          user_id?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      user_google_drive_links: {
        Row: {
          created_at: string
          drive_folder_id: string | null
          drive_folder_name: string | null
          drive_folder_status: string
          encrypted_refresh_token: string
          google_drive_email: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_linked_at: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_name?: string | null
          drive_folder_status?: string
          encrypted_refresh_token: string
          google_drive_email?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_linked_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_name?: string | null
          drive_folder_status?: string
          encrypted_refresh_token?: string
          google_drive_email?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_linked_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_access_requests: {
        Row: {
          created_at: string | null
          id: string
          note: string | null
          requested_role: Database["public"]["Enums"]["vault_permission"]
          requester_email: string | null
          requester_id: string
          requester_name: string | null
          status: string
          updated_at: string | null
          vault_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          note?: string | null
          requested_role?: Database["public"]["Enums"]["vault_permission"]
          requester_email?: string | null
          requester_id: string
          requester_name?: string | null
          status?: string
          updated_at?: string | null
          vault_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          note?: string | null
          requested_role?: Database["public"]["Enums"]["vault_permission"]
          requester_email?: string | null
          requester_id?: string
          requester_name?: string | null
          status?: string
          updated_at?: string | null
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_access_requests_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_favorites: {
        Row: {
          created_at: string
          id: string
          user_id: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          vault_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_favorites_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_forks: {
        Row: {
          created_at: string
          forked_by: string
          forked_vault_id: string
          id: string
          original_vault_id: string
        }
        Insert: {
          created_at?: string
          forked_by: string
          forked_vault_id: string
          id?: string
          original_vault_id: string
        }
        Update: {
          created_at?: string
          forked_by?: string
          forked_vault_id?: string
          id?: string
          original_vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_forks_forked_vault_id_fkey"
            columns: ["forked_vault_id"]
            isOneToOne: true
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_forks_original_vault_id_fkey"
            columns: ["original_vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_papers: {
        Row: {
          added_at: string
          added_by: string
          id: string
          publication_id: string
          vault_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          id?: string
          publication_id: string
          vault_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          id?: string
          publication_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_papers_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_papers_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_publications: {
        Row: {
          abstract: string | null
          authors: string[] | null
          bibtex_key: string | null
          booktitle: string | null
          chapter: string | null
          created_at: string | null
          created_by: string | null
          doi: string | null
          edition: string | null
          editor: string[] | null
          eid: string | null
          featured: boolean
          featured_note: string | null
          howpublished: string | null
          id: string
          important: boolean
          institution: string | null
          isbn: string | null
          issn: string | null
          issue: string | null
          journal: string | null
          keywords: string[] | null
          notes: string | null
          number: string | null
          organization: string | null
          original_publication_id: string | null
          pages: string | null
          pdf_url: string | null
          publication_type: string | null
          publisher: string | null
          reading_state: string
          school: string | null
          section_id: string | null
          section_position: number
          series: string | null
          title: string
          type: string | null
          updated_at: string | null
          updated_by: string | null
          url: string | null
          vault_id: string
          version: number | null
          volume: string | null
          year: number | null
        }
        Insert: {
          abstract?: string | null
          authors?: string[] | null
          bibtex_key?: string | null
          booktitle?: string | null
          chapter?: string | null
          created_at?: string | null
          created_by?: string | null
          doi?: string | null
          edition?: string | null
          editor?: string[] | null
          eid?: string | null
          featured?: boolean
          featured_note?: string | null
          howpublished?: string | null
          id?: string
          important?: boolean
          institution?: string | null
          isbn?: string | null
          issn?: string | null
          issue?: string | null
          journal?: string | null
          keywords?: string[] | null
          notes?: string | null
          number?: string | null
          organization?: string | null
          original_publication_id?: string | null
          pages?: string | null
          pdf_url?: string | null
          publication_type?: string | null
          publisher?: string | null
          reading_state?: string
          school?: string | null
          section_id?: string | null
          section_position?: number
          series?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          url?: string | null
          vault_id: string
          version?: number | null
          volume?: string | null
          year?: number | null
        }
        Update: {
          abstract?: string | null
          authors?: string[] | null
          bibtex_key?: string | null
          booktitle?: string | null
          chapter?: string | null
          created_at?: string | null
          created_by?: string | null
          doi?: string | null
          edition?: string | null
          editor?: string[] | null
          eid?: string | null
          featured?: boolean
          featured_note?: string | null
          howpublished?: string | null
          id?: string
          important?: boolean
          institution?: string | null
          isbn?: string | null
          issn?: string | null
          issue?: string | null
          journal?: string | null
          keywords?: string[] | null
          notes?: string | null
          number?: string | null
          organization?: string | null
          original_publication_id?: string | null
          pages?: string | null
          pdf_url?: string | null
          publication_type?: string | null
          publisher?: string | null
          reading_state?: string
          school?: string | null
          section_id?: string | null
          section_position?: number
          series?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          url?: string | null
          vault_id?: string
          version?: number | null
          volume?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_publications_original_publication_id_fkey"
            columns: ["original_publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_publications_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "vault_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_publications_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          updated_at: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          vault_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_sections_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_shares: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["vault_permission"]
          shared_by: string
          shared_with_email: string | null
          shared_with_name: string | null
          shared_with_user_id: string | null
          vault_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["vault_permission"]
          shared_by: string
          shared_with_email?: string | null
          shared_with_name?: string | null
          shared_with_user_id?: string | null
          vault_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["vault_permission"]
          shared_by?: string
          shared_with_email?: string | null
          shared_with_name?: string | null
          shared_with_user_id?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_shares_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_stats: {
        Row: {
          created_at: string | null
          download_count: number | null
          id: string
          updated_at: string | null
          vault_id: string
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          download_count?: number | null
          id?: string
          updated_at?: string | null
          vault_id: string
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          download_count?: number | null
          id?: string
          updated_at?: string | null
          vault_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_stats_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: true
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          abstract: string | null
          archived_at: string | null
          category: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          public_slug: string | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["vault_visibility"]
        }
        Insert: {
          abstract?: string | null
          archived_at?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          public_slug?: string | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["vault_visibility"]
        }
        Update: {
          abstract?: string | null
          archived_at?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          public_slug?: string | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["vault_visibility"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_inbox_item: {
        Args: {
          p_inbox_item_id: string
          p_tag_ids: string[]
          p_target_vault_id: string
          p_user_id: string
        }
        Returns: {
          publication_id: string
          vault_publication_id: string
        }[]
      }
      copy_publication_to_vault: {
        Args: { pub_id: string; target_vault_id: string; user_id: string }
        Returns: string
      }
      create_user_profile: {
        Args: { p_display_name: string; p_email: string; p_user_id: string }
        Returns: {
          avatar_url: string
          bio: string
          bluesky_url: string
          created_at: string
          display_name: string
          email: string
          github_url: string
          id: string
          is_setup: boolean
          linkedin_url: string
          updated_at: string
          user_id: string
          username: string
        }[]
      }
      delete_user: { Args: never; Returns: undefined }
      delete_vault: { Args: { p_vault_id: string }; Returns: undefined }
      find_profile_by_email: {
        Args: { p_email: string }
        Returns: {
          display_name: string | null
          user_id: string
          username: string | null
        }[]
      }
      get_library: { Args: Record<PropertyKey, never>; Returns: Json }
      get_researcher_stats: {
        Args: { p_user_ids: string[] }
        Returns: {
          public_vault_count: number
          publication_count: number
          user_id: string
          vault_count: number
        }[]
      }
      get_vault_metadata: {
        Args: { vault_id: string }
        Returns: {
          color: string
          created_at: string
          description: string
          id: string
          name: string
          updated_at: string
          visibility: Database["public"]["Enums"]["vault_visibility"]
        }[]
      }
      has_vault_access: {
        Args: { p_required_role: string; p_user_id: string; p_vault_id: string }
        Returns: boolean
      }
      increment_vault_downloads: {
        Args: { vault_uuid: string }
        Returns: undefined
      }
      increment_vault_views: {
        Args: { vault_uuid: string }
        Returns: undefined
      }
      take_openalex_budget: {
        Args: {
          p_bucket_key: string
          p_cost_usd: number
          p_daily_budget_usd: number
        }
        Returns: {
          allowed: boolean
          spent_usd: number
        }[]
      }
      take_semantic_scholar_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_requests: number
          p_window_ms: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      update_vault_publication_with_rollup: {
        Args: {
          p_actor_user_id: string
          p_patch: Json
          p_vault_id: string
          p_vault_publication_id: string
        }
        Returns: undefined
      }
      user_can_access_vault: {
        Args: { p_required_permission?: string; p_vault_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      vault_permission: "owner" | "editor" | "viewer"
      vault_visibility: "private" | "public" | "protected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      vault_permission: ["owner", "editor", "viewer"],
      vault_visibility: ["private", "public", "protected"],
    },
  },
} as const
