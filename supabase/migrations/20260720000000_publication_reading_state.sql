-- 20260720000000_publication_reading_state.sql
--
-- Adds a personal reading-progress tracker and an orthogonal importance flag
-- to publications and vault_publications. Independent per row, exactly like
-- notes/tags: never added to BIBLIOGRAPHIC_FIELDS (src/lib/publicationSync.ts),
-- so editing one vault copy's state never fans out to the canonical row or
-- sibling vault copies. Existing rows get 'unread' / false automatically via
-- the column defaults below — no separate backfill needed.

ALTER TABLE "public"."publications"
  ADD COLUMN "reading_state" "text" NOT NULL DEFAULT 'unread',
  ADD COLUMN "important" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."publications"
  ADD CONSTRAINT "publications_reading_state_check"
  CHECK ("reading_state" IN ('unread', 'skimmed', 'read'));

ALTER TABLE "public"."vault_publications"
  ADD COLUMN "reading_state" "text" NOT NULL DEFAULT 'unread',
  ADD COLUMN "important" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."vault_publications"
  ADD CONSTRAINT "vault_publications_reading_state_check"
  CHECK ("reading_state" IN ('unread', 'skimmed', 'read'));

COMMENT ON COLUMN "public"."publications"."reading_state" IS 'Personal reading-progress tracker: unread, skimmed, or read. Independent per row, never synced across vault copies.';
COMMENT ON COLUMN "public"."publications"."important" IS 'User-starred importance flag, orthogonal to reading_state.';
COMMENT ON COLUMN "public"."vault_publications"."reading_state" IS 'Personal reading-progress tracker: unread, skimmed, or read. Independent per vault copy, never synced across sibling copies or the canonical row.';
COMMENT ON COLUMN "public"."vault_publications"."important" IS 'User-starred importance flag, orthogonal to reading_state.';
