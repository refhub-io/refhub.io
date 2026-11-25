-- 20261125000002_inbox_items_realtime.sql
--
-- Backfills realtime wiring for inbox_items that already exists on the live
-- project but was never captured in a migration file: discovered while
-- re-dumping supabase/schema.sql (issue #231), production has inbox_items
-- in REPLICA IDENTITY FULL and added to the supabase_realtime publication,
-- but 20260905000000_paper_inbox.sql never declared either. Without
-- REPLICA IDENTITY FULL, Postgres's logical replication (what Supabase
-- Realtime reads from) omits unchanged TOASTed columns from UPDATE payloads
-- -- the same class of bug fixed for vault_publications in
-- 20260721000000_vault_publications_replica_identity_full.sql.
--
-- Both statements are naturally idempotent against production, where this
-- is already applied: REPLICA IDENTITY FULL is safe to set again, and the
-- DO block below only runs ADD TABLE if inbox_items isn't already a
-- publication member (plain ALTER PUBLICATION ... ADD TABLE has no
-- IF NOT EXISTS form and errors if the table is already a member).
ALTER TABLE ONLY public.inbox_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'inbox_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.inbox_items;
  END IF;
END;
$$;
