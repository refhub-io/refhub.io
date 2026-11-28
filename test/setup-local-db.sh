#!/usr/bin/env bash
# Boots a local Supabase stack (Docker) from this repo's schema.sql + real
# migrations, so you get a throwaway Postgres/Auth/Storage/Realtime instance
# that never touches production. Safe to re-run.
#
# Why this script exists instead of a plain `supabase start`: supabase/schema.sql
# is a `supabase db dump` snapshot of the public/graphql_public schemas (plus
# extensions and the supabase_realtime publication wiring) taken at some point
# in the past. Every migration up to that point is already baked into it
# (reapplying them fails with "already exists"), so bootstrapping has to stage
# schema.sql as a single synthetic earliest migration and move the
# already-baked-in migration files out of the way for the duration.
#
# schema.sql was stale for a while -- as of 2026-11-25 it was missing 4 real,
# already-shipped migrations (paper inbox, vault archiving, curated vault
# sections -- see supabase/migrations/20261125000000_wire_handle_new_user_trigger.sql's
# own comment and the PR that fixed issue #231 for the full story), which is
# what POST_DUMP_MIGRATIONS below used to work around. schema.sql has since
# been re-dumped to include them, so POST_DUMP_MIGRATIONS is down to one
# permanent entry rather than four stale ones -- see the comment next to it.
#
#   1. temporarily stages schema.sql as the single earliest migration
#   2. temporarily moves every ALREADY-BAKED-IN migration file out of the way,
#      but leaves the POST_DUMP_MIGRATIONS below in place so they apply on top,
#      in order, right after schema.sql
#   3. runs `supabase start` (or `db reset` if already running) against just that
#   4. restores supabase/migrations to exactly what it was before, always,
#      even on failure (trap on EXIT) - your real migration history is never
#      touched or committed to.
#
# Prerequisites: Docker daemon running, Node 18+.
set -euo pipefail
cd "$(dirname "$0")/.."       # repo root

HOLD_DIR="test/.migrations-holding"
BASE_MIGRATION="supabase/migrations/00000000000000_base_schema.sql"
POST_DUMP_MIGRATIONS=(
  # Wires handle_new_user() to a trigger on auth.users (issue #232). This is
  # a PERMANENT entry, not drift to clean up later: `supabase db dump` only
  # covers the public/graphql_public schemas, so a trigger on auth.users can
  # never be baked into schema.sql no matter how current the dump is -- this
  # migration file is the only place it's version-controlled. Any *future*
  # migration that touches a non-public/graphql_public schema belongs here
  # too; anything else should go back to zero entries once schema.sql is
  # re-dumped to include it.
  "20261125000000_wire_handle_new_user_trigger.sql"
  # Not yet applied to production (pending the user's go-ahead) -- schema.sql
  # doesn't have this policy fix baked in yet. Temporary: should move out
  # once applied live and schema.sql is re-dumped.
  "20261125000005_remove_public_vault_write_access.sql"
  "20261127000000_relation_type_check.sql"
  # Not yet applied to production either: profile links are limited to http(s)
  # URLs. Temporary, like the entry above.
  "20261127120000_profile_links_http_only.sql"
  # Not yet applied to production either: profile emails are no longer readable
  # by clients. Temporary, like the entries above.
  "20261128000000_hide_profile_emails.sql"
  # Not yet applied to production: get_library(), the library in one scoped
  # round trip. Temporary, like the entries above.
  "20261128120000_get_library.sql"
  # Not yet applied to production: get_vault_content(), a vault in one round
  # trip. Temporary, like the entries above.
  "20261128140000_get_vault_content.sql"
)

cleanup() {
  # restore supabase/migrations to its real, untouched state no matter what.
  rm -f "$BASE_MIGRATION"
  if [[ -d "$HOLD_DIR" ]]; then
    mv "$HOLD_DIR"/*.sql supabase/migrations/ 2>/dev/null || true
    rmdir "$HOLD_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker daemon is not reachable. Start Docker first (sudo systemctl start docker), then re-run this script." >&2
  exit 1
fi

if [[ ! -f supabase/config.jsonc && ! -f supabase/config.toml ]]; then
  echo "==> no supabase/config.jsonc found, running 'supabase init'"
  npx --yes supabase init --with-vscode-settings=false
fi

echo "==> staging schema.sql + the post-dump migrations for this bootstrap"
mkdir -p "$HOLD_DIR"
keep_pattern='! -name 00000000000000_base_schema.sql'
for f in "${POST_DUMP_MIGRATIONS[@]}"; do keep_pattern+=" ! -name $f"; done
# shellcheck disable=SC2086
find supabase/migrations -maxdepth 1 -name '*.sql' $keep_pattern -exec mv {} "$HOLD_DIR/" \;
cp supabase/schema.sql "$BASE_MIGRATION"

echo "==> starting local Supabase stack"
if npx --yes supabase status >/dev/null 2>&1; then
  npx --yes supabase db reset
else
  npx --yes supabase start
fi

echo ""
echo "==> local stack is up:"
echo "    API:     http://127.0.0.1:54321"
echo "    DB:      postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "    Studio:  http://127.0.0.1:54323"
echo "    Mailpit: http://127.0.0.1:54324"
echo ""
echo "next steps:"
echo "  1. cp test/env.local.example .env.local     (if you don't already have one)"
echo "  2. npm run dev -- --port 8081               (a second dev server so prod stays untouched on 8080)"
echo "  3. bash test/seed.sh                         (populate demo users/vaults/papers)"
