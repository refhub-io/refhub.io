-- The Codex, asked of the database instead of downloaded (#275).
--
-- - Its grid counted papers, favorites and forks by downloading one row per item across every
--   public vault. Those reads stop at PostgREST's 1,000-row cap, so on a large site the counts
--   were wrong.
-- - Its topic suggestions sent every public paper's id in one URL, which the API rejects with 414
--   once there are a few hundred public papers.
-- - A topic's page downloaded every public paper and every relation in the database to match one
--   topic.
--
-- Each function runs as the caller (SECURITY INVOKER), so row-level security decides what it sees,
-- exactly as the pages' own selects did, with two exceptions that apply the same rules more
-- cheaply: tag links come through tag_links_for_papers(), and relations through
-- relations_for_papers(), below.
--
-- Topics are compared the way normalizeTopic() in src/lib/codexDiscovery.ts does: lowercase,
-- hyphens as spaces, runs of whitespace collapsed, trimmed. Where every keyword has to be
-- normalized, the expression is written out: a function with a pinned search_path can't be
-- inlined, which made that about 50 ms slower over 20,000 keywords. Matching one topic goes
-- through an index on codex_keyword_topics() instead.

-- Relations touching the given papers, without row-level security, limited by the rules of
-- publication_relations' read policy: a relation is readable when either of its papers is in a
-- vault that is the caller's, is public, or is shared with their account. The policy reaches the
-- papers through vault_publications' own policies, and for every relation that nesting re-derives
-- vault access: about 0.6 ms per relation for a signed-in user, 0.7 s for a topic with 1,200 of
-- them. Combined, the two policies come down to these three rules, which this checks once per
-- paper. Calling it with any ids returns only relations the caller could read anyway.
CREATE OR REPLACE FUNCTION public.relations_for_papers(p_publication_ids uuid[])
RETURNS SETOF public.publication_relations
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.*
  FROM public.publication_relations AS r
  WHERE (r.publication_id = ANY (p_publication_ids) OR r.related_publication_id = ANY (p_publication_ids))
    AND EXISTS (
      SELECT 1
      FROM public.vault_publications AS vp
      JOIN public.vaults AS v ON v.id = vp.vault_id
      WHERE vp.id IN (r.publication_id, r.related_publication_id)
        AND (v.user_id = (SELECT auth.uid())
             OR v.visibility = 'public'
             OR EXISTS (
               SELECT 1 FROM public.vault_shares AS s
               WHERE s.vault_id = v.id AND s.shared_with_user_id = (SELECT auth.uid()) AND s.role IS NOT NULL)));
$$;

REVOKE ALL ON FUNCTION public.relations_for_papers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relations_for_papers(uuid[]) TO anon, authenticated;

-- A paper's keywords as topics, for the index below.
CREATE OR REPLACE FUNCTION public.codex_keyword_topics(p_keywords text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT btrim(regexp_replace(replace(lower(k), '-', ' '), '\s+', ' ', 'g'))), '{}')
  FROM unnest(p_keywords) AS k;
$$;

CREATE INDEX IF NOT EXISTS idx_vault_publications_keyword_topics
  ON public.vault_publications USING gin (public.codex_keyword_topics(keywords));

