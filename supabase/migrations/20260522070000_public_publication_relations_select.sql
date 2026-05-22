-- Allow public Codex analytics to read structural metadata for public vaults.
-- Existing policies already restrict rows to accessible/public vaults; this extends
-- the read side to anon so logged-out public vault pages can render relation edges
-- and tag assignments for timeline/network/tag hierarchy analytics.
ALTER POLICY "publication_relations_select"
  ON "public"."publication_relations"
  TO "anon", "authenticated";

ALTER POLICY "Users can access publication tags for accessible publications"
  ON "public"."publication_tags"
  TO "anon", "authenticated";
