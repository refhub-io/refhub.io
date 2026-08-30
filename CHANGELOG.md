# Changelog

All notable changes to `refhub.io` are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/). History prior to
1.4.2 was not tracked in this file.

## [1.10.0] - 2026-08-29

### Added
- Smart collections: save a filter rule set as a named, cross-vault view that stays current automatically as publications and metadata change, browsable from a new "Smart Collections" page linked in the sidebar (#92).

### Fixed
- `FilterBuilder`'s "Vault" filter field, which previously matched nothing (or everything, for "is empty") regardless of the vault selected.

## [1.9.1] - 2026-08-29

### Fixed
- The main content column picked up `position: relative` in the previous release (to anchor inline feedback toasts without reserving layout space). Since the sidebar is `position: fixed` and the content column's own box has always physically overlapped it under the `lg:pl-72` padding, making the column a positioned element caused it to stack above the sidebar and swallow every click meant for it — sidebar links and drag handles stopped responding on screens >= 1024px wide. The positioning anchor now lives on a small dedicated wrapper instead of the whole column.

## [1.9.0] - 2026-08-29

### Added
- Drag a paper card or table row from any list onto a vault in the sidebar to add it there, without opening a dialog. Only vaults you can edit accept the drop, and papers already in a vault are skipped automatically (#128).
- Drag-to-reorder for owned vaults, favorited vaults, and shared-with-me vaults in the sidebar, each with its own persisted order.
- Sidebar vault lists cap at 9 with a show-more toggle instead of growing unbounded.

### Fixed
- Owned-vault drag reordering silently did nothing on the Codex, researcher profile, and public vault pages — those pages never wrapped the sidebar in a DnD context.
- Shared-vault reordering was blocked for viewer-role vaults — dnd-kit's disabled-droppable flag removed them from collision detection entirely rather than just refusing paper drops.
- The drag preview stretched to the width of the dragged row instead of following the cursor, and lit up unrelated vaults while reordering.
- Consistency pass on primary (gradient) vs. destructive (red) button styling app-wide.
- Various mobile layout fixes: stray margins on vault pages, the publication toolbar wrapping when the export button appeared, and vault header controls wrapping onto their own line.

## [1.8.7] - 2026-08-21

### Added
- API key management: delete action now available on every key row (revoke: invalidates the key, keeping it in history; delete: revokes server-side and removes from the list). Revoke uses a distinct `ShieldOff` icon; delete uses `Trash2` — both are visually separate with a confirmation dialog (#176).
- Vault health check: DOI-check results are now cached in localStorage for 24 hours, so re-running health check skips papers checked recently and avoids burning Semantic Scholar quota. A `recheck_all` button bypasses the cache for a full refresh. Skipped-paper count is surfaced in the results panel (#178).

### Fixed
- Account settings feedback now anchors Quoterm messages to the relevant profile, password, email, API-key, or storage controls instead of falling back to the top of the viewport; saving the profile now emits one success message instead of two.

## [1.8.6] - 2026-08-21

### Fixed
- Vault settings: typing a collaborator email and pressing Enter submitted the vault settings form instead of adding the collaborator. Enter in the collaborator email field now triggers the add-collaborator action and no longer accidentally saves vault settings (#177).
- Delete vault and delete account dialogs now require typing the vault name (or "delete my account") before the delete button becomes enabled, and now call out that shared vault access/request state is removed with the deleted vault or account (#182, #183).
- Destructive account/vault confirmation dialogs now use clearer warning copy, cleaner typed-confirmation focus styling, and less decorative code-comment text.
- Export dialog field selector grids (BibTeX and CSV) are now always two columns instead of single-column on mobile, halving their height and eliminating the large empty gap between the format selector and the export options on narrow viewports (#179).
- Export dialog mobile panels now size to their content with bounded preview scrolling, avoiding dead empty scroll regions in BibTeX, CSV, and APA views.
- Account settings now refresh the displayed email after Supabase email-change verification flows and anchor password/email change feedback to the relevant settings action instead of the page fallback slot (#181, #180).

## [1.8.5] - 2026-08-02

### Fixed
- The background gradient on the /tos, /privacy, and /about pages was an edge-to-edge radial wash positioned relative to the initial viewport instead of the page, so it visually cut off partway down the page on scroll. It's now rendered as bounded, blurred blobs floating over the page's solid background color, which can't misalign or run out no matter how tall the page is.

### Changed
- The purple/green background blobs on /tos, /privacy, and /about now drift gently and continuously (CSS-only, no scroll-linked motion this time — that approach caused a hard-edged bar to appear near the top when scrolling). /about gets a faster, larger-amplitude drift for a livelier feel.

## [1.8.4] - 2026-08-01

### Fixed
- The public /about page kept showing "sign in" / "get_started" even when you were already signed in — it now shows "dashboard" / "go_to_dashboard" and links straight to the app instead of `/auth`.
- The /about page's hero eyebrow badge (a long unbroken snake_case string) had no natural word-break points and got silently clipped on narrow/mobile viewports; it now wraps.

## [1.8.3] - 2026-08-01

### Fixed
- CSV export preview: columns beyond what fit the dialog's width were silently clipped with no way to reach them, since the table was forced to exactly fit its container and `<ScrollArea>` only ships a vertical scrollbar by default. The preview table now sizes to its natural content width inside a horizontally-scrollable container.

## [1.8.2] - 2026-08-01

### Fixed
- Ctrl+A (select all), Ctrl+D (deselect all), and Ctrl+E (export) keyboard shortcuts were silently swallowed by the browser's own defaults (e.g. select-page-text) whenever the list wasn't already the active keyboard context — now app-wide like the app's other list shortcuts.

## [1.8.1] - 2026-08-01

### Changed
- CSV export: dropped the `refhub_id` column from the exportable field list.
- CSV export preview now renders as a table capped at 5 rows instead of dumping the full raw CSV text.

## [1.8.0] - 2026-07-31

### Added
- CSV export option alongside BibTeX and APA.
- Public /about landing page for signed-out visitors.
- Vault health check: scan for missing metadata and duplicates, with optional Semantic Scholar enrichment review.

## [1.7.1] - 2026-07-21

### Fixed
- Editing a publication inside a vault (e.g. toggling reading state or
  importance) could make its notes disappear from the screen until a page
  reload. Root cause: Postgres's logical replication omits unchanged
  large/TOASTed columns (like `notes`) from realtime update payloads unless
  the table's replica identity is `FULL`; the notes were never actually
  lost from the database, but the live view rebuilt itself from an
  incomplete payload. Fixed at both layers: `vault_publications` now has
  `REPLICA IDENTITY FULL` set, and the realtime update handler merges onto
  the existing record before applying a payload, so a field missing from
  one update can no longer clobber it locally either way.

## [1.7.0] - 2026-07-20

### Added
- Reading progress (`unread` / `skimmed` / `read`) and an orthogonal `important`
  star flag on every publication, with one-click quick controls in card and
  table views, filtering, and sorting. Both fields are independent per vault
  copy, like notes and tags — marking a paper read in one vault never affects
  another vault's copy of the same paper. (#94)

### Fixed
- Card-view sorting now supports ascending/descending for every field, not
  just the three previously-hardcoded presets.

## [1.6.2] - 2026-07-18

### Added
- ai_workflows tab in the help center: a full agent-workflows guide covering
  api key setup, cli install, per-harness skill install (claude code, codex,
  gemini cli, opencode, generic harnesses), and worked use cases — importing
  literature with notes and tags, vault administration, literature discovery,
  and grounded paper drafting — plus prompting tips and a `copy_guide` header
  action that copies the whole guide as markdown for agent contexts. (#161)
- Copy button on every fenced code block rendered through the markdown
  renderer; github.com links in the help-center tabs get a small GitHub icon.

### Fixed
- Fenced code blocks now get theme-aware syntax highlighting (token colors
  derive from the design-system palette; cli entry points like `refhub` and
  `claude` highlight as executable commands), no longer indent their first
  line, and long lines scroll inside the block instead of stretching the
  help dialog.

### Changed
- Resources tab: removed the empty `refhub-mcp` entry and renamed the
  `.netlify` listing to `refhub-api` (display only; url unchanged).

## [1.6.0] - 2026-07-18

### Added
- `find_duplicates` wizard in all_papers: configure a scoring heuristic
  (title/author/year/venue weights + threshold, DOI exact-match override),
  review scored candidate pairs, and resolve them git-style with
  field-by-field picks and per-vault annotation choices. (#143, #145)

### Changed
- Import-time duplicate warnings now use the same fuzzy scorer instead of
  exact DOI/title matching, so accent, punctuation, and LaTeX-markup
  variants of an existing paper are caught. (#143)
  
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
