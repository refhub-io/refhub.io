-- 20260706000000_publication_bibliographic_rollup.sql
--
-- Rolls up bibliographic-field edits from one vault_publications copy to the
-- canonical publications row and every sibling vault_publications copy
-- (same original_publication_id, different vault), atomically. Parameters
-- are p_-prefixed to avoid the ambiguous-column-reference bug fixed in
-- migration 006 (a bare `vault_id = vault_id` inside a function body is
-- parsed as comparing the column to itself, not to the parameter, if the
-- parameter shares the column's name).
--
-- notes is intentionally never part of the bibliographic field list below —
-- it's vault-local and, like tag_ids, must never propagate.

CREATE OR REPLACE FUNCTION "public"."update_vault_publication_with_rollup"(
    "p_vault_publication_id" "uuid",
    "p_vault_id" "uuid",
    "p_patch" "jsonb",
    "p_actor_user_id" "uuid"
) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_original_id uuid;
    v_has_bibliographic_patch boolean;
BEGIN
    -- This function is only ever called under the service-role key (see
    -- .netlify's handleUpdateItem), which has no JWT context of its own, so
    -- auth.uid() would otherwise resolve to NULL for the rest of this
    -- transaction. vault_publications' own "set updated_by from auth.uid()"
    -- BEFORE UPDATE trigger fires on every UPDATE below regardless -- setting
    -- this makes it record the real actor instead of overwriting every touched
    -- row's updated_by with NULL.
    PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

    UPDATE vault_publications SET
        title = CASE WHEN p_patch ? 'title' THEN p_patch->>'title' ELSE title END,
        authors = CASE WHEN p_patch ? 'authors' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'authors')) ELSE authors END,
        year = CASE WHEN p_patch ? 'year' THEN (p_patch->>'year')::integer ELSE year END,
        journal = CASE WHEN p_patch ? 'journal' THEN p_patch->>'journal' ELSE journal END,
        volume = CASE WHEN p_patch ? 'volume' THEN p_patch->>'volume' ELSE volume END,
        issue = CASE WHEN p_patch ? 'issue' THEN p_patch->>'issue' ELSE issue END,
        pages = CASE WHEN p_patch ? 'pages' THEN p_patch->>'pages' ELSE pages END,
        doi = CASE WHEN p_patch ? 'doi' THEN p_patch->>'doi' ELSE doi END,
        url = CASE WHEN p_patch ? 'url' THEN p_patch->>'url' ELSE url END,
        abstract = CASE WHEN p_patch ? 'abstract' THEN p_patch->>'abstract' ELSE abstract END,
        pdf_url = CASE WHEN p_patch ? 'pdf_url' THEN p_patch->>'pdf_url' ELSE pdf_url END,
        bibtex_key = CASE WHEN p_patch ? 'bibtex_key' THEN p_patch->>'bibtex_key' ELSE bibtex_key END,
        publication_type = CASE WHEN p_patch ? 'publication_type' THEN p_patch->>'publication_type' ELSE publication_type END,
        notes = CASE WHEN p_patch ? 'notes' THEN p_patch->>'notes' ELSE notes END,
        booktitle = CASE WHEN p_patch ? 'booktitle' THEN p_patch->>'booktitle' ELSE booktitle END,
        chapter = CASE WHEN p_patch ? 'chapter' THEN p_patch->>'chapter' ELSE chapter END,
        edition = CASE WHEN p_patch ? 'edition' THEN p_patch->>'edition' ELSE edition END,
        editor = CASE WHEN p_patch ? 'editor' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'editor')) ELSE editor END,
        howpublished = CASE WHEN p_patch ? 'howpublished' THEN p_patch->>'howpublished' ELSE howpublished END,
        institution = CASE WHEN p_patch ? 'institution' THEN p_patch->>'institution' ELSE institution END,
        number = CASE WHEN p_patch ? 'number' THEN p_patch->>'number' ELSE number END,
        organization = CASE WHEN p_patch ? 'organization' THEN p_patch->>'organization' ELSE organization END,
        publisher = CASE WHEN p_patch ? 'publisher' THEN p_patch->>'publisher' ELSE publisher END,
        school = CASE WHEN p_patch ? 'school' THEN p_patch->>'school' ELSE school END,
        series = CASE WHEN p_patch ? 'series' THEN p_patch->>'series' ELSE series END,
        type = CASE WHEN p_patch ? 'type' THEN p_patch->>'type' ELSE type END,
        eid = CASE WHEN p_patch ? 'eid' THEN p_patch->>'eid' ELSE eid END,
        isbn = CASE WHEN p_patch ? 'isbn' THEN p_patch->>'isbn' ELSE isbn END,
        issn = CASE WHEN p_patch ? 'issn' THEN p_patch->>'issn' ELSE issn END,
        keywords = CASE WHEN p_patch ? 'keywords' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'keywords')) ELSE keywords END,
        version = version + 1,
        updated_at = now()
    WHERE id = p_vault_publication_id AND vault_id = p_vault_id
    RETURNING original_publication_id INTO v_original_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'vault publication % not found in vault %', p_vault_publication_id, p_vault_id
            USING ERRCODE = 'P0002';
    END IF;

    v_has_bibliographic_patch := p_patch ?| ARRAY[
        'title', 'authors', 'year', 'journal', 'volume', 'issue', 'pages', 'doi', 'url',
        'abstract', 'pdf_url', 'bibtex_key', 'publication_type', 'booktitle', 'chapter',
        'edition', 'editor', 'howpublished', 'institution', 'number', 'organization',
        'publisher', 'school', 'series', 'type', 'eid', 'isbn', 'issn', 'keywords'
    ];

    IF v_original_id IS NOT NULL AND v_has_bibliographic_patch THEN
        UPDATE publications SET
            title = CASE WHEN p_patch ? 'title' THEN p_patch->>'title' ELSE title END,
            authors = CASE WHEN p_patch ? 'authors' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'authors')) ELSE authors END,
            year = CASE WHEN p_patch ? 'year' THEN (p_patch->>'year')::integer ELSE year END,
            journal = CASE WHEN p_patch ? 'journal' THEN p_patch->>'journal' ELSE journal END,
            volume = CASE WHEN p_patch ? 'volume' THEN p_patch->>'volume' ELSE volume END,
            issue = CASE WHEN p_patch ? 'issue' THEN p_patch->>'issue' ELSE issue END,
            pages = CASE WHEN p_patch ? 'pages' THEN p_patch->>'pages' ELSE pages END,
            doi = CASE WHEN p_patch ? 'doi' THEN p_patch->>'doi' ELSE doi END,
            url = CASE WHEN p_patch ? 'url' THEN p_patch->>'url' ELSE url END,
            abstract = CASE WHEN p_patch ? 'abstract' THEN p_patch->>'abstract' ELSE abstract END,
            pdf_url = CASE WHEN p_patch ? 'pdf_url' THEN p_patch->>'pdf_url' ELSE pdf_url END,
            bibtex_key = CASE WHEN p_patch ? 'bibtex_key' THEN p_patch->>'bibtex_key' ELSE bibtex_key END,
            publication_type = CASE WHEN p_patch ? 'publication_type' THEN p_patch->>'publication_type' ELSE publication_type END,
            booktitle = CASE WHEN p_patch ? 'booktitle' THEN p_patch->>'booktitle' ELSE booktitle END,
            chapter = CASE WHEN p_patch ? 'chapter' THEN p_patch->>'chapter' ELSE chapter END,
            edition = CASE WHEN p_patch ? 'edition' THEN p_patch->>'edition' ELSE edition END,
            editor = CASE WHEN p_patch ? 'editor' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'editor')) ELSE editor END,
            howpublished = CASE WHEN p_patch ? 'howpublished' THEN p_patch->>'howpublished' ELSE howpublished END,
            institution = CASE WHEN p_patch ? 'institution' THEN p_patch->>'institution' ELSE institution END,
            number = CASE WHEN p_patch ? 'number' THEN p_patch->>'number' ELSE number END,
            organization = CASE WHEN p_patch ? 'organization' THEN p_patch->>'organization' ELSE organization END,
            publisher = CASE WHEN p_patch ? 'publisher' THEN p_patch->>'publisher' ELSE publisher END,
            school = CASE WHEN p_patch ? 'school' THEN p_patch->>'school' ELSE school END,
            series = CASE WHEN p_patch ? 'series' THEN p_patch->>'series' ELSE series END,
            type = CASE WHEN p_patch ? 'type' THEN p_patch->>'type' ELSE type END,
            eid = CASE WHEN p_patch ? 'eid' THEN p_patch->>'eid' ELSE eid END,
            isbn = CASE WHEN p_patch ? 'isbn' THEN p_patch->>'isbn' ELSE isbn END,
            issn = CASE WHEN p_patch ? 'issn' THEN p_patch->>'issn' ELSE issn END,
            keywords = CASE WHEN p_patch ? 'keywords' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'keywords')) ELSE keywords END,
            updated_at = now()
        WHERE id = v_original_id;

        UPDATE vault_publications SET
            title = CASE WHEN p_patch ? 'title' THEN p_patch->>'title' ELSE title END,
            authors = CASE WHEN p_patch ? 'authors' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'authors')) ELSE authors END,
            year = CASE WHEN p_patch ? 'year' THEN (p_patch->>'year')::integer ELSE year END,
            journal = CASE WHEN p_patch ? 'journal' THEN p_patch->>'journal' ELSE journal END,
            volume = CASE WHEN p_patch ? 'volume' THEN p_patch->>'volume' ELSE volume END,
            issue = CASE WHEN p_patch ? 'issue' THEN p_patch->>'issue' ELSE issue END,
            pages = CASE WHEN p_patch ? 'pages' THEN p_patch->>'pages' ELSE pages END,
            doi = CASE WHEN p_patch ? 'doi' THEN p_patch->>'doi' ELSE doi END,
            url = CASE WHEN p_patch ? 'url' THEN p_patch->>'url' ELSE url END,
            abstract = CASE WHEN p_patch ? 'abstract' THEN p_patch->>'abstract' ELSE abstract END,
            pdf_url = CASE WHEN p_patch ? 'pdf_url' THEN p_patch->>'pdf_url' ELSE pdf_url END,
            bibtex_key = CASE WHEN p_patch ? 'bibtex_key' THEN p_patch->>'bibtex_key' ELSE bibtex_key END,
            publication_type = CASE WHEN p_patch ? 'publication_type' THEN p_patch->>'publication_type' ELSE publication_type END,
            booktitle = CASE WHEN p_patch ? 'booktitle' THEN p_patch->>'booktitle' ELSE booktitle END,
            chapter = CASE WHEN p_patch ? 'chapter' THEN p_patch->>'chapter' ELSE chapter END,
            edition = CASE WHEN p_patch ? 'edition' THEN p_patch->>'edition' ELSE edition END,
            editor = CASE WHEN p_patch ? 'editor' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'editor')) ELSE editor END,
            howpublished = CASE WHEN p_patch ? 'howpublished' THEN p_patch->>'howpublished' ELSE howpublished END,
            institution = CASE WHEN p_patch ? 'institution' THEN p_patch->>'institution' ELSE institution END,
            number = CASE WHEN p_patch ? 'number' THEN p_patch->>'number' ELSE number END,
            organization = CASE WHEN p_patch ? 'organization' THEN p_patch->>'organization' ELSE organization END,
            publisher = CASE WHEN p_patch ? 'publisher' THEN p_patch->>'publisher' ELSE publisher END,
            school = CASE WHEN p_patch ? 'school' THEN p_patch->>'school' ELSE school END,
            series = CASE WHEN p_patch ? 'series' THEN p_patch->>'series' ELSE series END,
            type = CASE WHEN p_patch ? 'type' THEN p_patch->>'type' ELSE type END,
            eid = CASE WHEN p_patch ? 'eid' THEN p_patch->>'eid' ELSE eid END,
            isbn = CASE WHEN p_patch ? 'isbn' THEN p_patch->>'isbn' ELSE isbn END,
            issn = CASE WHEN p_patch ? 'issn' THEN p_patch->>'issn' ELSE issn END,
            keywords = CASE WHEN p_patch ? 'keywords' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'keywords')) ELSE keywords END,
            updated_at = now()
        WHERE original_publication_id = v_original_id AND id <> p_vault_publication_id;
    END IF;
END;
$$;

ALTER FUNCTION "public"."update_vault_publication_with_rollup"("p_vault_publication_id" "uuid", "p_vault_id" "uuid", "p_patch" "jsonb", "p_actor_user_id" "uuid") OWNER TO "postgres";

-- Unlike copy_publication_to_vault and most other functions in this schema
-- (granted to anon/authenticated/service_role alike, since they're meant to
-- be called by regular users), this function trusts its caller completely:
-- it has no independent authorization of its own, no auth/scope/vault-access
-- checks -- those already happened in .netlify's handleUpdateItem before the
-- RPC call. Restricting EXECUTE to service_role only means the only caller
-- that can ever invoke it is the one that already did those checks, and RLS
-- (which service_role bypasses) never becomes a factor either way.
REVOKE ALL ON FUNCTION "public"."update_vault_publication_with_rollup"("p_vault_publication_id" "uuid", "p_vault_id" "uuid", "p_patch" "jsonb", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_vault_publication_with_rollup"("p_vault_publication_id" "uuid", "p_vault_id" "uuid", "p_patch" "jsonb", "p_actor_user_id" "uuid") TO "service_role";
