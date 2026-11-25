#!/usr/bin/env bash
# Populates the local Supabase stack (started by test/setup-local-db.sh) with
# realistic demo content: 6 users, 11 vaults across every visibility level,
# 42 papers, tags, a citation graph, forks/favorites/stats. Local-only, safe
# to re-run (will error on unique-constraint conflicts if data already exists -
# run test/setup-local-db.sh again first to get a clean DB).
set -euo pipefail
cd "$(dirname "$0")/.."       # repo root

node test/seed-local-demo.mjs
# handle_new_user()'s trigger (issue #232, fixed) already creates a bare
# profiles row per signed-up user; this fills in the demo-specific fields
# (username, bio, is_setup) that the trigger doesn't set.
node test/fix-profiles.mjs
# markdown notes, an "important" flag + working smart-collection filter, and
# inbox items - needs the paper-inbox/curated-sections migrations applied,
# which setup-local-db.sh does.
node test/seed-extra.mjs

echo ""
echo "demo login: alex.chen@refhub.dev / RefhubDemo123!"
echo "(same password for every seeded user: priya.raman@, marcus.webb@, lin.zhou@, sara.kessler@, tom.becker@ -- all @refhub.dev)"
