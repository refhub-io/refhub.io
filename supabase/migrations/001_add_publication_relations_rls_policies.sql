-- Migration: Fix publication_relations for vault_publications architecture
-- 
-- Problem 1: publication_relations FKs reference publications(id), but the app
-- uses vault_publications(id). Papers created directly in a vault only exist in
-- vault_publications and have no canonical publications row — inserts fail with FK violation.
--
-- Problem 2: publication_relations has RLS enabled but only a SELECT policy exists.
-- All INSERT/UPDATE/DELETE operations are blocked, causing "New row violates row-level
-- security policy" errors.
--
-- This migration:
--   a) Re-targets FKs from publications → vault_publications
--   b) Adds INSERT/UPDATE/DELETE RLS policies
--
-- IMPORTANT: Review these policies with your DB admin before applying.
-- Run in a maintenance window with a rollback plan.
-- If existing rows reference publications.id, migrate them first (see data migration section).

-- ============================================================================
-- 0. DATA MIGRATION (run first if you have existing rows)
-- Convert any existing publication_relations rows that reference publications.id
-- to reference the corresponding vault_publications.id instead.
-- ============================================================================
-- UPDATE "public"."publication_relations" pr
-- SET "publication_id" = vp."id"
-- FROM "public"."vault_publications" vp
-- WHERE vp."original_publication_id" = pr."publication_id";
--
-- UPDATE "public"."publication_relations" pr
-- SET "related_publication_id" = vp."id"
-- FROM "public"."vault_publications" vp
-- WHERE vp."original_publication_id" = pr."related_publication_id";
--
-- Then delete any orphaned rows that couldn't be mapped:
-- DELETE FROM "public"."publication_relations" pr
-- WHERE NOT EXISTS (SELECT 1 FROM "public"."vault_publications" WHERE "id" = pr."publication_id")
--    OR NOT EXISTS (SELECT 1 FROM "public"."vault_publications" WHERE "id" = pr."related_publication_id");

-- ============================================================================
-- 1. Drop old FK constraints (reference publications)
-- ============================================================================
ALTER TABLE ONLY "public"."publication_relations"
  DROP CONSTRAINT IF EXISTS "publication_relations_publication_id_fkey";

ALTER TABLE ONLY "public"."publication_relations"
  DROP CONSTRAINT IF EXISTS "publication_relations_related_publication_id_fkey";

-- ============================================================================
-- 2. Add new FK constraints (reference vault_publications)
-- ============================================================================
ALTER TABLE ONLY "public"."publication_relations"
  ADD CONSTRAINT "publication_relations_publication_id_fkey"
  FOREIGN KEY ("publication_id") REFERENCES "public"."vault_publications"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."publication_relations"
  ADD CONSTRAINT "publication_relations_related_publication_id_fkey"
  FOREIGN KEY ("related_publication_id") REFERENCES "public"."vault_publications"("id") ON DELETE CASCADE;

-- ============================================================================
-- 3. INSERT policy: Allow authenticated users to create relations when they
--    have editor/owner access to the vault containing the source publication
-- ============================================================================
CREATE POLICY "Users can create publication relations for accessible publications"
  ON "public"."publication_relations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    -- The creating user must be recorded in created_by
    "created_by" = "auth"."uid"()
    AND
    -- User must have edit access to the vault containing the source publication
    EXISTS (
      SELECT 1
      FROM "public"."vault_publications" "vp"
      JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
      LEFT JOIN "public"."vault_shares" "vs"
        ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = "auth"."uid"()
      WHERE "vp"."id" = "publication_relations"."publication_id"
      AND (
        "v"."user_id" = "auth"."uid"()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IN ('editor', 'owner'))
      )
    )
  );

-- ============================================================================
-- 4. SELECT policy: Allow users to view relations for publications in
--    vaults they can access (owner, shared, or public)
-- ============================================================================
-- Drop the old SELECT policy first
DROP POLICY IF EXISTS "Users can view publication relations in accessible publications"
  ON "public"."publication_relations";

CREATE POLICY "Users can view publication relations in accessible vaults"
  ON "public"."publication_relations"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."vault_publications" "vp"
      JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
      LEFT JOIN "public"."vault_shares" "vs"
        ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = "auth"."uid"()
      WHERE (
        "vp"."id" = "publication_relations"."publication_id"
        OR "vp"."id" = "publication_relations"."related_publication_id"
      )
      AND (
        "v"."user_id" = "auth"."uid"()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL)
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
    )
  );

-- ============================================================================
-- 5. DELETE policy: Allow users to delete relations they created, or where
--    they own the vault containing either publication
-- ============================================================================
CREATE POLICY "Users can delete publication relations they created or have access to"
  ON "public"."publication_relations"
  FOR DELETE
  TO "authenticated"
  USING (
    -- Creator can always delete their own relations
    "created_by" = "auth"."uid"()
    OR
    -- Vault owner can delete any relation involving their vault's publications
    EXISTS (
      SELECT 1
      FROM "public"."vault_publications" "vp"
      JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
      WHERE (
        "vp"."id" = "publication_relations"."publication_id"
        OR "vp"."id" = "publication_relations"."related_publication_id"
      )
      AND "v"."user_id" = "auth"."uid"()
    )
  );

-- ============================================================================
-- 6. UPDATE policy: Allow users to update relations they created
-- ============================================================================
CREATE POLICY "Users can update publication relations they created"
  ON "public"."publication_relations"
  FOR UPDATE
  TO "authenticated"
  USING ("created_by" = "auth"."uid"())
  WITH CHECK ("created_by" = "auth"."uid"());


-- ============================================================================
-- Rollback script (keep for maintenance window):
-- ============================================================================
-- -- Restore original FKs
-- ALTER TABLE ONLY "public"."publication_relations"
--   DROP CONSTRAINT IF EXISTS "publication_relations_publication_id_fkey";
-- ALTER TABLE ONLY "public"."publication_relations"
--   DROP CONSTRAINT IF EXISTS "publication_relations_related_publication_id_fkey";
-- ALTER TABLE ONLY "public"."publication_relations"
--   ADD CONSTRAINT "publication_relations_publication_id_fkey"
--   FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE CASCADE;
-- ALTER TABLE ONLY "public"."publication_relations"
--   ADD CONSTRAINT "publication_relations_related_publication_id_fkey"
--   FOREIGN KEY ("related_publication_id") REFERENCES "public"."publications"("id") ON DELETE CASCADE;
--
-- -- Drop new policies
-- DROP POLICY IF EXISTS "Users can create publication relations for accessible publications" ON "public"."publication_relations";
-- DROP POLICY IF EXISTS "Users can view publication relations in accessible vaults" ON "public"."publication_relations";
-- DROP POLICY IF EXISTS "Users can delete publication relations they created or have access to" ON "public"."publication_relations";
-- DROP POLICY IF EXISTS "Users can update publication relations they created" ON "public"."publication_relations";
--
-- -- Recreate original SELECT policy
-- CREATE POLICY "Users can view publication relations in accessible publications" ON "public"."publication_relations" FOR SELECT TO "authenticated" USING (...original policy from schema.sql...);
