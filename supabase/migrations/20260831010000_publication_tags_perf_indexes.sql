-- 20260831010000_publication_tags_perf_indexes.sql
--
-- publication_tags is queried two ways across the app: scoped by
-- vault_publication_id (Codex topic-suggestion lookups, matching-signal
-- lookups) and, less directly, by tag_id when resolving which publications
-- carry a given tag. Both were observed timing out in production (Postgres
-- error 57014, "canceling statement due to statement timeout") even for a
-- query already scoped to a small IN-list of vault_publication_ids -
-- consistent with these lookups doing full scans without a supporting
-- index. Adding both as a targeted, idempotent fix. Not using CONCURRENTLY
-- here since that requires running outside a transaction block, which
-- isn't guaranteed depending on how this migration gets applied (CLI vs.
-- the SQL editor) - a brief lock while building is an acceptable tradeoff
-- for a join table this size, versus a migration that silently fails.

CREATE INDEX IF NOT EXISTS "idx_publication_tags_vault_publication_id"
  ON "public"."publication_tags" ("vault_publication_id");

CREATE INDEX IF NOT EXISTS "idx_publication_tags_tag_id"
  ON "public"."publication_tags" ("tag_id");