-- Public papers whose keywords or notes mention a topic (already normalized). Without row-level
-- security, because under it Postgres must check the policies before any filter that isn't
-- leakproof, so it can never use the keyword index: it called codex_keyword_topics() on all
-- 10,000 public papers instead, about 240 ms. Public vaults' papers are readable by everyone, so
-- this returns nothing a direct select wouldn't.
CREATE OR REPLACE FUNCTION public.codex_public_papers_mentioning(p_topic text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT vp.id
  FROM public.vault_publications AS vp
  JOIN public.vaults AS v ON v.id = vp.vault_id
  WHERE v.visibility = 'public' AND public.codex_keyword_topics(vp.keywords) @> ARRAY[p_topic]
  UNION
  SELECT vp.id
  FROM public.vault_publications AS vp
  JOIN public.vaults AS v ON v.id = vp.vault_id
  WHERE v.visibility = 'public' AND strpos(lower(vp.notes), p_topic) > 0;
$$;

REVOKE ALL ON FUNCTION public.codex_public_papers_mentioning(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.codex_public_papers_mentioning(text) TO anon, authenticated;

-- Newest first, among public vaults: the grid's order.
CREATE INDEX IF NOT EXISTS idx_vaults_public_updated
  ON public.vaults (updated_at DESC, id DESC)
  WHERE visibility = 'public';

-- One page of the Codex grid: public vaults matching the search and category, newest first, with
-- exact counts. Pass the previous page's `next` as p_after_updated_at and p_after_id for the page
-- after it. `total` counts every match; `categories` (first page only) lists every public vault's
-- category, most recently updated first.
--
-- The search matches the name, description, abstract or category, case-insensitively, as the grid
-- did in the browser.
CREATE OR REPLACE FUNCTION public.get_codex_vaults(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 36,
  p_after_updated_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  q text := NULLIF(lower(p_search), '');
  page_size integer := LEAST(GREATEST(COALESCE(p_limit, 36), 1), 200);
  total bigint;
  page_ids uuid[];
  has_more boolean;
  last_updated_at timestamptz;
  result jsonb;
BEGIN
  WITH matched AS (
    SELECT v.id, v.updated_at
    FROM public.vaults AS v
    WHERE v.visibility = 'public'
      AND (p_category IS NULL OR v.category = p_category)
      AND (q IS NULL
           OR strpos(lower(v.name), q) > 0
           OR strpos(lower(COALESCE(v.description, '')), q) > 0
           OR strpos(lower(COALESCE(v.abstract, '')), q) > 0
           OR strpos(lower(COALESCE(v.category, '')), q) > 0)
  )
  SELECT (SELECT count(*) FROM matched),
         ARRAY(SELECT m.id FROM matched AS m
               WHERE p_after_updated_at IS NULL OR (m.updated_at, m.id) < (p_after_updated_at, p_after_id)
               ORDER BY m.updated_at DESC, m.id DESC
               LIMIT page_size + 1)
    INTO total, page_ids;

  has_more := cardinality(page_ids) > page_size;
  IF has_more THEN
    page_ids := page_ids[1:page_size];
    SELECT v.updated_at INTO last_updated_at FROM public.vaults AS v WHERE v.id = page_ids[page_size];
  END IF;

  SELECT jsonb_build_object(
    'vaults', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(v) || jsonb_build_object(
          'publication_count', COALESCE(papers.n, 0),
          'favorites_count', COALESCE(favorites.n, 0),
          'fork_count', COALESCE(forks.n, 0),
          'is_fork', EXISTS (SELECT 1 FROM public.vault_forks AS f WHERE f.forked_vault_id = v.id),
          'stats', (SELECT to_jsonb(s) FROM public.vault_stats AS s WHERE s.vault_id = v.id),
          'owner', (SELECT jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url, 'username', p.username)
                    FROM public.profiles AS p WHERE p.user_id = v.user_id))
        ORDER BY v.updated_at DESC, v.id DESC)
      FROM public.vaults AS v
      LEFT JOIN (SELECT vp.vault_id, count(*) AS n FROM public.vault_publications AS vp
                 WHERE vp.vault_id = ANY (page_ids) GROUP BY vp.vault_id) AS papers ON papers.vault_id = v.id
      LEFT JOIN (SELECT f.vault_id, count(*) AS n FROM public.vault_favorites AS f
                 WHERE f.vault_id = ANY (page_ids) GROUP BY f.vault_id) AS favorites ON favorites.vault_id = v.id
      LEFT JOIN (SELECT f.original_vault_id AS vault_id, count(*) AS n FROM public.vault_forks AS f
                 WHERE f.original_vault_id = ANY (page_ids) GROUP BY f.original_vault_id) AS forks ON forks.vault_id = v.id
      WHERE v.id = ANY (page_ids)), '[]'::jsonb),
    'total', total,
    'next', CASE WHEN has_more THEN jsonb_build_object('updated_at', last_updated_at, 'id', page_ids[page_size]) END,
    'categories', CASE WHEN p_after_updated_at IS NULL THEN COALESCE((
      SELECT jsonb_agg(c.category ORDER BY c.latest DESC, c.category)
      FROM (SELECT v.category, max(v.updated_at) AS latest
            FROM public.vaults AS v
            WHERE v.visibility = 'public' AND v.category <> ''
            GROUP BY v.category) AS c), '[]'::jsonb) END
  ) INTO result;
  RETURN result;
END;
$$;

