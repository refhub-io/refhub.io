-- Belt-and-suspenders: auto-set updated_by from auth.uid() on any UPDATE to
-- vault_publications, so application code omissions can't silently null it out.

CREATE OR REPLACE FUNCTION public.set_vault_publication_updated_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'vault_publications_set_updated_by'
      AND tgrelid = 'public.vault_publications'::regclass
  ) THEN
    CREATE TRIGGER vault_publications_set_updated_by
      BEFORE UPDATE ON public.vault_publications
      FOR EACH ROW
      EXECUTE FUNCTION public.set_vault_publication_updated_by();
  END IF;
END
$$;
