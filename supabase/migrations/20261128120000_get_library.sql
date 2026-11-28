-- A user's library in one round trip: their own papers, the papers in vaults they own or that
-- are shared with them (and the canonical rows those papers point to), plus those papers' tag
-- links, relations and stored PDFs, and the tags in scope.
--
-- The client used to select these tables unfiltered and let row-level security scope them. Since
-- everyone can read public vaults, that returned every public paper in the system, cut off at
-- PostgREST's 1,000 rows: smart collections and "all papers" showed other users' papers and lost
-- the user's own (#275). Here the scope is explicit, and RLS still applies on top (SECURITY
-- INVOKER), so the function can't return anything the caller couldn't already read.
--
-- plpgsql rather than sql: planning this query, with every table's RLS policies expanded, takes
-- about 200 ms. A SQL function plans it on every call; plpgsql caches the plan for the session,
-- and PostgREST keeps its connections open.

CREATE OR REPLACE FUNCTION public.get_library()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN (
  WITH my_vaults AS (
    SELECT v.id FROM public.vaults AS v WHERE v.user_id = (SELECT auth.uid())
    UNION
    SELECT s.vault_id FROM public.vault_shares AS s
    WHERE s.shared_with_user_id = (SELECT auth.uid())
       OR s.shared_with_email = (SELECT auth.email())
  ),
  vps AS (
    SELECT vp.* FROM public.vault_publications AS vp
    WHERE vp.vault_id IN (SELECT id FROM my_vaults)
  ),
  pubs AS (
    SELECT p.* FROM public.publications AS p
    WHERE p.user_id = (SELECT auth.uid())
       OR p.id IN (SELECT original_publication_id FROM vps WHERE original_publication_id IS NOT NULL)
  ),
  paper_ids AS (
    SELECT id FROM vps UNION SELECT id FROM pubs
  )
  SELECT jsonb_build_object(
    'publications', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id) FROM pubs AS p), '[]'::jsonb),
    'vault_publications', COALESCE(
      (SELECT jsonb_agg(to_jsonb(vp) ORDER BY vp.created_at DESC, vp.id) FROM vps AS vp), '[]'::jsonb),
    'publication_tags', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'id', pt.id, 'publication_id', pt.publication_id,
         'vault_publication_id', pt.vault_publication_id, 'tag_id', pt.tag_id) ORDER BY pt.id)
       FROM public.publication_tags AS pt
       WHERE pt.vault_publication_id IN (SELECT id FROM vps)
          OR pt.publication_id IN (SELECT id FROM pubs)), '[]'::jsonb),
    'publication_relations', COALESCE(
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
       FROM public.publication_relations AS r
       WHERE r.publication_id IN (SELECT id FROM paper_ids)
          OR r.related_publication_id IN (SELECT id FROM paper_ids)), '[]'::jsonb),
    'pdf_assets', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'publication_id', a.publication_id, 'vault_publication_id', a.vault_publication_id,
         'stored_pdf_url', a.stored_pdf_url) ORDER BY a.id)
       FROM public.publication_pdf_assets AS a
       WHERE a.storage_provider = 'google_drive' AND a.status = 'stored'
         AND (a.vault_publication_id IN (SELECT id FROM vps)
              OR a.publication_id IN (SELECT id FROM pubs))), '[]'::jsonb),
    'tags', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name, t.id)
       FROM public.tags AS t
       WHERE (t.user_id = (SELECT auth.uid()) AND t.vault_id IS NULL)
          OR t.vault_id IN (SELECT id FROM my_vaults)), '[]'::jsonb)
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_library() TO authenticated;

-- The function looks stored PDFs up by vault paper as well as by canonical paper.
CREATE INDEX IF NOT EXISTS idx_publication_pdf_assets_vault_publication_id
  ON public.publication_pdf_assets (vault_publication_id);
