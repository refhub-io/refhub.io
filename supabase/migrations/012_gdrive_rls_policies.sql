-- Migration: RLS policies for Google Drive tables
-- Adds row-level security policies for user_google_drive_links and publication_pdf_assets.

-- user_google_drive_links: users can manage only their own row
CREATE POLICY "Users can select their own google drive link"
  ON user_google_drive_links
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own google drive link"
  ON user_google_drive_links
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own google drive link"
  ON user_google_drive_links
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own google drive link"
  ON user_google_drive_links
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- publication_pdf_assets: users can manage only their own rows (user_id column)
CREATE POLICY "Users can select their own publication pdf assets"
  ON publication_pdf_assets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own publication pdf assets"
  ON publication_pdf_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own publication pdf assets"
  ON publication_pdf_assets
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own publication pdf assets"
  ON publication_pdf_assets
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
