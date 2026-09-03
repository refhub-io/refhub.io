# AGENTS.md

Repo-local operating guide for coding agents working in this repo. The point is that agent behavior stays consistent no matter which tool or session is doing the work. Contributor process lives in `CONTRIBUTING.md`; `.github/refhub-identity.md` describes what to build it to look/feel like.

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

Bump `package.json`'s version for every shipped change (and run `npm install --package-lock-only` afterward so `package-lock.json` stays in sync), following semver. `CHANGELOG.md` (Keep a Changelog format) is the durable, always-updated record — every shipped change gets an entry there, full stop. `src/config/changelog.ts` is a different thing: it drives the in-app "What's New" popup/notification badge for every signed-in user, so only put something there when it's actually worth interrupting users for.

- **Patch** (`1.4.X`) — small errors, fixes, quiet tweaks: version bump + `CHANGELOG.md` entry. Do **not** touch `src/config/changelog.ts` — a patch fix isn't worth a "What's New" popup.
- **Minor** (`1.X.0`) — new user-facing functionality or a meaningful improvement: version bump + `CHANGELOG.md` entry always. Add a `src/config/changelog.ts` entry (increment its `id`) *sometimes* — only when the minor bump is a genuinely new feature or a major improvement someone would want to know about, not for every minor release (a minor version can just be a bundle of smaller things that don't individually deserve a popup — use judgment, and ask if it's unclear which side of the line a change falls on).
- **Major** (`X.0.0`) — huge changes and additions, breaking changes, or a genuinely new chapter for the product: version bump + `CHANGELOG.md` entry + `src/config/changelog.ts` entry, always, plus a real GitHub Release (tag + release notes).

When in doubt about which tier a change is, or whether a minor bump clears the "What's New"-worthy bar, ask rather than guess — silently over- or under-notifying users is worse than a quick check.

## 7. Report faults you find, even ones you don't fix

While working, you will run into things that aren't the task at hand: stale or dead code, leftover placeholders/TODOs, tests that fail (or are skipped/silently broken) for reasons unrelated to your change, mismatched mocks, or anything else that looks faulty. Always report these — in the PR description and/or directly to whoever asked for the work — rather than working around them quietly or leaving them for someone else to rediscover from scratch. This is a reporting duty, not an obligation to fix everything you see: per item 2, don't silently expand scope to fix unrelated faults, but don't silently ignore them either. Say what you found, and let the person decide whether it gets fixed now, filed as an issue, or left alone.

## 8. Reference every issue a PR relates to, in its body

Every PR description mentions the GitHub issue(s) it relates to — never leave a PR unlinked to its issue. Use GitHub's closing keywords (`Closes #N`, `Fixes #N`) **only** when the PR actually resolves the issue in full — those keywords auto-close the issue the moment the PR merges, so using one on a partial slice incorrectly closes work that isn't done. For a PR that's a partial slice, stacked increment, or otherwise doesn't fully resolve the issue, reference it without a closing keyword (e.g. `Part of #N`, `Addresses #N`) so the link is visible without triggering auto-close. When a PR spins off follow-up issues for deferred scope, list those too.

## Anything else worth doing before you start

- Check `git status` and recent `git log` before touching anything — know what's already in flight on the current branch versus what you're about to add.
- Run the full test suite once at the start so you know the baseline is green, and any later failure is yours to fix, not inherited.
- If the task is large or the requirements are ambiguous, write a short plan and get it confirmed before touching code — don't guess at scope.
- Prefer small, focused files over growing an existing one; follow the directory structure already documented in `.github/refhub-identity.md`.
