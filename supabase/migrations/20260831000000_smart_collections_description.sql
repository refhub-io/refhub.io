-- 20260831000000_smart_collections_description.sql
--
-- Adds an optional free-text description to smart_collections, so a
-- collection can carry the curator's intent (e.g. "papers I still need to
-- read for the visual storytelling survey") alongside its name and rules.

ALTER TABLE "public"."smart_collections"
  ADD COLUMN "description" text;

COMMENT ON COLUMN "public"."smart_collections"."description" IS 'Optional free-text note on what this collection is for. Purely descriptive -- never used in matching.';
