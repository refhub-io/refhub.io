-- 20260901000000_vault_archive_state.sql
--
-- Adds an irreversible archive/read-only state for vaults (#152). Archiving
-- freezes vault content and settings via a trigger + amended RLS policies,
-- but leaves the vault's existing visibility and read access completely
-- unchanged, and still allows the owner to delete the vault outright.

ALTER TABLE "public"."vaults" ADD COLUMN "archived_at" timestamptz;

-- Immutability trigger: once archived_at is set, no further UPDATE is
-- permitted on this row, by anyone, for any reason. The only legal
-- transition is archived_at flipping from NULL to non-NULL with every
-- other column unchanged in the same statement.
CREATE OR REPLACE FUNCTION "public"."enforce_vault_archive_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."archived_at" IS NOT NULL THEN
    RAISE EXCEPTION 'vault % is archived and cannot be modified', OLD."id";
  END IF;

  IF NEW."archived_at" IS NOT NULL THEN
    -- Note: updated_at is deliberately excluded because update_vaults_updated_at trigger unconditionally bumps it on every UPDATE
    IF NEW."name" IS DISTINCT FROM OLD."name"
      OR NEW."description" IS DISTINCT FROM OLD."description"
      OR NEW."color" IS DISTINCT FROM OLD."color"
      OR NEW."public_slug" IS DISTINCT FROM OLD."public_slug"
      OR NEW."category" IS DISTINCT FROM OLD."category"
      OR NEW."abstract" IS DISTINCT FROM OLD."abstract"
      OR NEW."visibility" IS DISTINCT FROM OLD."visibility"
      OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
    THEN
      RAISE EXCEPTION 'archiving a vault cannot be combined with other changes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "vault_archive_immutability" ON "public"."vaults";
CREATE TRIGGER "vault_archive_immutability"
  BEFORE UPDATE ON "public"."vaults"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."enforce_vault_archive_immutability"();

-- delete_vault RPC: SECURITY DEFINER so it bypasses RLS, because Postgres
-- enforces RLS on rows affected by ON DELETE CASCADE just as it does for
-- direct deletes -- without this, the RLS changes below would block an
-- owner from deleting their own archived vault's cascaded content.
CREATE OR REPLACE FUNCTION "public"."delete_vault"("p_vault_id" uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_fork_count integer;
BEGIN
  SELECT "user_id" INTO v_owner_id FROM "vaults" WHERE "id" = p_vault_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'vault not found';
  END IF;
  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the vault owner can delete this vault';
  END IF;

  SELECT count(*) INTO v_fork_count FROM "vault_forks" WHERE "original_vault_id" = p_vault_id;
  IF v_fork_count > 0 THEN
    RAISE EXCEPTION 'vault has % fork(s) and cannot be deleted', v_fork_count;
  END IF;

  DELETE FROM "vaults" WHERE "id" = p_vault_id;
END;
$$;

ALTER FUNCTION "public"."delete_vault"(uuid) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."delete_vault"(uuid) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_vault"(uuid) TO "service_role";

-- RLS: extend every editable-vault policy's vault-joined branch(es) with
-- "archived_at IS NULL". Ownership-only branches with no vault join
-- (a user's own `publications` row, a personal tag with vault_id NULL)
-- are untouched. Read-only SELECT policies are untouched.

DROP POLICY IF EXISTS "Users can manage vault publications in editable vaults" ON "public"."vault_publications";
CREATE POLICY "Users can manage vault publications in editable vaults" ON "public"."vault_publications" TO "authenticated"
USING (
  EXISTS (
    SELECT 1 FROM "public"."vaults" "v"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "v"."id" = "vault_publications"."vault_id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."vaults" "v"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "v"."id" = "vault_publications"."vault_id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
  )
);

DROP POLICY IF EXISTS "Users can manage own tags and tags in editable vaults" ON "public"."tags";
CREATE POLICY "Users can manage own tags and tags in editable vaults" ON "public"."tags" TO "authenticated"
USING (
  auth.uid() = "user_id"
  OR (
    "vault_id" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "public"."vaults" "v"
      LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
      WHERE "v"."id" = "tags"."vault_id"
        AND "v"."archived_at" IS NULL
        AND (
          "v"."user_id" = auth.uid()
          OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
          OR "v"."visibility" = 'public'::"public"."vault_visibility"
        )
    )
  )
)
WITH CHECK (
  auth.uid() = "user_id"
  OR (
    "vault_id" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "public"."vaults" "v"
      LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
      WHERE "v"."id" = "tags"."vault_id"
        AND "v"."archived_at" IS NULL
        AND (
          "v"."user_id" = auth.uid()
          OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
          OR "v"."visibility" = 'public'::"public"."vault_visibility"
        )
    )
  )
);

DROP POLICY IF EXISTS "Users can manage publication tags for own publications and acce" ON "public"."publication_tags";
CREATE POLICY "Users can manage publication tags for own publications and acce" ON "public"."publication_tags" TO "authenticated"
USING (
  ("publication_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."publications" "p"
    WHERE "p"."id" = "publication_tags"."publication_id" AND "p"."user_id" = auth.uid()
  ))
  OR ("publication_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."publications" "p"
    LEFT JOIN "public"."vault_papers" "vp" ON "p"."id" = "vp"."publication_id"
    LEFT JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "p"."id" = "publication_tags"."publication_id"
      AND (
        "p"."user_id" = auth.uid()
        OR ("v"."id" IS NOT NULL AND "v"."archived_at" IS NULL AND (
          "v"."user_id" = auth.uid()
          OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
          OR "v"."visibility" = 'public'::"public"."vault_visibility"
        ))
      )
  ))
  OR ("vault_publication_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."vault_publications" "vp"
    LEFT JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "vp"."id" = "publication_tags"."vault_publication_id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
  ))
)
WITH CHECK (
  ("publication_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."publications" "p"
    WHERE "p"."id" = "publication_tags"."publication_id" AND "p"."user_id" = auth.uid()
  ))
  OR ("publication_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."publications" "p"
    LEFT JOIN "public"."vault_papers" "vp" ON "p"."id" = "vp"."publication_id"
    LEFT JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "p"."id" = "publication_tags"."publication_id"
      AND (
        "p"."user_id" = auth.uid()
        OR ("v"."id" IS NOT NULL AND "v"."archived_at" IS NULL AND (
          "v"."user_id" = auth.uid()
          OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
          OR "v"."visibility" = 'public'::"public"."vault_visibility"
        ))
      )
  ))
  OR ("vault_publication_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."vault_publications" "vp"
    LEFT JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "vp"."id" = "publication_tags"."vault_publication_id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
  ))
);

