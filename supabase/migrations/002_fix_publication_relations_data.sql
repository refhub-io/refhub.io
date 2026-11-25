-- Migration 002: Fix existing publication_relations data
--
-- Migration 001 changed the FKs from publications → vault_publications,
-- but existing rows still reference publications.id values.
-- This script remaps them to vault_publications.id via original_publication_id.
--
-- Run this in the Supabase SQL Editor.

BEGIN;

-- ============================================================================
-- 1. Temporarily drop the FK constraints so we can update the data
-- ============================================================================
ALTER TABLE ONLY "public"."publication_relations"
  DROP CONSTRAINT IF EXISTS "publication_relations_publication_id_fkey";

ALTER TABLE ONLY "public"."publication_relations"
  DROP CONSTRAINT IF EXISTS "publication_relations_related_publication_id_fkey";

-- Also drop the unique constraint temporarily (data migration may cause
-- transient duplicates if two publications.id map to the same vault_publications.id)
ALTER TABLE ONLY "public"."publication_relations"
  DROP CONSTRAINT IF EXISTS "unique_relation";

-- ============================================================================
-- 2. Remap publication_id: publications.id → vault_publications.id
--    Uses original_publication_id to find the corresponding vault copy.
--    If multiple vault_publications point to the same original, pick any one
--    (DISTINCT ON ensures a single match).
-- ============================================================================
UPDATE "public"."publication_relations" pr
SET "publication_id" = sub."vp_id"
FROM (
  SELECT DISTINCT ON (vp."original_publication_id")
    vp."original_publication_id" AS "pub_id",
    vp."id" AS "vp_id"
  FROM "public"."vault_publications" vp
  WHERE vp."original_publication_id" IS NOT NULL
) sub
WHERE pr."publication_id" = sub."pub_id";

-- ============================================================================
-- 3. Remap related_publication_id the same way
-- ============================================================================
UPDATE "public"."publication_relations" pr
SET "related_publication_id" = sub."vp_id"
FROM (
  SELECT DISTINCT ON (vp."original_publication_id")
    vp."original_publication_id" AS "pub_id",
    vp."id" AS "vp_id"
  FROM "public"."vault_publications" vp
  WHERE vp."original_publication_id" IS NOT NULL
) sub
WHERE pr."related_publication_id" = sub."pub_id";

-- ============================================================================
-- 4. Delete any rows that still reference IDs not present in vault_publications
--    (orphans that couldn't be remapped — e.g. the original publication was
--     never copied into any vault, or was deleted)
-- ============================================================================
DELETE FROM "public"."publication_relations" pr
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."vault_publications" WHERE "id" = pr."publication_id"
)
OR NOT EXISTS (
  SELECT 1 FROM "public"."vault_publications" WHERE "id" = pr."related_publication_id"
);

-- ============================================================================
-- 5. Delete any rows that now violate the no-self-reference check
--    (possible if both sides mapped to the same vault_publication)
-- ============================================================================
DELETE FROM "public"."publication_relations"
WHERE "publication_id" = "related_publication_id";

-- ============================================================================
-- 6. Deduplicate: if remapping created duplicate (publication_id, related_publication_id)
--    pairs, keep only the oldest one
-- ============================================================================
DELETE FROM "public"."publication_relations" pr
WHERE pr."id" NOT IN (
  SELECT MIN("id"::text)::uuid
  FROM "public"."publication_relations"
  GROUP BY "publication_id", "related_publication_id"
);

-- ============================================================================
-- 7. Re-add the unique constraint
-- ============================================================================
ALTER TABLE ONLY "public"."publication_relations"
  ADD CONSTRAINT "unique_relation" UNIQUE ("publication_id", "related_publication_id");

-- ============================================================================
-- 8. Re-add the FK constraints pointing to vault_publications
-- ============================================================================
ALTER TABLE ONLY "public"."publication_relations"
  ADD CONSTRAINT "publication_relations_publication_id_fkey"
  FOREIGN KEY ("publication_id") REFERENCES "public"."vault_publications"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."publication_relations"
  ADD CONSTRAINT "publication_relations_related_publication_id_fkey"
  FOREIGN KEY ("related_publication_id") REFERENCES "public"."vault_publications"("id") ON DELETE CASCADE;

COMMIT;

-- ============================================================================
-- Verify: After running, check that no FK violations remain
-- ============================================================================
-- SELECT count(*) FROM "public"."publication_relations"; -- total remaining rows
-- SELECT pr.*
-- FROM "public"."publication_relations" pr
-- LEFT JOIN "public"."vault_publications" vp1 ON vp1."id" = pr."publication_id"
-- LEFT JOIN "public"."vault_publications" vp2 ON vp2."id" = pr."related_publication_id"
-- WHERE vp1."id" IS NULL OR vp2."id" IS NULL;  -- should return 0 rows
