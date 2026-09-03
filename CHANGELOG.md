# Changelog

All notable changes to `refhub.io` are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/). History prior to
1.4.2 was not tracked in this file.

## [1.11.2] - 2026-08-31

### Fixed
- `publication_tags` queries were timing out in production (Postgres error `57014`, "canceling statement due to statement timeout"), most likely from missing indexes on a table with no supporting index for either column it's looked up by. Added `idx_publication_tags_vault_publication_id` and `idx_publication_tags_tag_id`. **Requires running the new migration** (`supabase/migrations/20260831010000_publication_tags_perf_indexes.sql`).
- That timeout had a much bigger blast radius than just missing tags: `useAllPublications()` (used by smart collections and the Codex topic page's sidebar) fetched publications/vaults/vault_shares/vault_publications/publication_tags in one batch and discarded the *entire* batch — including vaults and publications that had already loaded fine — if any single one of those five queries failed. A slow tags query was silently wiping out sidebar vault lists and publication data on every affected page. Tags failing now degrades to an incomplete (rather than a discarded) result; only a failure in the other four still surfaces as an error, since those are needed for correct smart-collection matching.
- The Codex topic page's own discovery fetch had the identical failure mode one level up: a failed `publication_tags` lookup threw and took down the whole page ("could_not_load_this_topic") instead of just omitting tag-based match signals for that refresh.
- Smart collections, the smart collection detail page, and the Codex topic page never fetched or passed the signed-in user's profile to the sidebar, unlike every other authenticated page — the sidebar's avatar silently fell back to a placeholder instead of showing the real profile picture, and clicking it did nothing. All three now wire up `useProfile()` + the profile-edit dialog the same way Dashboard/The Codex/Users do.

## [1.11.1] - 2026-08-31

### Fixed
- `/collections` and `/collections/:id` had no auth gate at all — an anonymous visitor could browse to the smart collections UI shell. Both pages now redirect to `/` when signed out, matching every other authenticated page's pattern.
- The Codex topic page repeated its own topic name and item count above `PublicationList`'s own title/count header, reading as two stacked headers. Its own title/stat text is gone and the back link is now icon-only, matching the smart collection detail page's pattern — `PublicationList`'s header is the single place the name and count show.
- The Codex topic page never rendered the nav sidebar at all for signed-in users, unlike every other authenticated page (including its own parent, The Codex). Added it back. Also added the missing "the codex" icon next to the back button, and merged the back button, matching_vaults/related_topics/curators chips, and sort control into one row instead of two stacked ones.
- A publication added to a vault via "add to vault(s)" kept showing "not_in_any_vault" in its own edit dialog until a full page reload, since that action only refreshed vault access/metadata, never the separate map tracking which vaults each publication belongs to.
- The Codex page's topic/tag suggestion chips popped in with no loading state (and this isn't cached, so it happens on every visit). Added a small inline spinner while they load.
- Smart collections and their detail pages picked up the app's design system: gradient primary buttons, lowercase font-mono labels, and the shared vault color palette in the "new/edit collection" dialog, replacing generic purple accents.
- Smart collection cards showed raw tag/vault UUIDs (e.g. "tags equals 90f79e1d-...") instead of the tag/vault name.
- The smart collections list page had no description of what the feature is and no way to search collections by name; both are now present, matching the Codex/researchers-directory pattern.
- The smart collection detail page duplicated its title above `PublicationList`'s own header, leaving a large empty gap between the two; the page-level header is now a slim back/edit-rules bar only, matching how vault pages avoid this duplication.
- The smart collection detail page's content would intermittently vanish when switching away from and back to the browser tab. Root cause: `useAllPublications`/`useSmartCollections` re-fetched (with a brief `loading` flash to blank content) on every Supabase auth token refresh, which fires automatically when a backgrounded tab regains focus — not just on an actual sign-in/sign-out. Fixed by keying those effects off the user's id instead of the whole (frequently-recreated) user object, and added a loading spinner for genuine load transitions.
- Smart collection detail pages had no "discover related papers" action, unlike vault pages. Since a smart collection has no membership to add newly-found papers into, discovering now asks which of your vaults to add a match to, then reuses the same Semantic Scholar discovery flow vault pages already have.
- Clicking "new vault" from any page other than the dashboard navigated there without opening the create-vault dialog, requiring a second click once landed. It now opens immediately on arrival.
- Public vault pages never showed the vault's tagline (`description`) when an abstract was also set — the two fields were combined into one `abstract || description` block, so the tagline silently disappeared whenever an abstract existed. Both now render together (tagline above abstract) wherever a vault's text is shown, and the vault settings dialog's field is relabeled "tagline" to match.
- Public vault pages now show a subtle glow/border in the vault's own color, for a bit of per-vault visual identity.
- Fixed a `ReferenceError` crash on `/codex` (missing import introduced earlier in this same round).
- The sidebar's smart-collections highlight was a violet→purple (effectively monochrome) gradient, and the page's own icon was accent-green — neither matched the app's actual brand gradient (purple→pink) or each other. Both now use the same tokens as the rest of the app's branding.
- Brought smart collections' UI copy in line with this app's lowercase snake_case conventions (buttons, empty states, confirmations) — it had drifted to title-case/sentence-case English in a few places.
- Smart collections' sidebar entry and icon now use the logo's exact colors (`#A855F7` → `#EC4899`, read from the logo asset itself), moved to right after "all_papers" for easier access, and are styled as a flat tinted box like the sidebar's other nav icons (an earlier attempt used the literal glossy logo image, which stood out inconsistently next to the others).
- Codex vault cards now show a subtle border tinted with the vault's own color instead of a generic border.
- Dropped the "// tagline" / "// abstract" labels from vault description text — bold-vs-muted text hierarchy already conveys which is which.
- Smart collections list header's subtext no longer has a stray "//" prefix, matching how the researchers/all_papers pages format their subtitle line.
- The smart collections list page's H1 no longer carries an icon (icons belong on sidebar nav only) and is now prefixed with "// ", matching the all_papers/researchers pages.
- Both smart-collection pages' content wrapper was missing `min-w-0`, letting `PublicationList`'s table view stretch the whole page instead of scrolling horizontally inside its own container.
- The Codex topic page duplicated its title above `PublicationList`'s own header, used "//" as a mid-sentence stat separator instead of "•", used raw unstyled `<select>`/`<input>` elements for its facet/sort controls, and rendered paper titles in monospace inside "why these matched" (paper titles use the plain display font everywhere else). All fixed; facet/sort controls now match the app's actual `Select`/`Input` components.
- The Codex topic page's header, facet bar, and "matching_vaults"/"related_topics"/"curators" panel were stacked across many separately-bordered blocks, each wrapping onto its own line and wasting vertical space. The header now shares one row for the back-link, title, paper/vault counts, and sort control; the summary panel renders its groups as a single flex-wrap row instead of stacked sections.
- "Why these matched" is now a closed-by-default disclosure with a badge showing the match count, instead of always rendering every match's provenance in full — avoids dumping a wall of rows above the fold when a topic has many matches.
- Removed the Codex topic page's tag/author/venue/year filter inputs, which duplicated filtering `PublicationList`'s own toolbar already provides; kept the topic-specific sort modes (relevance/recent/popular/connected), which have no `PublicationList` equivalent.
- Fixed a "Rendered more hooks than during the previous render" crash on `/codex/topic/:topicSlug`, caused by a hook added after the component's early loading/error returns.

