-- 20260905000000_paper_inbox.sql
--
-- Paper inbox: a staging area for captured references before they're filed
-- into a vault. Fully independent of publications/vault_publications — no
-- existing query needs to change to accommodate this new state.

CREATE TABLE "public"."inbox_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "status" text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'merged')),
    "source_type" text NOT NULL
        CHECK (source_type IN ('doi', 'arxiv', 's2_url', 'bibtex', 'pdf', 'manual')),
    "source_ref" text NOT NULL,
    "parsed_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "suggested_vault_id" uuid REFERENCES public.vaults(id) ON DELETE SET NULL,
    "suggested_tag_ids" uuid[],
    "duplicate_of_publication_id" uuid REFERENCES public.publications(id) ON DELETE SET NULL,
    "filed_publication_id" uuid REFERENCES public.publications(id) ON DELETE SET NULL,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "inbox_items_user_status_idx" ON "public"."inbox_items" ("user_id", "status", "sort_order", "created_at");

ALTER TABLE "public"."inbox_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_items_owner_select" ON "public"."inbox_items"
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "inbox_items_owner_insert" ON "public"."inbox_items"
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inbox_items_owner_update" ON "public"."inbox_items"
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "inbox_items_owner_delete" ON "public"."inbox_items"
    FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION "public"."set_inbox_items_updated_at"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER "inbox_items_set_updated_at"
    BEFORE UPDATE ON "public"."inbox_items"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_inbox_items_updated_at"();
