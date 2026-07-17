# LaTeX Math in Markdown Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `$inline$` and `$$block$$` LaTeX math in all Markdown notes (issue #140).

**Architecture:** All notes/preview surfaces render through the single shared `src/components/ui/MarkdownRenderer.tsx` (react-markdown + remark/rehype pipeline). Adding `remark-math` (syntax) and `rehype-katex` (rendering) there lights up math everywhere at once. `rehype-katex` runs **after** `rehype-sanitize`, and the math nodes survive sanitization because the existing schema already allows arbitrary `className` on `code` elements (which is where remark-math puts `math-inline` / `math-display`).

**Tech Stack:** react-markdown 10, remark-math, rehype-katex, katex. Vitest + @testing-library/react for tests (jsdom, `css: true` already configured in `vite.config.ts`).

## Global Constraints

- Never commit to `main`; work on branch `feature/latex-notes` (created from `chore/dupe-latex-spec` so the spec commit rides along in this PR).
- Spec: `docs/superpowers/specs/2026-07-17-dupe-check-and-latex-notes-design.md` (Part 2).
- Copy style per `.github/refhub-identity.md`: lowercase, `//`-style headings, snake_case in monospace contexts.
- Verification gates per AGENTS.md before every commit: `npx vitest run`, `npx tsc --noEmit`, `npx eslint <changed files>`.
- Version policy: this ships as **minor** bump `1.4.5 → 1.5.0` + `CHANGELOG.md` entry + new top entry in `src/config/changelog.ts` (next `id` is `14` — verify it is still the max+1 at execution time).

---

### Task 1: Math rendering in MarkdownRenderer

**Files:**
- Modify: `src/components/ui/MarkdownRenderer.tsx`
- Test: `src/components/ui/MarkdownRenderer.test.tsx` (new)

**Interfaces:**
- Consumes: existing `MarkdownRenderer` component (props unchanged).
- Produces: `MarkdownRenderer` renders KaTeX markup for `$…$` / `$$…$$`; no API change, so no downstream code changes.

- [ ] **Step 1: Create the branch and install dependencies**

```bash
git checkout chore/dupe-latex-spec && git checkout -b feature/latex-notes
npm install remark-math rehype-katex katex
```

Expected: the three packages appear in `package.json` dependencies; `package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

Create `src/components/ui/MarkdownRenderer.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer math support', () => {
  it('renders inline math as KaTeX markup', () => {
    const { container } = render(
      <MarkdownRenderer>{'Euler: $e^{i\\pi} + 1 = 0$'}</MarkdownRenderer>,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders block math as display-mode KaTeX', () => {
    const { container } = render(
      <MarkdownRenderer>{'$$\\int_0^1 x\\,dx$$'}</MarkdownRenderer>,
    );
    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('renders invalid TeX as error text instead of crashing', () => {
    const { container } = render(
      <MarkdownRenderer>{'$\\unknowncommand{x}$'}</MarkdownRenderer>,
    );
    // rehype-katex (throwOnError: false via errorColor) leaves the source visible
    expect(container.textContent).toContain('\\unknowncommand');
  });

  it('still strips raw HTML script tags (sanitize pipeline intact)', () => {
    const { container } = render(
      <MarkdownRenderer>{'<script>window.hacked = true;</script>ok'}</MarkdownRenderer>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('ok');
  });
});
```

- [ ] **Step 3: Run tests to verify the math ones fail**

Run: `npx vitest run src/components/ui/MarkdownRenderer.test.tsx`
Expected: the two math tests and the invalid-TeX test FAIL (no `.katex` element); the sanitize test PASSES.

- [ ] **Step 4: Add remark-math + rehype-katex to the renderer**

In `src/components/ui/MarkdownRenderer.tsx`:

Add imports after the existing plugin imports (line 9):

```tsx
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
```

Add `remarkMath` at the end of `remarkPlugins`:

```tsx
        remarkPlugins={[
          remarkGfm,
          remarkBreaks,
          [remarkFootnotes, { inlineNotes: true }],
          remarkMath,
        ]}
```

Add `rehypeKatex` at the end of `rehypePlugins` (after `rehypeHighlight`, and therefore after `rehypeSanitize` — order matters: sanitize must not run after KaTeX or it would strip KaTeX's generated markup):

```tsx
          rehypeHighlight,
          [rehypeKatex, { errorColor: 'hsl(var(--destructive))' }],
        ]}
```

No sanitize-schema change is needed: the schema already allows `className` on `code` (line 28), which is where remark-math places `language-math math-inline` / `math-display`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/MarkdownRenderer.test.tsx`
Expected: all 4 PASS. If the invalid-TeX test fails because rehype-katex throws, pass `strict: false` and `throwOnError: false` in the rehype-katex options object and re-run.

- [ ] **Step 6: Full verification gates**

```bash
npx vitest run
npx tsc --noEmit
npx eslint src/components/ui/MarkdownRenderer.tsx src/components/ui/MarkdownRenderer.test.tsx
```

Expected: all pass, no type or lint errors.

- [ ] **Step 7: Manual verification in the app**

Run: `npm run dev`, open a publication's notes editor, enter `test $e = mc^2$ and $$\int_0^1 x\,dx$$`, check:
- editor preview renders both formulas (inline + centered block)
- publication view dialog renders them
- both light and dark theme are legible

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/ui/MarkdownRenderer.tsx src/components/ui/MarkdownRenderer.test.tsx
git commit -m "Add LaTeX math rendering to Markdown notes via remark-math + KaTeX (#140)"
```

---

### Task 2: Version bump, changelogs, PR

**Files:**
- Modify: `package.json` (version), `package-lock.json`, `CHANGELOG.md`, `src/config/changelog.ts`

**Interfaces:**
- Consumes: Task 1 committed.
- Produces: release metadata; the PR.

- [ ] **Step 1: Bump version to 1.5.0**

In `package.json` set `"version": "1.5.0"`, then:

```bash
npm install --package-lock-only
```

- [ ] **Step 2: Add CHANGELOG.md entry**

Add above the `## [1.4.5]` entry:

```markdown
## [1.5.0] - 2026-07-17

### Added
- LaTeX math in Markdown notes: `$inline$` and `$$block$$` formulas now
  render via KaTeX everywhere notes are shown — editors, previews, and
  view dialogs. (#140)
```

- [ ] **Step 3: Add what's-new entry in `src/config/changelog.ts`**

Insert at the TOP of the `changelog` array (verify `id` is current max + 1; expected `14`):

```ts
  {
    id: 14,
    date: '2026-07-17',
    title: 'latex math in notes',
    features: [
      {
        tag: 'feature',
        title: 'latex formulas in markdown notes',
        description:
          'write $inline$ or $$block$$ latex math in any note — formulas render beautifully via katex in editors, previews, and paper views.',
      },
    ],
  },
```

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/config/changelog.ts
git add package.json package-lock.json CHANGELOG.md src/config/changelog.ts
git commit -m "Bump to v1.5.0 with LaTeX-notes changelog entries"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feature/latex-notes
gh pr create --title "Add LaTeX math rendering in Markdown notes (KaTeX)" --body "Closes #140.

- \`remark-math\` + \`rehype-katex\` in the shared MarkdownRenderer — \$inline\$ and \$\$block\$\$ math render in all notes, previews, and dialogs
- KaTeX runs after rehype-sanitize so the raw-HTML sanitization pipeline is unchanged (covered by test)
- invalid TeX degrades to visible source text, never crashes a note
- includes the design spec for this + the find_duplicates feature
- v1.5.0, changelog + what's-new entries

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR URL printed.
