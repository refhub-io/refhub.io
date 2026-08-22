# Contributing to refhub.io

This is the process guide for product, code, and documentation changes in `refhub.io`. `AGENTS.md` gives coding agents the local repo rules; `.github/refhub-identity.md` is the visual and product identity source of truth.

## Brand, style, and identity

Before UI, copy, visual, or interaction changes, read `.github/refhub-identity.md`. Preserve the dark-first, keyboard-first product identity, Plus Jakarta Sans / JetBrains Mono roles, lowercase copy, `//` comment headings, and snake_case in monospace contexts.

Core rules:

- Prefer concise, practical wording over marketing copy.
- Preserve lowercase, `//` comment-style headings, snake_case labels, and monospace conventions where the repo surface already uses them.
- Keep examples concrete and operational: vaults, papers, tags, relations, PDFs, exports, agents, and API keys.
- Do not introduce a one-off visual, copy, naming, or interaction style for a single feature.

## Existing conventions

Before UI, copy, visual, or interaction changes, read `.github/refhub-identity.md`.

Follow the existing RefHub style:

- dark-first, keyboard-first UI;
- Plus Jakarta Sans and JetBrains Mono roles;
- lowercase copy, `//` comment-style headings, and snake_case in monospace contexts;
- existing shadcn/ui, Tailwind, React Query, and keyboard-context patterns.

Do not invent a new visual language for one feature.

## Scope and branch discipline

Do the work that was asked for. Keep unrelated refactors, dependency churn, formatting sweeps, and opportunistic cleanup out of focused PRs unless they are required.

## Pull requests

Never commit directly to `main`.

Use a fresh branch from current `origin/main`:

- `fix/...` for bugs.
- `feature/...` for user-facing features.
- `docs/...` for documentation-only changes.
- `chore/...` for maintenance.

Open a PR for every change, including small docs/process changes.

## Verification

Run checks that match the changed surface:

```sh
npx vitest run
npx tsc --noEmit
npx eslint <changed files>
```

For UI changes, also exercise the change in a browser. Verify responsive layout for mobile-sized and desktop-sized viewports when layout is touched.

## Changelog and semver

Keep `CHANGELOG.md` current in the same PR as the shipped change. The file uses Keep a Changelog and Semantic Versioning.

Bump `package.json` for shipped changes and keep `package-lock.json` in sync:

```sh
npm install --package-lock-only
```

- Patch: fixes and small tweaks.
- Minor: new user-facing features; also add a top entry in `src/config/changelog.ts` so signed-in users see the update.
- Major: breaking changes or a genuinely new product chapter; also create a GitHub Release with tag and release notes.

Process-only docs may be handled as docs-only PRs when they do not ship product/runtime behavior.

## Security and credentials

Never commit API keys, bearer tokens, local env files, private user data, or user-specific credentials. Examples must use placeholders only.
