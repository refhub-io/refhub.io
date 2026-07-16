# AGENTS.md

Process guide for any coding agent (or human) working in this repo — Claude Code, Codex, Cursor, or otherwise. The point is that behavior stays consistent no matter which tool or session is doing the work. This file describes *how we ship*; `.github/refhub-identity.md` describes *what to build it to look/feel like*.

## 1. Check the visual/style identity first

Before writing or changing any UI, read `.github/refhub-identity.md`. It's the single source of truth for refhub.io's tech stack, directory structure, coding conventions, color system, typography, copywriting rules (lowercase, `//` comment-style headings, snake_case in monospace contexts), and component patterns. Match it — don't invent a new visual or copy style for one feature, and don't guess at conventions that are already written down there.

## 2. Do the work that's actually asked for

No unrequested refactors, no speculative abstractions, no drive-by cleanups bundled into an unrelated change. If you notice something else worth fixing while you're in there, say so — don't silently expand the scope of the current task.

## 3. Commit as soon as a fix or feature works

Don't let one commit accumulate multiple unrelated changes, and don't sit on working code uncommitted. As soon as a change does what it was supposed to do, verify it and commit it:

- `npx vitest run` (or `npm test`) — all tests passing
- `npx tsc --noEmit` — no type errors
- `npx eslint <changed files>` — no lint errors on what you touched
- For UI changes: actually exercise the change (dev server / browser), not just tests

Small, working commits are easier to review, bisect, and revert than one large commit at the end.

## 4. Ship as a branch + PR

Never commit directly to `main`. Do the work on a feature/fix branch (`fix/...`, `feature/...`, `chore/...`, matching this repo's existing branch names), then push and open a PR. Even small process/doc changes go through this — no exceptions for "it's just a tiny thing."

## 5. Keep `CHANGELOG.md` current

Update `CHANGELOG.md` (Keep a Changelog format, already in use in this repo) in the same PR as the change it documents. A shipped change without a changelog entry isn't done — don't let it drift and get backfilled later.

## 6. Versioning policy

Bump `package.json`'s version for every shipped change (and run `npm install --package-lock-only` afterward so `package-lock.json` stays in sync):

- **Patch** (`1.4.X`): version bump + `CHANGELOG.md` entry. Nothing else — this is for fixes and small tweaks that don't need to interrupt users.
- **Minor** (`1.X.0`): version bump + `CHANGELOG.md` entry + a new entry at the top of `src/config/changelog.ts` (increment its `id`) so signed-in users see a "What's New" notification. Use this tier for new user-facing features.
- **Major** (`X.0.0`): all of the above, plus a real GitHub Release (tag + release notes). Reserved for breaking changes or a genuinely new chapter for the product — not routine feature work.

## Anything else worth doing before you start

- Check `git status` and recent `git log` before touching anything — know what's already in flight on the current branch versus what you're about to add.
- Run the full test suite once at the start so you know the baseline is green, and any later failure is yours to fix, not inherited.
- If the task is large or the requirements are ambiguous, write a short plan and get it confirmed before touching code — don't guess at scope.
- Prefer small, focused files over growing an existing one; follow the directory structure already documented in `.github/refhub-identity.md`.
