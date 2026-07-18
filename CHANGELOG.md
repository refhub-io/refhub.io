# Changelog

All notable changes to `refhub.io` are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/). History prior to
1.4.2 was not tracked in this file.

## [1.5.0] - 2026-07-17

### Added
- LaTeX math in Markdown notes: `$inline$` and `$$block$$` formulas now
  render via KaTeX everywhere notes are shown — editors, previews, and
  view dialogs. (#140)

## [1.4.5] - 2026-07-17

### Fixed
- Vault augmentation's "related" tab now requests a number of recommended
  papers proportional to how many papers were selected (5 per seed paper)
  instead of a fixed 20 regardless of batch size.
- Fixed the vault-augment dialog opening on its "topic" tab (with nothing
  to show) on the very first run of a session, even though the "related"
  tab already had results and its count was showing correctly. The active
  tab is initialized before the vault's papers finish loading, so it never
  got corrected once real seed papers arrived; the dialog now switches to
  the "related" tab as soon as it has seed papers to work with.

## [1.4.4] - 2026-07-17

### Added
- The Help Center gained a Resources tab listing RefHub's GitHub
  repositories with descriptions and links, and a placeholder AI Workflow
  Guides tab for upcoming content.
- The Help Center's guide tab now has a "restart_tour" action that replays
  the onboarding walkthrough from step 1, clearing the dismissal flag so it
  reopens immediately.

### Fixed
- Ctrl+S in the fullscreen notes editor no longer leaves a stale dirty flag
  that triggers a spurious "unsaved changes" prompt on exit. 1.4.3 only
  covered the save button; the global Ctrl+S shortcut used a separate code
  path that this release brings in line.
- The onboarding tour now always restarts at step 1 when reopened, instead
  of resuming wherever it was left off.
- Onboarding footer buttons (back/next/open app, skip, open guide) are now
  evenly sized and consistently positioned on both mobile and desktop.

## [1.4.3] - 2026-07-16

### Added
- A consolidated "What's New" entry covering the OpenAlex-backed discovery
  fallback, batched related-paper requests, and the coordinated global
  Semantic Scholar rate limit.

### Fixed
- A race condition in the vault-augment discovery dialog where a
  superseded fetch (related/references/citations/topic) could overwrite a
  newer one's results if two invocations overlapped.
- The account settings storage tab and toast notifications (quoterm) now
  respect light/dark theme instead of always rendering dark.
- Saving notes in the fullscreen editor via the save button no longer left
  a stale dirty flag that triggered a spurious "unsaved changes" prompt on
  exit (Ctrl+S was fixed separately in 1.4.4).
- The onboarding dialog's last-step button row now wraps instead of
  overflowing on narrow viewports.

## [1.4.2] - 2026-07-09

### Changed
- The vault "discovery" related-papers tab now fetches recommendations for
  the whole set of resolved seed papers in one batched request (chunked at
  20 seeds per call) instead of one request per paper, via the backend's
  batched `/recommendations` endpoint.

### Fixed
- Semantic Scholar sync and discovery were hitting rate limits almost
  constantly. The root cause was on the backend (see `.netlify`'s
  changelog): its per-user rate limiter let every user race the one shared
  Semantic Scholar API key independently. No frontend change was needed for
  that fix, but this release depends on the corresponding `.netlify` v2.2.0
  deploy.
