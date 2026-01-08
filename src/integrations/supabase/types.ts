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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
          linkedin_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
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
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_relations_related_publication_id_fkey"
            columns: ["related_publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_tags: {
        Row: {
          id: string
          publication_id: string
          tag_id: string
        }
        Insert: {
          id?: string
          publication_id: string
          tag_id: string
        }
        Update: {
          id?: string
          publication_id?: string
          tag_id?: string
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
        ]
      }
      publications: {
        Row: {
          abstract: string | null
          authors: string[] | null
          bibtex_key: string | null
          created_at: string
          doi: string | null
          id: string
          issue: string | null
          journal: string | null
          notes: string | null
          pages: string | null
          pdf_url: string | null
          publication_type: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
          vault_id: string | null
          volume: string | null
          year: number | null
        }
        Insert: {
          abstract?: string | null
          authors?: string[] | null
          bibtex_key?: string | null
          created_at?: string
          doi?: string | null
          id?: string
          issue?: string | null
          journal?: string | null
          notes?: string | null
          pages?: string | null
          pdf_url?: string | null
          publication_type?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
          vault_id?: string | null
          volume?: string | null
          year?: number | null
        }
        Update: {
          abstract?: string | null
          authors?: string[] | null
          bibtex_key?: string | null
          created_at?: string
          doi?: string | null
          id?: string
          issue?: string | null
          journal?: string | null
          notes?: string | null
          pages?: string | null
          pdf_url?: string | null
          publication_type?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
          vault_id?: string | null
          volume?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publications_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
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
      vault_shares: {
        Row: {
          created_at: string
          id: string
          permission: string | null
          shared_by: string
          shared_with_email: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission?: string | null
          shared_by: string
          shared_with_email: string
          vault_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string | null
          shared_by?: string
          shared_with_email?: string
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
          category: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean | null
          is_shared: boolean | null
          name: string
          public_slug: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          abstract?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_shared?: boolean | null
          name: string
          public_slug?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          abstract?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_shared?: boolean | null
          name?: string
          public_slug?: string | null
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
      increment_vault_downloads: {
        Args: { vault_uuid: string }
        Returns: undefined
      }
      increment_vault_views: {
        Args: { vault_uuid: string }
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
