# Issues found while building this local test environment

Found while setting up a local Supabase stack to exercise and screenshot the
app locally. Reporting per AGENTS.md #7 (report faults even when not asked to
fix them).

## 1. `supabase/schema.sql` was stale — 4 real migrations were missing from it (issue #231, fixed)

`supabase/schema.sql` is a `supabase db dump` snapshot, not a live view of
the schema. It predated these four already-shipped migrations:

- `20260901000000_vault_archive_state.sql`
- `20260903120000_curated_vault_sections.sql`
- `20260905000000_paper_inbox.sql`
- `20260912000000_accept_inbox_item.sql`

Confirmed against a schema.sql-only bootstrap at the time (all four: `f`):

```sql
select 'inbox_items table' as thing, exists(select 1 from information_schema.tables where table_name='inbox_items') as present
union all select 'vault_sections table', exists(select 1 from information_schema.tables where table_name='vault_sections')
union all select 'vaults.archived_at column', exists(select 1 from information_schema.columns where table_name='vaults' and column_name='archived_at')
union all select 'accept_inbox_item function', exists(select 1 from information_schema.routines where routine_name='accept_inbox_item');
```

**Fixed**: `schema.sql` has been re-dumped (unrestricted `supabase db dump`,
not schema-filtered — a schema-filtered dump silently drops the
`CREATE EXTENSION` statements and the `supabase_realtime` publication
wiring, which would have been a real regression) from a local stack built
from the old `schema.sql` + these 4 migrations, and diffed line-by-line
against the original to confirm the only changes were the 4 migrations'
objects plus one new `pg_graphql` extension line. `test/setup-local-db.sh`'s
`POST_DUMP_MIGRATIONS` no longer needs these four entries.

This doesn't make `schema.sql` self-updating — the next migration that lands
without a re-dump will reintroduce the same drift. Re-dumping after every
migration (or on a schedule) is still a process gap worth closing.

## 2. `handle_new_user()` was never wired to a trigger on `auth.users` (issue #232, fixed)

`public.handle_new_user()` existed, but no migration ever created the
`CREATE TRIGGER ... ON auth.users ... EXECUTE FUNCTION handle_new_user()`
that makes it fire — that wiring only ever existed directly on the live
production project. Confirmed on a fresh local bootstrap (0 rows):

```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;
```

**Fixed**: `supabase/migrations/20261125000000_wire_handle_new_user_trigger.sql`
adds the trigger with `CREATE OR REPLACE TRIGGER` (idempotent against
production, where it already exists outside version control). Verified
locally end-to-end: `auth.admin.createUser()` now produces a matching
`profiles` row with no extra step. `test/fix-profiles.mjs` and
`test/seed.sh` no longer need to work around a missing trigger — see their
updated comments. **This migration still needs to be applied to the live
project** (e.g. `supabase db push --linked`) to put the existing-but-
undocumented production trigger under version control for real.

Note this one is permanent, not drift: `supabase db dump` only covers the
public/graphql_public schemas, so a trigger on `auth.users` can never be
captured in `schema.sql` no matter how current the dump is. The migration
file is the only place it's version-controlled, and
`test/setup-local-db.sh`'s `POST_DUMP_MIGRATIONS` keeps exactly this one
entry for that reason.

## 3. `vault_analytics` dialog's tag panel vs. user-scoped tags (not confirmed a bug)

The `CollectionAnalytics` dialog (opened via the "vault_analytics" button) has
a `// tags` panel that reads `// no tags assigned yet` even when the vault's
papers visibly have tags attached (shown correctly as `#foundational` etc. in
the main paper list). The seed data's tags are **user-scoped**
(`tags.vault_id IS NULL`), not **vault-scoped**. The schema comment says tags
"can be user-scoped (for personal vaults) or vault-scoped (for shared
vaults)," so this panel may intentionally only aggregate vault-scoped tags —
plausible, but not verified against the component's source. Already tracked
as issue #233; flagging here too since this environment is what surfaced it.
