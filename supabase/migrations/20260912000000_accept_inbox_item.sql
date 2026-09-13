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
--
-- DEPENDS ON inbox_items, which this branch does not itself define -- that
-- table is created by 20260905000000_paper_inbox.sql on the separate
-- feature/paper-inbox branch. This migration must not merge to main ahead
-- of that one: `inbox_items%ROWTYPE` below fails to resolve (missing
-- relation) on a clean `supabase db push`/reset run against a migration
-- history that has this file without that one already applied first.
-- (Already applied to the live database, where inbox_items already exists,
-- so this ordering constraint only matters for migration history / a fresh
-- environment, not the current production state.)

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
        abstract, pdf_url, publication_type, bibtex_key,
        volume, issue, pages, booktitle, chapter, edition, editor,
        howpublished, institution, number, organization, publisher,
        school, series, type, eid, isbn, issn, keywords
    )
    SELECT
        p_user_id,
        COALESCE(NULLIF(btrim(v_item.parsed_fields->>'title'), ''), NULLIF(btrim(v_item.source_ref), ''), 'Untitled'),
        CASE
            WHEN jsonb_typeof(v_item.parsed_fields->'authors') = 'array'
                THEN ARRAY(SELECT jsonb_array_elements_text(v_item.parsed_fields->'authors'))
            ELSE '{}'
        END,
        CASE
            WHEN (v_item.parsed_fields->>'year') ~ '^\d{1,4}$'
                THEN (v_item.parsed_fields->>'year')::int
            ELSE NULL
        END,
        v_item.parsed_fields->>'journal',
        v_item.parsed_fields->>'doi',
        v_item.parsed_fields->>'url',
        v_item.parsed_fields->>'abstract',
        v_item.parsed_fields->>'pdf_url',
        COALESCE(v_item.parsed_fields->>'publication_type', 'article'),
        v_item.parsed_fields->>'bibtex_key',
        v_item.parsed_fields->>'volume',
        v_item.parsed_fields->>'issue',
        v_item.parsed_fields->>'pages',
        v_item.parsed_fields->>'booktitle',
        v_item.parsed_fields->>'chapter',
        v_item.parsed_fields->>'edition',
        CASE
            WHEN jsonb_typeof(v_item.parsed_fields->'editor') = 'array'
                THEN ARRAY(SELECT jsonb_array_elements_text(v_item.parsed_fields->'editor'))
            ELSE '{}'
        END,
        v_item.parsed_fields->>'howpublished',
        v_item.parsed_fields->>'institution',
        v_item.parsed_fields->>'number',
        v_item.parsed_fields->>'organization',
        v_item.parsed_fields->>'publisher',
        v_item.parsed_fields->>'school',
        v_item.parsed_fields->>'series',
        v_item.parsed_fields->>'type',
        v_item.parsed_fields->>'eid',
        v_item.parsed_fields->>'isbn',
        v_item.parsed_fields->>'issn',
        CASE
            WHEN jsonb_typeof(v_item.parsed_fields->'keywords') = 'array'
                THEN ARRAY(SELECT jsonb_array_elements_text(v_item.parsed_fields->'keywords'))
            ELSE '{}'
        END
    RETURNING id INTO v_new_pub_id;

    v_new_vault_pub_id := copy_publication_to_vault(v_new_pub_id, p_target_vault_id, p_user_id);

    IF p_tag_ids IS NOT NULL AND cardinality(p_tag_ids) > 0 THEN
        INSERT INTO publication_tags (vault_publication_id, publication_id, tag_id)
        SELECT v_new_vault_pub_id, NULL, t.id
        FROM tags t
        WHERE t.id = ANY(p_tag_ids)
            AND (t.vault_id = p_target_vault_id OR (t.vault_id IS NULL AND t.user_id = p_user_id));
    END IF;

    UPDATE inbox_items
        SET status = 'accepted', filed_publication_id = v_new_pub_id
        WHERE id = p_inbox_item_id;

    UPDATE vaults SET updated_at = now() WHERE id = p_target_vault_id;

    RETURN QUERY SELECT v_new_vault_pub_id, v_new_pub_id;
END;
$$;

ALTER FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) OWNER TO "postgres";

-- p_user_id is caller-supplied, not derived from auth.uid() -- this function
-- trusts its caller (the backend API, which resolves and checks the real
-- identity before invoking it) rather than checking identity itself. New
-- functions in this schema get EXECUTE granted to PUBLIC/anon/authenticated
-- by default; without revoking those, any signed-in user could call this
-- RPC directly via PostgREST with an arbitrary p_user_id and file items
-- into any vault under any other user's identity.
REVOKE EXECUTE ON FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."accept_inbox_item"(uuid, uuid, uuid[], uuid) TO "service_role";
