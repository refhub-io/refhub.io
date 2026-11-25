-- Migration: Fix researcher directory RLS
--
-- Problems fixed:
--   1. profiles SELECT policy was owner-only → researchers page showed only the
--      current user's own profile instead of all researchers.
--   2. vaults / publications SELECT policies are owner-only → vault_count and
--      publication_count for all other researchers were always 0.
--
-- Solution:
--   a) Add a policy that lets any authenticated user read all profiles
--      (needed for the researchers directory).
--   b) Add a SECURITY DEFINER function get_researcher_stats() that returns
--      aggregate counts only — no individual rows are exposed — so the
--      frontend can fetch stats for all researchers in one round-trip without
--      requiring broad read access to vaults/publications.

-- ─── 1. Allow authenticated users to view all profiles ───────────────────────

CREATE POLICY "Authenticated users can view set up profiles"
  ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ("is_setup" = true);

-- ─── 2. Researcher stats function (bypasses RLS safely) ──────────────────────
--
-- Returns vault_count, public_vault_count, and publication_count for each
-- user_id in the supplied array. SECURITY DEFINER means it runs with the
-- privileges of the function owner (postgres), bypassing RLS — but it only
-- returns aggregate counts, never individual rows.

CREATE OR REPLACE FUNCTION "public"."get_researcher_stats"(
  "p_user_ids" "uuid"[]
)
RETURNS TABLE (
  "user_id"           "uuid",
  "vault_count"       bigint,
  "public_vault_count" bigint,
  "publication_count" bigint
)
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.user_id,
    COUNT(DISTINCT v.id)                                              AS vault_count,
    COUNT(DISTINCT v.id) FILTER (WHERE v.visibility = 'public')      AS public_vault_count,
    COUNT(DISTINCT pub.id)                                            AS publication_count
  FROM unnest(p_user_ids) AS u(user_id)
  LEFT JOIN public.vaults       v   ON v.user_id   = u.user_id
  LEFT JOIN public.publications pub ON pub.user_id  = u.user_id
  GROUP BY u.user_id;
END;
$$;
