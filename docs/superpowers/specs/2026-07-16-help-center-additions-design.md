# Help Center Additions — Design

**Goal:** Extend the Help Center (`KeyboardHelpOverlay`) with a way to restart the onboarding tour, a Resources tab listing the RefHub GitHub repos, and a placeholder AI Workflow Guides tab.

**Context:** The Help Center (`src/components/ui/KeyboardHelpOverlay.tsx`) currently has two tabs — `keyboard` (shortcut cheatsheet) and `guide` (renders `src/content/help-guide.md`) — tracked via `helpOverlayTab: 'keyboard' | 'guide'` in `KeyboardContext`. Separately, `App.tsx` renders `OnboardingWelcomeDialog`, a 5-step tour with spotlight highlights, gated by `useOnboarding.ts`'s `refhub_onboarding_welcome_dismissed_v1:<userId>` localStorage key. Once dismissed there is currently no way to bring it back except manually clearing localStorage and reloading.

---

## 1. Restart onboarding tour

**Problem:** No in-product way to replay the onboarding tour after dismissing it.

**Mechanism:**
- `src/hooks/useOnboarding.ts` exports a new `restartOnboarding()` function that dispatches a `window` CustomEvent, `ONBOARDING_RESTART_EVENT = 'refhub:onboarding-restart-requested'` — matching the existing `ONBOARDING_COMPLETED_EVENT` pattern already used by `useWhatsNew.ts`.
- Inside the `useOnboarding` hook, a `useEffect` listens for `ONBOARDING_RESTART_EVENT`. On receipt it removes the `storageKey` from localStorage and calls `setOpen(true)`.
- `OnboardingWelcomeDialog` adds a `useEffect` keyed on `open`: whenever `open` becomes `true`, reset `stepIndex` to `0`. This guarantees a restart (or any reopen) always starts from step 1, regardless of which step it was left on.

**Entry point in the Help Center:**
- The Help Center header already has a tab-specific action slot (currently only the `copy_all` button, shown when `helpOverlayTab === 'keyboard'`). Add a second conditional action, `restart_tour`, shown when `helpOverlayTab === 'guide'`.
- Click handler: `setHelpOverlayOpen(false)` (close the Help Center) then `restartOnboarding()` (clears the dismissal flag and reopens `OnboardingWelcomeDialog` at step 1).
- No confirmation dialog — this is non-destructive and instantly reversible (skip/dismiss again).

---

## 2. Resources tab

**Problem:** No in-product listing of RefHub's repos; the only existing reference is a stale 4-repo bullet list buried in `help-guide.md`'s FAQ section (out of 9 current non-archived, non-meta repos).

**Data source:** New static config file `src/config/resources.ts`, following the same pattern as `src/config/changelog.ts` (no runtime GitHub API dependency — avoids unauthenticated rate limits and a loading/error state for what is otherwise static content). Update the file when repos change, same maintenance model as the changelog.

**Repo list** (9 entries — excludes the `.github` meta-repo and the two archived repos `refhub-claude`, `refhub-codex`):

| name | description | url |
|---|---|---|
| refhub.io | The frontend product and help center — this app. | https://github.com/refhub-io/refhub.io |
| .netlify | Serverless backend / API layer. | https://github.com/refhub-io/.netlify |
| refhub-skill | MCP skill for agents to read, write, and manage RefHub vaults. | https://github.com/refhub-io/refhub-skill |
| refhub-mcp | MCP server implementation backing the RefHub agent integrations. | https://github.com/refhub-io/refhub-mcp |
| refhub-extensions | Browser extensions (Chrome, Edge, Firefox) for sending pages into RefHub. | https://github.com/refhub-io/refhub-extensions |
| refhub-cli | Command-line client for scripting and agent workflows (`npm i @refhub/cli`). | https://github.com/refhub-io/refhub-cli |
| refhub-qr | QR code generation for sharing vaults and publications. | https://github.com/refhub-io/refhub-qr |
| refhub-ascii | ASCII/terminal art for RefHub branding (e.g. Fastfetch). | https://github.com/refhub-io/refhub-ascii |
| refhub-paper-drafter | Agent skill for drafting HCI/visualization research papers from a vault and local notes. | https://github.com/refhub-io/refhub-paper-drafter |

The 4 entries without a description won't have been guessed blind — `refhub-cli`, `refhub-qr`, `refhub-ascii`, `refhub-mcp` descriptions above are inferred from repo name/context; user may correct any of these during implementation review.

**Rendering:** Simple vertical card list (reuse the `keyboard` tab's card visual language — rounded border, `bg-card/60`, mono headers): each card shows repo name (mono, bold), description, and an external-link icon/button that opens the URL in a new tab (`target="_blank" rel="noopener noreferrer"`).

---

## 3. AI Workflow Guides tab

**Problem:** None yet — placeholder for future content the user hasn't scoped.

**Content:** Centered empty-state: icon (e.g. `Bot` or `Workflow` from lucide-react) + `ai_workflow_guides()` mono heading + one line of body text: "guides for using RefHub with AI agents and workflows are coming soon." No further structure — content is explicitly TBD.

---

## 4. Tab bar layout

- `helpOverlayTab` type in `KeyboardContext.tsx` widens from `'keyboard' | 'guide'` to `'keyboard' | 'guide' | 'resources' | 'ai-workflows'` (state declaration, `openHelpOverlay` signature, and the two `useState`/`useCallback` call sites).
- `TabsList` goes from `grid-cols-2` to `grid-cols-4`.
- To avoid crowding on narrow viewports: the `sm:w-80` fixed width is dropped (back to full-width `TabsList` on mobile), and each `TabsTrigger`'s text label is wrapped in a `hidden sm:inline` span so mobile shows icon-only tabs while desktop shows icon + label.

---

## Out of scope for this spec (bug fixes, not new functionality — handled in the same implementation pass but don't need design review)

- **Ctrl+S stale-dirty-flag bug** (`PublicationDialog.tsx`): the global Ctrl+S hotkey handler (~line 208) saves successfully but never updates `fullscreenCleanNotesRef.current`, unlike the fullscreen Save button's `handleFullscreenSave` (~line 353) and `handleSaveAndClose` (~line 747), both of which do. This leaves the dirty-check ref stale, so Escape right after a Ctrl+S save still shows the "unsaved changes" prompt. Fix: after a successful save in the hotkey handler, when `notesFullscreen` is true, set `fullscreenCleanNotesRef.current = formDataRef.current.notes`.
- **Mobile onboarding footer buttons** (`OnboardingWelcomeDialog.tsx` ~line 157): restack so the primary "open app" button is full-width on top, "back"/"open guide" share a row below it, and "skip" becomes a small centered text link — replacing the current `flex-col-reverse` + wrap layout that leaves "open app" awkwardly orphaned on its own right-aligned row.