-- Topic suggestions: the keywords and tag names on public papers, with how many papers carry
-- each, most common first. p_query keeps the topics containing it, case-insensitively.
CREATE OR REPLACE FUNCTION public.get_codex_topics(p_query text DEFAULT NULL, p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  q text := NULLIF(lower(p_query), '');
  -- The query's longest word. A topic containing the query contains it too, and so does the
  -- keyword or tag name it came from, since normalizing only changes hyphens and whitespace. Most
  -- keywords fail this cheap test, so only the rest need normalizing.
  needle text := '';
  vault_ids uuid[];
  paper_ids uuid[];
  result jsonb;
BEGIN
  IF q IS NOT NULL THEN
    needle := COALESCE((SELECT w FROM regexp_split_to_table(q, '[\s-]+') AS w ORDER BY length(w) DESC LIMIT 1), '');
  END IF;
  vault_ids := ARRAY(SELECT v.id FROM public.vaults AS v WHERE v.visibility = 'public');
  paper_ids := ARRAY(SELECT vp.id FROM public.vault_publications AS vp WHERE vp.vault_id = ANY (vault_ids));

  WITH links AS (
    SELECT pt.vault_publication_id AS paper_id, pt.tag_id FROM public.tag_links_for_papers(paper_ids, '{}') AS pt
  ),
  keyword_mentions AS (
    SELECT vp.id AS paper_id, k AS keyword
    FROM public.vault_publications AS vp, unnest(vp.keywords) AS k
    WHERE vp.id = ANY (paper_ids) AND strpos(lower(k), needle) > 0
  ),
  -- Each distinct keyword and tag name is normalized and matched once, not once per paper.
  -- MATERIALIZED keeps Postgres from pushing the query's filter below the DISTINCT, which made it
  -- normalize every mention again.
  distinct_keywords AS MATERIALIZED (
    SELECT DISTINCT km.keyword FROM keyword_mentions AS km
  ),
  keyword_topics AS (
    SELECT n.keyword, n.topic
    FROM (SELECT d.keyword, btrim(regexp_replace(replace(lower(d.keyword), '-', ' '), '\s+', ' ', 'g')) AS topic
          FROM distinct_keywords AS d) AS n
    WHERE n.topic <> '' AND (q IS NULL OR strpos(n.topic, q) > 0)
  ),
  tag_topics AS (
    SELECT n.id, n.topic
    FROM (SELECT t.id, btrim(regexp_replace(replace(lower(t.name), '-', ' '), '\s+', ' ', 'g')) AS topic
          FROM public.tags AS t
          WHERE t.id = ANY (ARRAY(SELECT DISTINCT l.tag_id FROM links AS l)) AND strpos(lower(t.name), needle) > 0) AS n
    WHERE n.topic <> '' AND (q IS NULL OR strpos(n.topic, q) > 0)
  ),
  -- Distinct (paper, topic) pairs, so counting them counts papers.
  mentions AS (
    SELECT km.paper_id, kt.topic FROM keyword_mentions AS km JOIN keyword_topics AS kt ON kt.keyword = km.keyword
    UNION
    SELECT l.paper_id, tt.topic FROM links AS l JOIN tag_topics AS tt ON tt.id = l.tag_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', c.topic, 'papers', c.papers) ORDER BY c.papers DESC, c.topic), '[]'::jsonb)
    INTO result
  FROM (
    SELECT m.topic, count(*) AS papers
    FROM mentions AS m
    GROUP BY m.topic
    ORDER BY papers DESC, m.topic
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 100)
  ) AS c;
  RETURN result;
END;
$$;

-- What a topic's page needs to match the topic itself, without the rest of the public corpus:
-- - the public papers whose keywords, tags or notes mention the topic, a superset of the page's
--   direct matches;
-- - the relations touching those papers, and the public papers at their other end, where matches
--   by citation come from;
-- - those papers' tag links and tags, their vaults, how often each vault was favorited and forked,
--   and the vault owners' names.
-- The page still decides the matches with matchPublicationsForTopic(), as before.
CREATE OR REPLACE FUNCTION public.get_codex_topic(p_topic text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  topic text := btrim(regexp_replace(replace(lower(COALESCE(p_topic, '')), '-', ' '), '\s+', ' ', 'g'));
  vault_ids uuid[];
  public_ids uuid[];
  topic_tag_ids uuid[];
  candidate_ids uuid[];
  paper_ids uuid[];
  paper_vault_ids uuid[];
  link_tag_ids uuid[];
  result jsonb;
BEGIN
  IF topic = '' THEN
    RETURN jsonb_build_object('vault_publications', '[]'::jsonb, 'vaults', '[]'::jsonb, 'publication_tags', '[]'::jsonb,
      'tags', '[]'::jsonb, 'publication_relations', '[]'::jsonb, 'popularity', '[]'::jsonb, 'owners', '[]'::jsonb);
  END IF;

  vault_ids := ARRAY(SELECT v.id FROM public.vaults AS v WHERE v.visibility = 'public');
  public_ids := ARRAY(SELECT vp.id FROM public.vault_publications AS vp WHERE vp.vault_id = ANY (vault_ids));
  topic_tag_ids := ARRAY(
    SELECT t.id FROM public.tags AS t
    WHERE btrim(regexp_replace(replace(lower(t.name), '-', ' '), '\s+', ' ', 'g')) = topic);

  -- Papers whose keywords or notes mention the topic, or that carry a tag named like it.
  candidate_ids := ARRAY(
    SELECT m.id FROM public.codex_public_papers_mentioning(topic) AS m(id)
    UNION
    SELECT pt.vault_publication_id FROM public.tag_links_for_papers(public_ids, '{}') AS pt
    WHERE pt.tag_id = ANY (topic_tag_ids));

  -- And the public papers related to them, either way round.
  paper_ids := ARRAY(
    SELECT unnest(candidate_ids)
    UNION
    SELECT vp.id
    FROM public.relations_for_papers(candidate_ids) AS r
    JOIN public.vault_publications AS vp
      ON vp.id = CASE WHEN r.publication_id = ANY (candidate_ids) THEN r.related_publication_id ELSE r.publication_id END
    WHERE vp.vault_id = ANY (vault_ids));
  paper_vault_ids := ARRAY(SELECT DISTINCT vp.vault_id FROM public.vault_publications AS vp WHERE vp.id = ANY (paper_ids));

  WITH links AS (
    SELECT pt.id, pt.vault_publication_id, pt.tag_id FROM public.tag_links_for_papers(paper_ids, '{}') AS pt
  )
  SELECT jsonb_build_object(
    -- By id, the order the page used to read the corpus in, so ties sort as before.
    'vault_publications', COALESCE((
      SELECT jsonb_agg(to_jsonb(vp) ORDER BY vp.id)
      FROM public.vault_publications AS vp WHERE vp.id = ANY (paper_ids)), '[]'::jsonb),
    'vaults', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)
      FROM public.vaults AS v WHERE v.id = ANY (paper_vault_ids)), '[]'::jsonb),
    'publication_tags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('vault_publication_id', l.vault_publication_id, 'tag_id', l.tag_id) ORDER BY l.id)
      FROM links AS l), '[]'::jsonb),
    'tags', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
      FROM public.tags AS t WHERE t.id = ANY (ARRAY(SELECT DISTINCT l.tag_id FROM links AS l))), '[]'::jsonb),
    -- Only relations with a candidate at one end and a returned paper at the other: the page
    -- ignores the rest.
    'publication_relations', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
      FROM public.relations_for_papers(candidate_ids) AS r
      WHERE r.publication_id = ANY (paper_ids) AND r.related_publication_id = ANY (paper_ids)), '[]'::jsonb),
    'popularity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'vault_id', v.id,
        'favorites', (SELECT count(*) FROM public.vault_favorites AS f WHERE f.vault_id = v.id),
        'forks', (SELECT count(*) FROM public.vault_forks AS f WHERE f.original_vault_id = v.id)) ORDER BY v.id)
      FROM public.vaults AS v WHERE v.id = ANY (paper_vault_ids)), '[]'::jsonb),
    'owners', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'username', p.username) ORDER BY p.user_id)
      FROM public.profiles AS p
      WHERE p.user_id = ANY (ARRAY(SELECT DISTINCT v.user_id FROM public.vaults AS v WHERE v.id = ANY (paper_vault_ids)))), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_codex_vaults(text, text, integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_codex_topics(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_codex_topic(text) FROM PUBLIC;
-- The Codex is open to signed-out visitors too.
GRANT EXECUTE ON FUNCTION public.get_codex_vaults(text, text, integer, timestamptz, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_codex_topics(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_codex_topic(text) TO anon, authenticated;
