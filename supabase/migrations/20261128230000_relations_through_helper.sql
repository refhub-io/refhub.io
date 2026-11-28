-- get_library() and get_vault_content() read relations through relations_for_papers()
-- (20261128220000_codex_functions.sql) instead of under row-level security (#275). Nothing else
-- changes, and the results are the same.
--
-- publication_relations' read policy reaches the papers through vault_publications' own policies,
-- and for every relation that nesting re-derives the caller's access to the paper's vault: about
-- 0.7 ms per relation for a signed-in user. For a signed-in visitor of a 2,500-paper public vault,
-- get_vault_content() spent 0.9 s of its 1.2 s on the vault's 1,249 relations, and get_library()
-- pays the same for every relation in a library. relations_for_papers() applies the policy's rules
-- once per paper and returned the same 1,249 relations in 17 ms.
--
-- Both ends of a relation are vault papers (its foreign keys reference vault_publications), so
-- the canonical ids in paper_ids never match one, here or before.

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
       FROM public.relations_for_papers(paper_ids) AS r), '[]'::jsonb),
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
       FROM public.relations_for_papers(paper_ids) AS r), '[]'::jsonb),
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
