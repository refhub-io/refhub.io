-- get_library() and get_vault_content(), rewritten so their cost follows the caller's library
-- instead of the size of the whole tables. The results are the same.
--
-- Both used filters like "x IN (SELECT ...) OR y IN (SELECT ...)". Postgres treats a subquery in
-- a filter as possibly leaky, so it can't apply it before row-level security: it read every row
-- of publication_tags, publication_relations and publications, everyone's, and checked the access
-- policies on each one before discarding nearly all of them. On a live site that's seconds per
-- call, and a library load timed out ("could not load your library") until a later retry hit a
-- warm connection.
--
-- Now each function first collects the ids involved into arrays, then filters with
-- "x = ANY (ids)". That is leakproof, so Postgres applies it through the indexes first and checks
-- the policies only on the rows it keeps. Row-level security still applies (SECURITY INVOKER),
-- with one exception, below: tag links.
--
-- publication_tags' read policy is the expensive one. For every link it re-derives access to the
-- paper's vault through nested policies on vault_publications, vaults and vault_shares, and their
-- per-row calls to user_can_access_vault(). About 0.1 ms per link: 2,000 links, a modest library,
-- took 230 ms, and before 2.3.4 the dashboard's tag link query timed out in production.
-- tag_links_for_papers() applies the same rules once per vault instead.

-- Tag links for the given papers, without row-level security, limited by the rules of
-- publication_tags' read policy:
-- - a vault paper's links, if its vault is the caller's, is shared with their account, or is
--   public;
-- - a canonical paper's links, if the paper is the caller's. The policy also reaches canonical
--   papers through vault_papers, a legacy table that's empty, so this leaves nothing out.
-- It checks those rules itself, so calling it with any ids returns only links the caller could
-- read anyway.
CREATE OR REPLACE FUNCTION public.tag_links_for_papers(p_vault_publication_ids uuid[], p_publication_ids uuid[])
RETURNS SETOF public.publication_tags
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH readable_vault_papers AS (
    SELECT vp.id
    FROM public.vault_publications AS vp
    JOIN public.vaults AS v ON v.id = vp.vault_id
    WHERE vp.id = ANY (p_vault_publication_ids)
      AND (v.user_id = (SELECT auth.uid())
           OR v.visibility = 'public'
           OR EXISTS (
             SELECT 1 FROM public.vault_shares AS s
             WHERE s.vault_id = v.id AND s.shared_with_user_id = (SELECT auth.uid()) AND s.role IS NOT NULL))
  ),
  readable_papers AS (
    SELECT p.id FROM public.publications AS p
    WHERE p.id = ANY (p_publication_ids) AND p.user_id = (SELECT auth.uid())
  )
  SELECT pt.*
  FROM public.publication_tags AS pt
  WHERE pt.vault_publication_id = ANY (ARRAY(SELECT id FROM readable_vault_papers))
     OR pt.publication_id = ANY (ARRAY(SELECT id FROM readable_papers));
$$;

