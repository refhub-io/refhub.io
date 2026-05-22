-- Allow public Codex analytics to read relation edges for publications in public vaults.
-- Existing policy already restricts rows to accessible/public vaults; this extends it to anon.
ALTER POLICY "publication_relations_select"
  ON "public"."publication_relations"
  TO "anon", "authenticated";