### Added
- Smart collections can now have an optional description, so a collection can carry its curatorial intent (e.g. "papers I still need to read for the visual storytelling survey") alongside its name and rules. Shown on list cards and the collection detail page. **Requires running the new migration** (`supabase/migrations/20260831000000_smart_collections_description.sql`).
- The smart collection dialog's rules are now a full inline form instead of a compact filter popover, with each rule showing a live, cumulative match count — how many papers match once that rule and every rule above it are applied together — so it's visible how each rule narrows the collection down.

## [1.11.0] - 2026-08-30

### Added
- Codex discovery mode: browse topics and tags directly at `/codex/topic/:topicSlug`, with transparent matching across tag names, keyword indices, notes, and citations. Each topic page shows related topics, topic curators, filterable results with facets and sort modes, and topic-chip suggestions on The Codex search bar.

## [1.10.2] - 2026-08-30

### Changed
- `AGENTS.md`: added two process items for coding agents working in this repo — always report stale/dead code, placeholders, and unrelated test failures encountered while working (without silently expanding scope to fix them), and always reference the GitHub issue(s) a PR relates to in its description, using closing keywords only when the PR fully resolves the issue.

## [1.10.1] - 2026-08-30

### Fixed
- The public vault page at `/public/:slug` never rendered a vault's description/abstract, even though the same fields are already shown on Codex browse cards and the abstract field's own hint says it's "shown on the codex when published." Visitors landing directly on a vault's page now see it, with a placeholder statement when neither field is set (#98).

## [1.10.0] - 2026-08-29

### Added
- Smart collections: save a filter rule set as a named, cross-vault view that stays current automatically as publications and metadata change, browsable from a new "Smart Collections" page linked in the sidebar (#92).

### Fixed
- `FilterBuilder`'s "Vault" filter field, which previously matched nothing (or everything, for "is empty") regardless of the vault selected.

## [1.9.3] - 2026-08-30

### Fixed
- Quoterm (toast) confirmations for page-level bulk actions — vault health check, vault fork, add-to-vaults, and other Dashboard/vault actions with no single relevant control to point at — were anchored to an invisible positioning marker at the top of the page. In `renderMode="inline"` that marker is a real DOM insertion point, so the toast pushed real layout into the page and caused it to jump/scroll on every health check, delete, or bulk update. These now pass an explicit `source: null` and render through Quoterm's no-anchor fallback instead, which is `position: fixed` and never touches document flow.
- That no-anchor fallback itself computed `top` by adding the page's scroll offset to a fixed-position element (a leftover from when it doubled as an absolutely-positioned marker), so it drifted downward out of view as the page was scrolled, and it hugged the top-right corner instead of being centered. It's now pinned `1rem` from the viewport top and horizontally centered, regardless of scroll position.
- Toasts anchored to a real control (a save button, a form, a dialog footer) kept the correct inline placement — this pass audited every anchored call site and left them as-is.
- About a third of all `toast(...)` calls app-wide (link/unlink actions, vault forking, keyboard-shortcut copy actions, and others) pass no `source` at all, so Quoterm anchored them to `document.activeElement`. That's a reasonable free anchor right after a click, but whenever nothing was actually focused — a background operation, a keyboard-only flow, focus lost after a dialog closed — `document.activeElement` is `document.body` itself, and Quoterm's inline mode inserted the toast as a DOM sibling of `<body>` inside `<html>`. RefHub's `toast()` wrapper now treats a `document.body` fallback as "no anchor" so it renders through the same centered hover treatment instead.
- Quoterm's default terminal theme (monospace font, hardcoded hex/hsl colors) didn't match the rest of the app and didn't adapt to the light/dark theme toggle for variant accent colors. Both anchored and no-anchor toasts now use RefHub's own font and `--popover`/`--border`/`--destructive`-etc. design tokens, so they read as a native part of the UI and switch instantly with the theme toggle.
- Vault health check's `apply_selected` button gave no feedback while applying changes beyond the standard disabled dimming — it kept showing the same label the whole time. It now shows `applying...`, matching the in-flight text swap the publication save button already uses.

## [1.9.2] - 2026-08-30

### Fixed
- The vault health check dialog's test suite (`VaultHealthCheckDialog.test.tsx`) was crashing on 7 of its 10 tests with `TypeError: Cannot read properties of undefined (reading 'filter')`. `runVaultHealthEnrichment` returns `{ results, skippedCount }`, but the tests' mocks were still resolving a bare `results` array — stale since an earlier release changed the function's return shape to also report a skipped-lookups count. The component's own behavior was correct throughout; only the test mocks needed updating to match the real function's contract.

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
