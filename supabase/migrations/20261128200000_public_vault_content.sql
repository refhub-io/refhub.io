-- The public vault page loads a vault through get_vault_content(), anonymous visitors included.
-- It used to page the papers and then fetch relations and tag links 50 ids at a time: about 300
-- requests for a 2,500-paper vault (#275).
--
-- Both functions enforce access themselves, so an anonymous caller gets exactly what anon can
-- already read with direct selects: a public vault's papers, tags, tag links and relations, and
-- nothing of a private or protected vault.
-- - get_vault_content() runs as SECURITY INVOKER, so row-level security applies.
-- - tag_links_for_papers() applies publication_tags' read policy rules. Without a signed-in user,
--   only the public-vault rule can match.
GRANT EXECUTE ON FUNCTION public.get_vault_content(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.tag_links_for_papers(uuid[], uuid[]) TO anon;
