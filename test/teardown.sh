#!/usr/bin/env bash
# Stops the local Supabase stack and removes the local-dev scaffolding this
# test/ setup adds (supabase/config.jsonc + its .gitignore). Does NOT touch
# supabase/migrations, supabase/schema.sql, or anything under test/ -- run
# this when you're done and want a clean `git status` again.
set -euo pipefail
cd "$(dirname "$0")/.."       # repo root

npx --yes supabase stop --no-backup 2>&1 || true
rm -f supabase/config.jsonc supabase/.gitignore
rmdir supabase/.temp 2>/dev/null || true

echo "==> local Supabase stack stopped and config scaffolding removed."
echo "    (.env.local was left in place -- remove it yourself if you want the"
echo "    app to point back at production: rm .env.local)"
