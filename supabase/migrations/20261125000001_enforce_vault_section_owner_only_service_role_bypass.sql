-- 20261125000001_enforce_vault_section_owner_only_service_role_bypass.sql
--
-- Backfills a fix that already exists on the live project but was never
-- captured in a migration file: enforce_vault_section_owner_only() (added
-- in 20260903120000_curated_vault_sections.sql) raised on any backend/admin
-- update to section_id/section_position/featured/featured_note performed as
-- service_role, because it always checked the row's vault owner against
-- auth.uid() -- which is NULL outside a user's own authenticated request.
-- Discovered while re-dumping supabase/schema.sql (issue #231): production's
-- live function body already has this guard; this migration is the version
-- control record of that change. CREATE OR REPLACE makes it a no-op against
-- production, where the fix is already live.
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
