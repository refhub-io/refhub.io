CREATE OR REPLACE FUNCTION public.enforce_forked_vaults_public()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vault_forks vf
    WHERE vf.forked_vault_id = NEW.id
  ) AND NEW.visibility <> 'public' THEN
    RAISE EXCEPTION 'forked vaults must remain public';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_forked_vaults_public ON public.vaults;

CREATE TRIGGER enforce_forked_vaults_public
BEFORE UPDATE ON public.vaults
FOR EACH ROW
EXECUTE FUNCTION public.enforce_forked_vaults_public();
