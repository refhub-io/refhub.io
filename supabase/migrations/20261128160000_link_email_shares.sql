-- A vault shared with an email address now grants what a share with an account does.
--
-- Only user_can_access_vault() accepted a share matched by email. It decides who can read the
-- vault row, its sections, favorites, forks and stats. Everything else matches
-- shared_with_user_id: the policies for the vault's papers (and their notes), tags, tag links and
-- relations, has_vault_access(), and the API's own access check. A share with an email and no
-- user id opened the vault with none of its papers. The API's POST /vaults/:id/shares creates
-- shares that way, and so does sharing with an address before its owner signs up.
--
-- Rather than teach every policy about email, each such share is linked to the account behind its
-- address:
-- - when the share is created or its address changes (trigger on vault_shares);
-- - when the account signs up with that address already confirmed, or confirms it later, or
--   changes to it (triggers on auth.users);
-- - once now, for the shares that already exist.
--
-- Only confirmed addresses are linked. A share is never linked into a second share of the same
-- vault for the same account, because the access checks expect at most one.
--
-- The triggers on auth.users won't show up in a re-dumped supabase/schema.sql (`supabase db dump`
-- covers the public and graphql_public schemas only), so test/setup-local-db.sh applies this
-- file permanently, like 20261125000000_wire_handle_new_user_trigger.sql.

-- On vault_shares: fill in the account for an address, if it has one.
CREATE OR REPLACE FUNCTION public.link_vault_share_to_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.shared_with_user_id IS NULL AND NEW.shared_with_email IS NOT NULL THEN
    SELECT u.id INTO NEW.shared_with_user_id
    FROM auth.users AS u
    WHERE lower(u.email) = lower(NEW.shared_with_email)
      AND u.email_confirmed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.vault_shares AS other
        WHERE other.vault_id = NEW.vault_id
          AND other.shared_with_user_id = u.id
          AND other.id IS DISTINCT FROM NEW.id
      )
    LIMIT 1;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE TRIGGER link_vault_share_to_account
  BEFORE INSERT OR UPDATE OF shared_with_email, shared_with_user_id ON public.vault_shares
  FOR EACH ROW EXECUTE FUNCTION public.link_vault_share_to_account();

-- On auth.users: link the shares waiting for this account's address. This runs inside sign-up
-- and email confirmation, so a failure here is logged, never raised: it must not block either.
CREATE OR REPLACE FUNCTION public.link_vault_shares_for_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    UPDATE public.vault_shares AS s
    SET shared_with_user_id = NEW.id
    WHERE s.id IN (
      -- One share per vault: the strongest role, then the oldest.
      SELECT DISTINCT ON (p.vault_id) p.id
      FROM public.vault_shares AS p
      WHERE p.shared_with_user_id IS NULL
        AND lower(p.shared_with_email) = lower(NEW.email)
        AND NOT EXISTS (
          SELECT 1 FROM public.vault_shares AS other
          WHERE other.vault_id = p.vault_id AND other.shared_with_user_id = NEW.id
        )
      ORDER BY p.vault_id,
               CASE p.role WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END DESC,
               p.created_at, p.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'link_vault_shares_for_account: could not link shares for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created_link_vault_shares
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.link_vault_shares_for_account();

CREATE OR REPLACE TRIGGER on_auth_user_confirmed_link_vault_shares
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL
        AND (OLD.email IS DISTINCT FROM NEW.email OR OLD.email_confirmed_at IS NULL))
  EXECUTE FUNCTION public.link_vault_shares_for_account();

-- Trigger functions only: nobody calls these directly.
REVOKE ALL ON FUNCTION public.link_vault_share_to_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_vault_shares_for_account() FROM PUBLIC, anon, authenticated;

-- The shares that already exist: one per vault and account, the strongest role, then the oldest.
UPDATE public.vault_shares AS s
SET shared_with_user_id = m.user_id
FROM (
  SELECT DISTINCT ON (p.vault_id, u.id) p.id, u.id AS user_id
  FROM public.vault_shares AS p
  JOIN auth.users AS u
    ON lower(u.email) = lower(p.shared_with_email) AND u.email_confirmed_at IS NOT NULL
  WHERE p.shared_with_user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.vault_shares AS other
      WHERE other.vault_id = p.vault_id AND other.shared_with_user_id = u.id
    )
  ORDER BY p.vault_id, u.id,
           CASE p.role WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END DESC,
           p.created_at, p.id
) AS m
WHERE s.id = m.id;
