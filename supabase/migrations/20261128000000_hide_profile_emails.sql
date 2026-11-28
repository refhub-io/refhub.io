-- Profiles are readable by every signed-in user (the researcher directory) and, for people who
-- edit public vaults, by visitors. Row-level security can't hide a column, so everyone's email
-- address was readable too, and the share dialog's user search matched on it.
--
-- Clients now get every profile column except email. A user's own address comes from their auth
-- session. A column added to profiles later isn't readable by clients until it's added here.
-- service_role (the API) keeps full access.

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, display_name, avatar_url, username, bio, github_url, linkedin_url,
              bluesky_url, is_setup, created_at, updated_at)
  ON public.profiles TO anon, authenticated;

-- Sharing a vault by email needs one lookup by address. It returns the account behind an
-- address the caller already typed, never an address, and only to signed-in users. It reads
-- auth.users, which is always current, rather than the copy in profiles.
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email text)
RETURNS TABLE (user_id uuid, display_name text, username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.user_id, p.display_name, p.username
  FROM auth.users AS u
  JOIN public.profiles AS p ON p.user_id = u.id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND lower(u.email) = lower(btrim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_profile_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_by_email(text) TO authenticated;

-- Nothing subscribes to profile changes, so the table leaves the realtime publication, which
-- shouldn't be another way to read profile rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
  END IF;
END $$;
