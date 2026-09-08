-- 20260908000000_vault_sections_service_role_bypass.sql
--
-- enforce_vault_section_owner_only() (see 20260903120000_curated_vault_sections.sql)
-- checks `v_owner_id IS DISTINCT FROM (select auth.uid())` -- but the
-- refhub-netlify API backend authenticates with the Supabase service-role
-- key, which carries no user JWT, so auth.uid() is always NULL on every
-- connection it makes. That makes the check always true for the backend,
-- meaning it can never successfully set section_id/section_position/
-- featured/featured_note, even for the vault's genuine owner -- the
-- trigger unconditionally rejects, regardless of who actually called it.
--
-- This is different from how the backend already handles RLS bypass
-- elsewhere (e.g. delete_vault): RLS itself is already fully bypassed for
-- service_role by Postgres/Supabase's own design, and the backend's own
-- application-level checks (resolveVaultAccess()) are the real
-- enforcement boundary for every other write path. A trigger can't be
-- routed around the way an RLS-bypassing RPC can -- it fires on the table
-- operation itself no matter which code path performs it -- so it needs
-- its own explicit exception for the same, already-established trust
-- boundary.
--
-- Fix: skip the auth.uid() check when the connection is authenticated as
-- service_role, checked via current_user rather than "auth.uid() IS
-- NULL". current_user is a hard fact about which database role
-- authenticated the connection -- set server-side by which credential was
-- presented, not inferable or influenceable by any client -- so this
-- doesn't depend on any other policy staying restrictive; "auth.uid() IS
-- NULL" only happened to be safe today because the table's own RLS
-- policy requires TO authenticated, an entirely separate fact that could
-- change later without this trigger's safety changing with it.
--
-- No behavior change for authenticated/anon (frontend) connections --
-- they hit the exact same auth.uid() check as before. This grants the
-- backend no new capability: it already bypasses RLS entirely for every
-- table by design (see refhub-netlify's own README). It only removes an
-- accidental block on an otherwise-legitimate write path, moving
-- enforcement to where this backend already puts it everywhere else:
-- resolveVaultAccess("owner"), checked application-side before the
-- update is issued.

CREATE OR REPLACE FUNCTION public.enforce_vault_section_owner_only()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF NEW.section_id IS DISTINCT FROM OLD.section_id
    OR NEW.section_position IS DISTINCT FROM OLD.section_position
    OR NEW.featured IS DISTINCT FROM OLD.featured
    OR NEW.featured_note IS DISTINCT FROM OLD.featured_note
  THEN
    IF current_user <> 'service_role' THEN
      SELECT user_id INTO v_owner_id FROM public.vaults WHERE id = OLD.vault_id;
      IF v_owner_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'only the vault owner can change section/featured state';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
