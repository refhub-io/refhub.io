-- Migration: Fix account creation and deletion bugs
--
-- Bug 1 (Delete): vault_publications_created_by_fkey has no ON DELETE action.
-- When delete_user() removes from auth.users, any vault_publications rows in
-- OTHER users' vaults that were created_by the deleted user cause a FK violation.
-- Fix: change the constraint to ON DELETE SET NULL.
--
-- Bug 2 (Create): "Database error saving new user" from Supabase GoTrue.
-- handle_new_user() propagates exceptions from create_user_profile() back to
-- the auth.users INSERT, causing signup to fail entirely.
-- Fix: wrap profile creation in an EXCEPTION block so trigger failures don't
-- block account creation. The profile will be lazily created on first sign-in
-- via ensureProfileExists().
-- Also ensure the on_auth_user_created trigger exists.

-- ============================================================================
-- 1. Fix vault_publications.created_by FK: NO ACTION → ON DELETE SET NULL
--    Also drop the NOT NULL constraint so SET NULL can actually fire.
-- ============================================================================
ALTER TABLE ONLY "public"."vault_publications"
  DROP CONSTRAINT IF EXISTS "vault_publications_created_by_fkey";

-- created_by was NOT NULL; relax it so ON DELETE SET NULL works
ALTER TABLE "public"."vault_publications"
  ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE ONLY "public"."vault_publications"
  ADD CONSTRAINT "vault_publications_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

-- ============================================================================
-- 2. Make handle_new_user resilient to profile-creation failures
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  BEGIN
    PERFORM create_user_profile(
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(COALESCE(NEW.email, ''), '@', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    -- Profile creation failed. Log a warning but do NOT raise — we must not
    -- block the auth.users INSERT. ensureProfileExists() will create the
    -- profile on the user's first sign-in.
    RAISE WARNING 'handle_new_user: could not create profile for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Ensure the on_auth_user_created trigger exists on auth.users
-- ============================================================================
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";

CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE PROCEDURE "public"."handle_new_user"();