DROP POLICY IF EXISTS "Users can manage own publications and publications in editable " ON "public"."publications";
CREATE POLICY "Users can manage own publications and publications in editable " ON "public"."publications" TO "authenticated"
USING (
  auth.uid() = "user_id"
  OR EXISTS (
    SELECT 1 FROM "public"."vault_papers" "vp"
    JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "vp"."publication_id" = "publications"."id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
  )
)
WITH CHECK (
  auth.uid() = "user_id"
  OR EXISTS (
    SELECT 1 FROM "public"."vault_papers" "vp"
    JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "vp"."publication_id" = "publications"."id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" IS NOT NULL AND "vs"."role" <> 'viewer'::"public"."vault_permission")
        OR "v"."visibility" = 'public'::"public"."vault_visibility"
      )
  )
);

DROP POLICY IF EXISTS "Users can manage vault papers" ON "public"."vault_papers";
CREATE POLICY "Users can manage vault papers" ON "public"."vault_papers"
WITH CHECK (
  auth.uid() = "added_by"
  OR EXISTS (
    SELECT 1 FROM "public"."vaults" "v"
    WHERE "v"."id" = "vault_papers"."vault_id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR EXISTS (
          SELECT 1 FROM "public"."vault_shares" "vs"
          WHERE "vs"."vault_id" = "v"."id" AND "vs"."shared_with_user_id" = auth.uid()
            AND "vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"])
        )
      )
  )
);

DROP POLICY IF EXISTS "publication_relations_insert" ON "public"."publication_relations";
CREATE POLICY "publication_relations_insert" ON "public"."publication_relations" FOR INSERT TO "authenticated"
WITH CHECK (
  "created_by" = auth.uid()
  AND EXISTS (
    SELECT 1 FROM "public"."vault_publications" "vp"
    JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    LEFT JOIN "public"."vault_shares" "vs" ON "v"."id" = "vs"."vault_id" AND "vs"."shared_with_user_id" = auth.uid()
    WHERE "vp"."id" = "publication_relations"."publication_id"
      AND "v"."archived_at" IS NULL
      AND (
        "v"."user_id" = auth.uid()
        OR ("vs"."shared_with_user_id" IS NOT NULL AND "vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"]))
      )
  )
);

DROP POLICY IF EXISTS "publication_relations_delete" ON "public"."publication_relations";
CREATE POLICY "publication_relations_delete" ON "public"."publication_relations" FOR DELETE TO "authenticated"
USING (
  "created_by" = auth.uid()
  OR EXISTS (
    SELECT 1 FROM "public"."vault_publications" "vp"
    JOIN "public"."vaults" "v" ON "vp"."vault_id" = "v"."id"
    WHERE ("vp"."id" = "publication_relations"."publication_id" OR "vp"."id" = "publication_relations"."related_publication_id")
      AND "v"."user_id" = auth.uid()
      AND "v"."archived_at" IS NULL
  )
);

DROP POLICY IF EXISTS "Vault owners can manage shares" ON "public"."vault_shares";
CREATE POLICY "Vault owners can manage shares" ON "public"."vault_shares" TO "authenticated"
USING (
  EXISTS (
    SELECT 1 FROM "public"."vaults" "v"
    WHERE "v"."id" = "vault_shares"."vault_id" AND "v"."user_id" = auth.uid() AND "v"."archived_at" IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."vaults" "v"
    WHERE "v"."id" = "vault_shares"."vault_id" AND "v"."user_id" = auth.uid() AND "v"."archived_at" IS NULL
  )
);
