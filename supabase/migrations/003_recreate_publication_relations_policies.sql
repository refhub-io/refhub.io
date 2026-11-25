-- Migration 003: Clean up and recreate all RLS policies on publication_relations
--
-- This ensures the correct INSERT/SELECT/DELETE/UPDATE policies exist,
-- regardless of which version of migration 001 was previously applied.
--
-- Run this in the Supabase SQL Editor.

BEGIN;

-- ============================================================================
-- 1. Drop ALL existing policies on publication_relations (clean slate)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view publication relations in accessible publications"
  ON "public"."publication_relations";

DROP POLICY IF EXISTS "Users can view publication relations in accessible vaults"
  ON "public"."publication_relations";

DROP POLICY IF EXISTS "Users can create publication relations for accessible publications"
  ON "public"."publication_relations";

DROP POLICY IF EXISTS "Users can delete publication relations they created or have access to"
  ON "public"."publication_relations";

DROP POLICY IF EXISTS "Users can update publication relations they created"
  ON "public"."publication_relations";

-- Also drop any other policy names that might have been created
-- (in case the first migration version used different names)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'publication_relations'
      AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON "public"."publication_relations"', pol.policyname);
  END LOOP;
END $$;

-- ============================================================================
-- 2. Ensure RLS is enabled
-- ============================================================================
ALTER TABLE "public"."publication_relations" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. SELECT policy: view relations for publications in accessible vaults
-- ============================================================================
CREATE POLICY "publication_relations_select"
  ON "public"."publication_relations"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."vault_publications" "vp"
      JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
      LEFT JOIN "public"."vault_shares" "vs"
        ON "v"."id" = "vs"."vault_id"
        AND "vs"."shared_with_user_id" = "auth"."uid"()
      WHERE (
        "vp"."id" = "publication_relations"."publication_id"
        OR "vp"."id" = "publication_relations"."related_publication_id"
      )
      AND (
        "v"."user_id" = "auth"."uid"()
        OR "vs"."shared_with_user_id" IS NOT NULL
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
    )
  );

-- ============================================================================
-- 4. INSERT policy: create relations when user has editor/owner access
--    to the vault containing the source publication
-- ============================================================================
CREATE POLICY "publication_relations_insert"
  ON "public"."publication_relations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    -- The creating user must be recorded
    "created_by" = "auth"."uid"()
    AND
    -- User must have edit access to the vault that contains the source publication
    EXISTS (
      SELECT 1
      FROM "public"."vault_publications" "vp"
      JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
      LEFT JOIN "public"."vault_shares" "vs"
        ON "v"."id" = "vs"."vault_id"
        AND "vs"."shared_with_user_id" = "auth"."uid"()
      WHERE "vp"."id" = "publication_id"
      AND (
        "v"."user_id" = "auth"."uid"()
        OR (
          "vs"."shared_with_user_id" IS NOT NULL
          AND "vs"."role" IN ('editor'::"public"."vault_permission", 'owner'::"public"."vault_permission")
        )
      )
    )
  );

-- ============================================================================
-- 5. DELETE policy: creator or vault owner can delete
-- ============================================================================
CREATE POLICY "publication_relations_delete"
  ON "public"."publication_relations"
  FOR DELETE
  TO "authenticated"
  USING (
    "created_by" = "auth"."uid"()
    OR
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
-- 6. UPDATE policy: creator can update
-- ============================================================================
CREATE POLICY "publication_relations_update"
  ON "public"."publication_relations"
  FOR UPDATE
  TO "authenticated"
  USING ("created_by" = "auth"."uid"())
  WITH CHECK ("created_by" = "auth"."uid"());

COMMIT;

-- ============================================================================
-- Verify: List all policies on publication_relations
-- ============================================================================
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'publication_relations' AND schemaname = 'public';
