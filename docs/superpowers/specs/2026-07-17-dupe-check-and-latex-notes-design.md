# Design: advanced duplicate checking + LaTeX in notes

Date: 2026-07-17
Issues: [#143](https://github.com/velitchko/refhub.io/issues/143), [#145](https://github.com/velitchko/refhub.io/issues/145), [#140](https://github.com/velitchko/refhub.io/issues/140)
Out of scope (tracked separately): #144 (LaTeX special-character decoding in the BibTeX parser).

Shipped as **two separate branches/PRs**, each a **minor** version bump (CHANGELOG.md + `src/config/changelog.ts` what's-new entry per AGENTS.md).

---

## Part 1 — `find_duplicates` wizard (issues #143, #145)

### Entry point

A `find_duplicates` button in the all_papers toolbar on the Dashboard (`src/pages/Dashboard.tsx`), following the identity file's mono/lowercase copy conventions. Opens `DuplicateCheckDialog`, a three-step modal wizard. Only original publications (`original_publication_id` null) are scanned; vault copies are handled during resolution.

### Step 1 — configure_heuristic

The user composes the matching heuristic:

| Signal | Method | Default weight |
|---|---|---|
| title | token-sort Levenshtein ratio on normalized strings | 0.5 |
| authors | Jaccard overlap of normalized last names | 0.25 |
| year | 1.0 if equal, 0.5 if ±1, else 0 | 0.15 |
| venue | similarity ratio on normalized `journal ?? booktitle` | 0.1 |
| doi | exact match on normalized DOI → short-circuits pair score to 1.0 | — |

- Each signal has an enable toggle and a weight slider; weights are renormalized over enabled signals.
- Score threshold slider, default 0.75.
- Presets: `strict` (0.9, title+doi-heavy), `balanced` (0.75, defaults above), `loose` (0.6).
- Normalization (shared helper): lowercase, Unicode NFKD accent stripping, LaTeX brace/command stripping (`{\"o}` → `o`), punctuation removal, whitespace collapse.

### Step 2 — review_candidates

- Candidate generation is client-side over the already-loaded all_papers list. Blocking keeps it fast: pairs are only compared when they share a block key (publication year ±1, or same normalized first-author last name, or same title first-token). DOI-equal pairs always match.
- Pairs at or above the threshold are listed sorted by score descending. Each row: side-by-side title/authors/year/venue, overall score, and a per-signal breakdown.
- Per pair actions: `resolve` (go to step 3) or `not_a_dupe` (dismisses for this session).
- Empty state when nothing crosses the threshold.

### Step 3 — resolve (git-like)

For the selected pair:

1. **Field diff.** Iterate `BIBLIOGRAPHIC_FIELDS` (reused from `src/lib/publicationSync.ts`). Identical fields collapse into a summary row; conflicting fields render a left/right picker. Quick actions: `take_all_left`, `take_all_right` (the overwrite case from #145), `keep_both` (equivalent to dismiss).
2. **Survivor choice.** One paper is the survivor (defaults to the older row); the field picks form the survivor's final metadata.
3. **Vault annotations.** Vault copies are rows with `original_publication_id` → original:
   - Vaults containing only the loser's copy: copy is re-pointed to the survivor automatically (no data loss, listed in the summary).
   - Vaults containing copies of **both**: a per-vault conflict card — pick which copy's annotations (notes, vault tags) survive; the other copy is deleted.
4. **Commit.** Executed by the merge executor: update survivor fields → re-point/delete loser's vault copies → re-point `publication_tags` and `publication_relations` rows referencing the loser (skipping rows that would duplicate an existing survivor row) → delete loser. Progress + final summary toast; errors surface per-step and abort remaining steps.

### Code layout

- `src/lib/dupeDetection.ts` — normalization, similarity primitives, blocking, pair scoring, presets. Pure functions, no I/O. + `dupeDetection.test.ts`.
- `src/lib/dupeMerge.ts` — builds a merge plan (field resolutions + per-vault decisions) and executes it against Supabase. Plan builder is pure and tested (`dupeMerge.test.ts`); executor is thin.
- `src/components/publications/DuplicateCheckDialog.tsx` — the wizard UI (may split step components into `src/components/publications/dupe/` if it grows).
- `src/pages/Dashboard.tsx` — toolbar button + dialog mount, refresh library on completion.

### Import-time check upgrade (#143's original context)

`checkForDuplicate` in `ImportDialog.tsx` and `AddImportDialog.tsx` switches from exact DOI/title match to `scorePair` from `dupeDetection.ts` with the `balanced` preset. Behavior stays "warn and highlight", unchanged otherwise.

---

## Part 2 — LaTeX math in Markdown notes (issue #140)

- New deps: `remark-math`, `rehype-katex`, `katex`.
- `src/components/ui/MarkdownRenderer.tsx`:
  - `remarkMath` added to `remarkPlugins` — enables `$inline$` and `$$block$$` syntax.
  - `rehypeKatex` added to `rehypePlugins` **after** `rehypeSanitize`; the sanitize schema whitelists the math node shape remark-math emits (`code`/`span`/`div` with `math`/`math-inline`/`math-display` classes) so it survives sanitization, then KaTeX transforms it. KaTeX output itself is generated markup, not user HTML, so it is safe post-sanitize.
  - `katex/dist/katex.min.css` imported once in the renderer module.
- Renders everywhere `MarkdownRenderer` is used: publication notes, previews in the editor and fullscreen notes, publication view dialog, cards.
- Invalid TeX renders KaTeX's inline error text (non-throwing mode) rather than crashing the note.
- Tests: renderer-level tests asserting `$…$` produces KaTeX markup and that raw-HTML sanitization still holds.

---

## Testing & verification

- Unit: `dupeDetection.test.ts` (normalization incl. LaTeX/accents, similarity edge cases, blocking recall, preset thresholds), `dupeMerge.test.ts` (plan building: field picks, re-point vs delete decisions), MarkdownRenderer math tests.
- Standard gates per AGENTS.md: `npx vitest run`, `npx tsc --noEmit`, `npx eslint` on touched files.
- Manual: run dev server; exercise the wizard on a library with seeded near-duplicates; verify notes render `$e = mc^2$` and `$$\int_0^1 x\,dx$$` in editor preview and view dialog, light + dark themes.
