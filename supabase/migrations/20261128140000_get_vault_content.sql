-- A vault's content in one round trip: the vault row, its papers, the tags they can carry (the
-- vault's own and the caller's personal ones), its shares, and the papers' tag links, relations
-- and stored PDFs.
--
-- Opening a vault used to take two dependent batches of requests, since tag links and relations
-- needed the paper ids first, and then a third batch for stored PDFs (#258). This returns the
-- same rows, filtered the same way, in one call. It runs as SECURITY INVOKER, so row-level
-- security applies exactly as it did to the client's own selects: a caller who can't read the
-- vault gets "vault": null and empty lists.
--
-- plpgsql rather than sql, for the plan cached per connection, as in get_library().

CREATE OR REPLACE FUNCTION public.get_vault_content(p_vault_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN (
  WITH vps AS (
    SELECT vp.* FROM public.vault_publications AS vp WHERE vp.vault_id = p_vault_id
  ),
  originals AS (
    SELECT DISTINCT vp.original_publication_id AS id FROM vps AS vp
    WHERE vp.original_publication_id IS NOT NULL
  ),
  paper_ids AS (
    SELECT id FROM vps UNION SELECT id FROM originals
  )
  SELECT jsonb_build_object(
    'vault', (SELECT to_jsonb(v) FROM public.vaults AS v WHERE v.id = p_vault_id),
    'vault_publications', COALESCE(
      (SELECT jsonb_agg(to_jsonb(vp) ORDER BY vp.created_at DESC, vp.id) FROM vps AS vp), '[]'::jsonb),
    -- The vault's tags first, then the caller's personal ones, each by name.
    'tags', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.vault_id IS NULL, t.name, t.id)
       FROM public.tags AS t
       WHERE t.vault_id = p_vault_id
          OR (t.user_id = (SELECT auth.uid()) AND t.vault_id IS NULL)), '[]'::jsonb),
    'vault_shares', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at, s.id)
       FROM public.vault_shares AS s
       WHERE s.vault_id = p_vault_id), '[]'::jsonb),
    'publication_tags', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.id)
       FROM public.publication_tags AS pt
       WHERE pt.vault_publication_id IN (SELECT id FROM vps)
          OR pt.publication_id IN (SELECT id FROM originals)), '[]'::jsonb),
    'publication_relations', COALESCE(
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
       FROM public.publication_relations AS r
       WHERE r.publication_id IN (SELECT id FROM paper_ids)
          OR r.related_publication_id IN (SELECT id FROM paper_ids)), '[]'::jsonb),
    -- Stored PDFs: each vault copy's own, and its canonical paper's as the fallback.
    'pdf_assets', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'publication_id', a.publication_id, 'vault_publication_id', a.vault_publication_id,
         'stored_pdf_url', a.stored_pdf_url) ORDER BY a.id)
       FROM public.publication_pdf_assets AS a
       WHERE a.storage_provider = 'google_drive' AND a.status = 'stored'
         AND (a.vault_publication_id IN (SELECT id FROM vps)
              OR (a.vault_publication_id IS NULL
                  AND a.publication_id IN (SELECT id FROM originals)))), '[]'::jsonb)
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vault_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vault_content(uuid) TO authenticated;
