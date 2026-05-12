CREATE OR REPLACE FUNCTION public.get_researcher_stats(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, vault_count bigint, public_vault_count bigint, publication_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH requested_users AS (
    SELECT unnest(p_user_ids) AS user_id
  ), owned_vaults AS (
    SELECT v.id, v.user_id, v.visibility
    FROM public.vaults v
    JOIN requested_users u ON u.user_id = v.user_id
  ), distinct_papers AS (
    SELECT p.user_id, p.id AS paper_id
    FROM public.publications p
    JOIN requested_users u ON u.user_id = p.user_id

    UNION

    SELECT v.user_id, COALESCE(vp.original_publication_id, vp.id) AS paper_id
    FROM owned_vaults v
    JOIN public.vault_publications vp ON vp.vault_id = v.id
  )
  SELECT
    u.user_id,
    COUNT(DISTINCT v.id)                                             AS vault_count,
    COUNT(DISTINCT v.id) FILTER (WHERE v.visibility = 'public')      AS public_vault_count,
    COUNT(DISTINCT dp.paper_id)                                      AS publication_count
  FROM requested_users u
  LEFT JOIN owned_vaults v      ON v.user_id  = u.user_id
  LEFT JOIN distinct_papers dp  ON dp.user_id = u.user_id
  GROUP BY u.user_id;
END;
$$;
