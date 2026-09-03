-- 20260829000000_smart_collections.sql
--
-- Saved, named, cross-vault filter rule sets ("smart playlists" for papers).
-- filters stores the existing PublicationFilter[] shape from FilterBuilder.tsx
-- verbatim -- no new rule-serialization format. Owner-only, no sharing, no
-- materialized membership: matching is computed live in the frontend against
-- FilterBuilder's applyFilters(), so this table only ever stores the rules
-- themselves, never computed results.

CREATE TABLE "public"."smart_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text,
  "filters" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "public"."smart_collections" IS 'Owner-only saved filter rule sets. filters is a PublicationFilter[] (see FilterBuilder.tsx), matched live against the cross-vault publication set -- no membership is persisted here.';

ALTER TABLE "public"."smart_collections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own smart collections" ON "public"."smart_collections"
  FOR SELECT TO "authenticated" USING (auth.uid() = "user_id");

CREATE POLICY "Users can manage own smart collections" ON "public"."smart_collections"
  FOR ALL TO "authenticated" USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");
