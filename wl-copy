CREATE OR REPLACE FUNCTION "public"."copy_publication_to_vault"("pub_id" "uuid", "target_vault_id" "uuid", "user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    new_pub_id UUID;
    pub_record publications%ROWTYPE;
    source_record vault_publications%ROWTYPE;
BEGIN
    -- Get the canonical publication row.
    SELECT * INTO pub_record FROM publications WHERE id = pub_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Publication not found';
    END IF;

    -- Standard bibliographic metadata is mostly static/canonical. When the
    -- canonical row is sparse, use the richest accessible vault instance for the
    -- same original publication as a fallback. Vault-local fields (notes, tags,
    -- and vault membership) intentionally do not get merged here.
    SELECT * INTO source_record
    FROM vault_publications
    WHERE original_publication_id = pub_id
    ORDER BY
        (
            (CASE WHEN title IS NOT NULL AND btrim(title) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN authors IS NOT NULL AND cardinality(authors) > 0 THEN 1 ELSE 0 END) +
            (CASE WHEN year IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN journal IS NOT NULL AND btrim(journal) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN volume IS NOT NULL AND btrim(volume) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN issue IS NOT NULL AND btrim(issue) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN pages IS NOT NULL AND btrim(pages) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN doi IS NOT NULL AND btrim(doi) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN url IS NOT NULL AND btrim(url) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN abstract IS NOT NULL AND btrim(abstract) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN pdf_url IS NOT NULL AND btrim(pdf_url) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN bibtex_key IS NOT NULL AND btrim(bibtex_key) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN publication_type IS NOT NULL AND btrim(publication_type) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN booktitle IS NOT NULL AND btrim(booktitle) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN chapter IS NOT NULL AND btrim(chapter) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN edition IS NOT NULL AND btrim(edition) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN editor IS NOT NULL AND cardinality(editor) > 0 THEN 1 ELSE 0 END) +
            (CASE WHEN howpublished IS NOT NULL AND btrim(howpublished) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN institution IS NOT NULL AND btrim(institution) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN number IS NOT NULL AND btrim(number) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN organization IS NOT NULL AND btrim(organization) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN publisher IS NOT NULL AND btrim(publisher) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN school IS NOT NULL AND btrim(school) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN series IS NOT NULL AND btrim(series) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN type IS NOT NULL AND btrim(type) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN eid IS NOT NULL AND btrim(eid) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN isbn IS NOT NULL AND btrim(isbn) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN issn IS NOT NULL AND btrim(issn) <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN keywords IS NOT NULL AND cardinality(keywords) > 0 THEN 1 ELSE 0 END)
        ) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    LIMIT 1;

    -- Insert a copy into vault_publications using canonical values first, then
    -- best-available instance metadata. Notes are vault-local, so new vault
    -- copies start with null notes instead of inheriting another vault's notes.
    INSERT INTO vault_publications (
        vault_id, original_publication_id, title, authors, year, journal, volume, issue,
        pages, doi, url, abstract, pdf_url, bibtex_key, publication_type, notes,
        booktitle, chapter, edition, editor, howpublished, institution, number,
        organization, publisher, school, series, type, eid, isbn, issn, keywords,
        created_by, version
    )
    VALUES (
        target_vault_id, pub_id,
        COALESCE(NULLIF(pub_record.title, ''), NULLIF(source_record.title, '')),
        COALESCE(NULLIF(pub_record.authors, '{}'::text[]), NULLIF(source_record.authors, '{}'::text[]), '{}'::text[]),
        COALESCE(pub_record.year, source_record.year),
        COALESCE(NULLIF(pub_record.journal, ''), NULLIF(source_record.journal, '')),
        COALESCE(NULLIF(pub_record.volume, ''), NULLIF(source_record.volume, '')),
        COALESCE(NULLIF(pub_record.issue, ''), NULLIF(source_record.issue, '')),
        COALESCE(NULLIF(pub_record.pages, ''), NULLIF(source_record.pages, '')),
        COALESCE(NULLIF(pub_record.doi, ''), NULLIF(source_record.doi, '')),
        COALESCE(NULLIF(pub_record.url, ''), NULLIF(source_record.url, '')),
        COALESCE(NULLIF(pub_record.abstract, ''), NULLIF(source_record.abstract, '')),
        COALESCE(NULLIF(pub_record.pdf_url, ''), NULLIF(source_record.pdf_url, '')),
        COALESCE(NULLIF(pub_record.bibtex_key, ''), NULLIF(source_record.bibtex_key, '')),
        COALESCE(NULLIF(pub_record.publication_type, ''), NULLIF(source_record.publication_type, ''), 'article'),
        NULL,
        COALESCE(NULLIF(pub_record.booktitle, ''), NULLIF(source_record.booktitle, '')),
        COALESCE(NULLIF(pub_record.chapter, ''), NULLIF(source_record.chapter, '')),
        COALESCE(NULLIF(pub_record.edition, ''), NULLIF(source_record.edition, '')),
        COALESCE(NULLIF(pub_record.editor, '{}'::text[]), NULLIF(source_record.editor, '{}'::text[]), '{}'::text[]),
        COALESCE(NULLIF(pub_record.howpublished, ''), NULLIF(source_record.howpublished, '')),
        COALESCE(NULLIF(pub_record.institution, ''), NULLIF(source_record.institution, '')),
        COALESCE(NULLIF(pub_record.number, ''), NULLIF(source_record.number, '')),
        COALESCE(NULLIF(pub_record.organization, ''), NULLIF(source_record.organization, '')),
        COALESCE(NULLIF(pub_record.publisher, ''), NULLIF(source_record.publisher, '')),
        COALESCE(NULLIF(pub_record.school, ''), NULLIF(source_record.school, '')),
        COALESCE(NULLIF(pub_record.series, ''), NULLIF(source_record.series, '')),
        COALESCE(NULLIF(pub_record.type, ''), NULLIF(source_record.type, '')),
        COALESCE(NULLIF(pub_record.eid, ''), NULLIF(source_record.eid, '')),
        COALESCE(NULLIF(pub_record.isbn, ''), NULLIF(source_record.isbn, '')),
        COALESCE(NULLIF(pub_record.issn, ''), NULLIF(source_record.issn, '')),
        COALESCE(NULLIF(pub_record.keywords, '{}'::text[]), NULLIF(source_record.keywords, '{}'::text[]), '{}'::text[]),
        user_id, 1
    )
    RETURNING id INTO new_pub_id;

    RETURN new_pub_id;
END;
$$;
