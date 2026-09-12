-- 20260912000000_accept_inbox_item.sql
--
-- Atomically accepts a pending inbox item: creates the canonical
-- publication, copies it into the target vault, attaches any valid tags,
-- and marks the inbox item accepted -- all in one transaction, so a
-- failure partway through (bad vault id, tag insert error, etc.) leaves
-- no orphaned publications row. This is the backend-API equivalent of
-- refhub.io's own Inbox.tsx handleAccept, which does the same three
-- writes separately with no rollback (tracked as issue #225) -- this
-- function exists specifically so the new /api/v1/inbox/:id/accept route
-- doesn't ship that same gap.

CREATE OR REPLACE FUNCTION "public"."accept_inbox_item"(
    "p_inbox_item_id" uuid,
    "p_target_vault_id" uuid,
    "p_tag_ids" uuid[],
    "p_user_id" uuid
) RETURNS TABLE("vault_publication_id" uuid, "publication_id" uuid)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_item inbox_items%ROWTYPE;
    v_new_pub_id uuid;
    v_new_vault_pub_id uuid;
BEGIN
    SELECT * INTO v_item FROM inbox_items
        WHERE id = p_inbox_item_id AND user_id = p_user_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'inbox item not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_item.status <> 'pending' THEN
        RAISE EXCEPTION 'inbox item is not pending' USING ERRCODE = '23514';
    END IF;

    INSERT INTO publications (
        user_id, title, authors, year, journal, doi, url,
        abstract, pdf_url, publication_type, bibtex_key
    )
    SELECT
        p_user_id,
        v_item.parsed_fields->>'title',
        COALESCE(
            ARRAY(SELECT jsonb_array_elements_text(v_item.parsed_fields->'authors')),
            '{}'
        ),
        NULLIF(v_item.parsed_fields->>'year', '')::int,
        v_item.parsed_fields->>'journal',
        v_item.parsed_fields->>'doi',
        v_item.parsed_fields->>'url',
        v_item.parsed_fields->>'abstract',
        v_item.parsed_fields->>'pdf_url',
        COALESCE(v_item.parsed_fields->>'publication_type', 'article'),
        v_item.parsed_fields->>'bibtex_key'
    RETURNING id INTO v_new_pub_id;

    v_new_vault_pub_id := copy_publication_to_vault(v_new_pub_id, p_target_vault_id, p_user_id);

    IF p_tag_ids IS NOT NULL AND cardinality(p_tag_ids) > 0 THEN
        INSERT INTO publication_tags (vault_publication_id, publication_id, tag_id)
        SELECT v_new_vault_pub_id, NULL, t.id
        FROM tags t
        WHERE t.id = ANY(p_tag_ids) AND t.vault_id = p_target_vault_id;
    END IF;

    UPDATE inbox_items
        SET status = 'accepted', filed_publication_id = v_new_pub_id
        WHERE id = p_inbox_item_id;

    UPDATE vaults SET updated_at = now() WHERE id = p_target_vault_id;

    RETURN QUERY SELECT v_new_vault_pub_id, v_new_pub_id;
END;
$$;

ALTER FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) TO "service_role";
