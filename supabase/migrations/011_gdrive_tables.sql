-- Migration: Create tables for Google Drive integration
-- Must run before 20260402120000_gdrive_rls_policies.sql

-- Stores one Drive link per user (access token, folder metadata)
CREATE TABLE IF NOT EXISTS user_google_drive_links (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_drive_email       text,
  encrypted_refresh_token  text NOT NULL,
  scope                    text,
  drive_folder_id          text,
  drive_folder_name        text,
  drive_folder_status      text NOT NULL DEFAULT 'pending_creation',
  last_linked_at           timestamptz,
  last_checked_at          timestamptz,
  last_error               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_google_drive_links ENABLE ROW LEVEL SECURITY;

-- Stores per-publication PDF asset records (one row per vault_publication + provider)
CREATE TABLE IF NOT EXISTS publication_pdf_assets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_id       uuid REFERENCES publications(id) ON DELETE SET NULL,
  vault_publication_id uuid NOT NULL REFERENCES vault_publications(id) ON DELETE CASCADE,
  storage_provider     text NOT NULL DEFAULT 'google_drive',
  source_pdf_url       text,
  stored_pdf_url       text,
  stored_file_id       text,
  status               text NOT NULL DEFAULT 'pending',
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_publication_id, storage_provider)
);

ALTER TABLE publication_pdf_assets ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_google_drive_links_updated_at
  BEFORE UPDATE ON user_google_drive_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER publication_pdf_assets_updated_at
  BEFORE UPDATE ON publication_pdf_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