REVOKE ALL ON FUNCTION public.tag_links_for_papers(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_links_for_papers(uuid[], uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_library()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  me uuid := auth.uid();
  my_email text := auth.email();
  vault_ids uuid[];
  vp_ids uuid[];
  original_ids uuid[];
  pub_ids uuid[];
  paper_ids uuid[];
  result jsonb;
BEGIN
  -- The vaults the caller owns, or that are shared with them by account or by address.
  SELECT COALESCE(array_agg(mine.id), '{}') INTO vault_ids FROM (
    SELECT v.id FROM public.vaults AS v WHERE v.user_id = me
    UNION
    SELECT s.vault_id FROM public.vault_shares AS s WHERE s.shared_with_user_id = me
    UNION
    SELECT s.vault_id FROM public.vault_shares AS s WHERE s.shared_with_email = my_email
  ) AS mine;

  SELECT COALESCE(array_agg(vp.id), '{}'),
         COALESCE(array_agg(DISTINCT vp.original_publication_id) FILTER (WHERE vp.original_publication_id IS NOT NULL), '{}')
    INTO vp_ids, original_ids
    FROM public.vault_publications AS vp
    WHERE vp.vault_id = ANY (vault_ids);

  -- The caller's own papers, and the canonical rows their vault papers point to.
  SELECT COALESCE(array_agg(readable.id), '{}') INTO pub_ids FROM (
    SELECT p.id FROM public.publications AS p WHERE p.user_id = me
    UNION
    SELECT p.id FROM public.publications AS p WHERE p.id = ANY (original_ids)
  ) AS readable;
  paper_ids := vp_ids || pub_ids;

  SELECT jsonb_build_object(
    'publications', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id)
       FROM public.publications AS p WHERE p.id = ANY (pub_ids)), '[]'::jsonb),
    'vault_publications', COALESCE(
      (SELECT jsonb_agg(to_jsonb(vp) ORDER BY vp.created_at DESC, vp.id)
       FROM public.vault_publications AS vp WHERE vp.id = ANY (vp_ids)), '[]'::jsonb),
    'publication_tags', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'id', pt.id, 'publication_id', pt.publication_id,
         'vault_publication_id', pt.vault_publication_id, 'tag_id', pt.tag_id) ORDER BY pt.id)
       FROM public.tag_links_for_papers(vp_ids, pub_ids) AS pt), '[]'::jsonb),
    'publication_relations', COALESCE(
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
       FROM public.publication_relations AS r
       WHERE r.publication_id = ANY (paper_ids) OR r.related_publication_id = ANY (paper_ids)), '[]'::jsonb),
    'pdf_assets', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'publication_id', a.publication_id, 'vault_publication_id', a.vault_publication_id,
         'stored_pdf_url', a.stored_pdf_url) ORDER BY a.id)
       FROM public.publication_pdf_assets AS a
       WHERE a.storage_provider = 'google_drive' AND a.status = 'stored'
         AND (a.vault_publication_id = ANY (vp_ids) OR a.publication_id = ANY (pub_ids))), '[]'::jsonb),
    'tags', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name, t.id)
       FROM public.tags AS t
       WHERE (t.user_id = me AND t.vault_id IS NULL) OR t.vault_id = ANY (vault_ids)), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vault_content(p_vault_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  me uuid := auth.uid();
  vp_ids uuid[];
  original_ids uuid[];
  paper_ids uuid[];
  result jsonb;
BEGIN
  SELECT COALESCE(array_agg(vp.id), '{}'),
         COALESCE(array_agg(DISTINCT vp.original_publication_id) FILTER (WHERE vp.original_publication_id IS NOT NULL), '{}')
    INTO vp_ids, original_ids
    FROM public.vault_publications AS vp
    WHERE vp.vault_id = p_vault_id;
  paper_ids := vp_ids || original_ids;

  SELECT jsonb_build_object(
    'vault', (SELECT to_jsonb(v) FROM public.vaults AS v WHERE v.id = p_vault_id),
    'vault_publications', COALESCE(
      (SELECT jsonb_agg(to_jsonb(vp) ORDER BY vp.created_at DESC, vp.id)
       FROM public.vault_publications AS vp WHERE vp.id = ANY (vp_ids)), '[]'::jsonb),
    -- The vault's tags first, then the caller's personal ones, each by name.
    'tags', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.vault_id IS NULL, t.name, t.id)
       FROM public.tags AS t
       WHERE t.vault_id = p_vault_id OR (t.user_id = me AND t.vault_id IS NULL)), '[]'::jsonb),
    'vault_shares', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at, s.id)
       FROM public.vault_shares AS s WHERE s.vault_id = p_vault_id), '[]'::jsonb),
    'publication_tags', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.id)
       FROM public.tag_links_for_papers(vp_ids, original_ids) AS pt), '[]'::jsonb),
    'publication_relations', COALESCE(
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
       FROM public.publication_relations AS r
       WHERE r.publication_id = ANY (paper_ids) OR r.related_publication_id = ANY (paper_ids)), '[]'::jsonb),
    -- Stored PDFs: each vault copy's own, and its canonical paper's as the fallback.
    'pdf_assets', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'publication_id', a.publication_id, 'vault_publication_id', a.vault_publication_id,
         'stored_pdf_url', a.stored_pdf_url) ORDER BY a.id)
       FROM public.publication_pdf_assets AS a
       WHERE a.storage_provider = 'google_drive' AND a.status = 'stored'
         AND (a.vault_publication_id = ANY (vp_ids)
              OR (a.vault_publication_id IS NULL AND a.publication_id = ANY (original_ids)))), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
