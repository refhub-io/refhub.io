-- 20261125000000_wire_handle_new_user_trigger.sql
--
-- public.handle_new_user() has existed since the earliest schema (it calls
-- create_user_profile() to insert a public.profiles row for a new auth
-- user), but no migration ever wired it to a trigger on auth.users -- that
-- wiring only ever existed directly on the live production project, outside
-- version control (see issue #232). CREATE OR REPLACE TRIGGER (not CREATE
-- TRIGGER) so applying this against production, where the trigger already
-- exists, is a no-op rather than an "already exists" error.
--
-- Note for whoever next re-dumps supabase/schema.sql (see issue #231): this
-- trigger will never show up there. `supabase db dump` only covers the
-- schemas configured for the Data API (public, graphql_public) --
-- auth.users and anything attached to it are intentionally out of scope.
-- This migration file is the only place this trigger is version-controlled,
-- and it stays that way even after a fresh, fully up-to-date dump.
create or replace trigger "on_auth_user_created"
  after insert on auth.users
  for each row execute function public.handle_new_user();
