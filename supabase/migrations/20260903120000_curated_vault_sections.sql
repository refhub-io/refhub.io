-- supabase/migrations/20260903120000_curated_vault_sections.sql
--
-- Curated sections and featured papers for public vaults (#196). Lets a
-- vault owner group papers into named, ordered sections and mark
-- individual papers as featured with an optional note. Purely additive —
-- a vault with no sections is unaffected.

CREATE TABLE public.vault_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vault sections are viewable by anyone who can view the vault"
  ON public.vault_sections FOR SELECT
  USING (public.user_can_access_vault(vault_id, 'viewer'));

CREATE POLICY "Vault owners can manage their vault's sections"
  ON public.vault_sections FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vaults v
    WHERE v.id = vault_sections.vault_id AND v.user_id = (select auth.uid()) AND v.archived_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vaults v
    WHERE v.id = vault_sections.vault_id AND v.user_id = (select auth.uid()) AND v.archived_at IS NULL
  ));

CREATE OR REPLACE FUNCTION public.set_vault_sections_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER vault_sections_set_updated_at
  BEFORE UPDATE ON public.vault_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_vault_sections_updated_at();

ALTER TABLE public.vault_publications
  ADD COLUMN section_id uuid REFERENCES public.vault_sections(id) ON DELETE SET NULL,
  ADD COLUMN section_position integer NOT NULL DEFAULT 0,
  ADD COLUMN featured boolean NOT NULL DEFAULT false,
  ADD COLUMN featured_note text;

-- Column-level write restriction: Postgres RLS restricts at the row level,
-- not per-column. The existing "Users can manage vault publications in
-- editable vaults" policy already lets editors (and, per its own
-- visibility = 'public' branch, any signed-in user on a public vault)
-- UPDATE a vault_publications row -- that policy alone can't stop them
-- from also touching the four new columns. This trigger closes that gap,
-- independent of and in addition to the existing row-level policy. Same
-- technique as enforce_vault_archive_immutability (see
-- 20260901000000_vault_archive_state.sql) -- not a new pattern.
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
    SELECT user_id INTO v_owner_id FROM public.vaults WHERE id = NEW.vault_id;
    IF v_owner_id IS DISTINCT FROM (select auth.uid()) THEN
      RAISE EXCEPTION 'only the vault owner can change section/featured state';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vault_publications_section_owner_only
  BEFORE UPDATE ON public.vault_publications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vault_section_owner_only();
