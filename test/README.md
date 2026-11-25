# local dev/test environment

A throwaway local Supabase stack (Docker) + seeded demo data, for exercising
the app locally — including authenticated views — without ever touching
production.

## prerequisites

- Docker, with the daemon actually running (`docker info` should succeed).
  On this machine we hit a real gotcha getting here: the kernel package had
  been updated but the box hadn't rebooted into it yet, so `dockerd` couldn't
  load a netfilter kernel module it needs — fixed by rebooting. If
  `test/setup-local-db.sh` fails with something like `iptables ... missing
  kernel module?` in `journalctl -u docker`, check `uname -r` against
  `pacman -Q linux` (or your distro's equivalent) — a mismatch means reboot.
- Node 18+ (this repo's version is fine).
- No Supabase CLI install needed — scripts run it via `npx`.

## quickstart

```bash
bash test/setup-local-db.sh    # boots local Supabase in Docker (idempotent)
cp test/env.local.example .env.local   # points THIS repo's vite app at it
npm run dev -- --port 8081     # a second dev server, so :8080/prod is untouched
bash test/seed.sh              # populates demo users/vaults/papers/citations
```

Then open <http://localhost:8081>, sign in with any seeded user (same password
for all):

| email | username | notes |
|---|---|---|
| alex.chen@refhub.dev | alex_chen | owns the richest vault (citation graph demo) |
| priya.raman@refhub.dev | priya_raman | visualization researcher |
| marcus.webb@refhub.dev | marcus_webb | systems researcher |
| lin.zhou@refhub.dev | lin_zhou | nlp researcher |
| sara.kessler@refhub.dev | sara_kessler | computational biology |
| tom.becker@refhub.dev | tom_becker | causal inference; owns a forked vault |

password for all: `RefhubDemo123!`

## what gets seeded

`test/seed-local-demo.mjs` (via the Supabase admin API + direct table inserts,
service-role, local-only):

- 6 users across 6 research areas
- 11 vaults spanning every `visibility` level (`public`, `protected`,
  `private`), 5 of them public with a `public_slug`
- 42 papers (real bibliographic metadata — titles/authors/years/venues of
  actual well-known papers, no copied abstracts)
- tags (owner-scoped), attached to roughly half the papers per vault
- a 6-edge citation graph in the `transformer architectures` vault (`cites`,
  `extends`, `related` relations) — good for exercising the citation-graph UI
- `vault_stats` (view/download counts) on every public vault
- `vault_favorites` across users
- one `vault_forks` relationship (tom_becker forks priya_raman's public vault)
- one `smart_collections` entry

`test/fix-profiles.mjs` fills in each seeded user's `profiles` row
(`username`, `bio`, `is_setup`) directly, because of a real gap in
`schema.sql` — see `test/BUGS.md` #2.

`test/seed-extra.mjs` adds markdown notes (rendered via the paper dialog's
notes tab) to two papers, flags three as `important`, wires up `alex_chen`'s
"high priority reads" smart collection with a real filter so it actually
matches something, and seeds 4 pending `inbox_items`. This needs the
post-dump migrations applied (`test/BUGS.md` #1), which `setup-local-db.sh`
does for you.

Run all three (or just `test/seed.sh`, which runs them in order) after a
fresh `test/setup-local-db.sh`.

## stopping / cleaning up

```bash
bash test/teardown.sh          # stops the Docker containers, drops the data
```

This removes `supabase/config.jsonc` (the scaffolding `supabase init` added)
but never touches `supabase/migrations/`, `supabase/schema.sql`, or anything
under `test/`. It leaves `.env.local` in place — delete that yourself
(`rm .env.local`) if you want your normal `npm run dev` (port 8080) to go back
to pointing at production; the two dev-server instances don't conflict since
they're on different ports either way.

## why `setup-local-db.sh` is not just `supabase start`

`supabase/schema.sql` is a `supabase db dump` snapshot of the
already-migrated public/graphql_public schema. Running `supabase start`
straight against this repo applies `supabase/migrations/*.sql` on a fresh
DB, not `schema.sql` — and the earliest migrations assume objects that were
created directly in the live project (not via a migration file) long before
this repo's migration history starts, so a from-scratch `migrations/`-only
run fails immediately (e.g. `relation "public.publication_relations" does
not exist`). `setup-local-db.sh` works around this by staging `schema.sql`
as a single synthetic earliest migration and temporarily moving the real
migration files aside for the duration of the bootstrap, then restoring
`supabase/migrations/` exactly — so your real migration history is never
modified or committed to. See the comment at the top of that script for the
full breakdown, and `test/BUGS.md` for the other things this surfaced
(including two real bugs, #231 and #232, found and fixed this way).
