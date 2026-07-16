# Help Center Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "restart onboarding tour" action, a Resources tab (RefHub repo list), and a placeholder AI Workflow Guides tab to the Help Center; fix a stale-dirty-flag bug that causes a spurious unsaved-changes prompt after Ctrl+S in the fullscreen notes editor; and restack the mobile onboarding footer buttons.

**Architecture:** `useOnboarding.ts` gains a module-level restart event (mirroring the existing `ONBOARDING_COMPLETED_EVENT` pattern) so the Help Center — which lives in a different part of the tree than `OnboardingWelcomeDialog` — can trigger a restart without new context plumbing. `OnboardingWelcomeDialog` resets its internal step index whenever it's told to open, and its footer gets a per-priority stacked layout on mobile. `KeyboardContext`'s `helpOverlayTab` union type grows two members; `KeyboardHelpOverlay` renders two new `TabsContent` panes and a tab-conditional "restart_tour" action, backed by a new static `src/config/resources.ts` data file. The `PublicationDialog.tsx` Ctrl+S fix is a single-line addition to an existing save handler with no new abstractions.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + @testing-library/react + jsdom, Tailwind CSS, Radix UI (Dialog/Tabs/ScrollArea), lucide-react icons.

## Global Constraints

- Follow the spec at `docs/superpowers/specs/2026-07-16-help-center-additions-design.md` — every task below implements one of its sections.
- No new runtime dependencies (no GitHub API fetch — resources list is static, per spec section 2).
- Match existing code style: lowercase mono-style UI copy (`restart_tour`, `resources`, etc.), existing Tailwind class conventions, existing `lucide-react` icon usage.
- Rendering Radix `ScrollArea` in a Vitest/jsdom test requires a `ResizeObserver` polyfill (confirmed via scratch test during planning) — add it where `KeyboardHelpOverlay` is rendered in tests, not to the global `src/test/setup.ts` (keep the polyfill scoped to the test file that needs it).
- `OnboardingWelcomeDialog` renders cleanly in RTL/jsdom with no polyfills needed (confirmed during planning).
- **`window.localStorage` is `undefined` in this repo's current Vitest/jsdom setup** (confirmed during planning: on this machine's Node 26 + Vitest 4 + jsdom 28, `typeof window.localStorage === 'undefined'` even though raw `jsdom` instantiated directly supports it fine — likely a known interaction between Node's experimental native `localStorage` global and Vitest's jsdom environment). Every task in this plan that touches `localStorage` in a test depends on Task 0 below running first.

---

### Task 0: Polyfill `localStorage` for the test environment

**Files:**
- Modify: `src/test/setup.ts`

**Interfaces:**
- Produces: a working `window.localStorage` / `globalThis.localStorage` (real `Storage`-shaped object backed by an in-memory `Map`) for every test in the suite. Consumed by Task 1's and Task 5's tests (both call `localStorage` directly).

- [ ] **Step 1: Confirm the gap**

Run: `npx vitest run --reporter=verbose -t "nonexistent"` is not useful here; instead create a throwaway check — skip if you trust the finding below, otherwise run:
```bash
cat > src/test/__scratch_ls_check.test.ts << 'EOF'
import { describe, expect, it } from 'vitest';
describe('ls check', () => {
  it('reports localStorage typeof', () => {
    expect(typeof window.localStorage).toBe('object'); // expected to currently FAIL with "undefined"
  });
});
EOF
npx vitest run src/test/__scratch_ls_check.test.ts
rm src/test/__scratch_ls_check.test.ts
```
Expected: FAIL — `expected 'undefined' to be 'object'` — confirms the gap before patching.

- [ ] **Step 2: Add the polyfill to `src/test/setup.ts`**

Replace the entire file:

```typescript
import '@testing-library/jest-dom/vitest';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

if (typeof window !== 'undefined' && !window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
  });
}
if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    configurable: true,
  });
}
```

- [ ] **Step 3: Verify the gap is closed and nothing regresses**

Run: `npx vitest run`
Expected: PASS — all 9 existing test files (31 existing tests, confirmed during planning) still pass, since none of them currently exercise a `localStorage`-dependent branch; this only changes behavior for the new tests added in Tasks 1 and 5.

- [ ] **Step 4: Commit**

```bash
git add src/test/setup.ts
git commit -m "Polyfill localStorage for Vitest/jsdom test environment"
```

---

### Task 1: `useOnboarding` restart event

**Files:**
- Modify: `src/hooks/useOnboarding.ts`
- Test: `src/hooks/useOnboarding.test.ts` (new)

**Interfaces:**
- Produces: `ONBOARDING_RESTART_EVENT: string` (exported const), `restartOnboarding(): void` (exported function) — both consumed by Task 6 (Help Center restart button).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useOnboarding.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { getOnboardingStorageKey, restartOnboarding, useOnboarding } from './useOnboarding';

const fakeUser = { id: 'user-123' } as User;

describe('useOnboarding restart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts closed when the user already dismissed onboarding', () => {
    const storageKey = getOnboardingStorageKey(fakeUser.id);
    localStorage.setItem(storageKey, 'true');

    const { result } = renderHook(() => useOnboarding(fakeUser, false));

    expect(result.current.open).toBe(false);
  });

  it('clears the dismissal flag and reopens when restartOnboarding() is called', () => {
    const storageKey = getOnboardingStorageKey(fakeUser.id);
    localStorage.setItem(storageKey, 'true');

    const { result } = renderHook(() => useOnboarding(fakeUser, false));
    expect(result.current.open).toBe(false);

    act(() => {
      restartOnboarding();
    });

    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(result.current.open).toBe(true);
  });

  it('does nothing when no user is signed in', () => {
    const { result } = renderHook(() => useOnboarding(null, false));

    act(() => {
      restartOnboarding();
    });

    expect(result.current.open).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useOnboarding.test.ts`
Expected: FAIL — `restartOnboarding` is not exported from `./useOnboarding` (import error / test 2 and the import itself fail; test 1 and 3 may pass since they don't need the new export, but the file won't even load due to the missing named export, so all 3 report as failed).

- [ ] **Step 3: Add the restart event to `useOnboarding.ts`**

In `src/hooks/useOnboarding.ts`, add the new event constant next to the existing one (near line 4):

```typescript
export const ONBOARDING_COMPLETED_EVENT = 'refhub:onboarding-completed';
export const ONBOARDING_RESTART_EVENT = 'refhub:onboarding-restart-requested';
const STORAGE_KEY_PREFIX = 'refhub_onboarding_welcome_dismissed_v1';
```

Add the dispatcher function next to `emitOnboardingCompleted` (near line 33):

```typescript
function emitOnboardingCompleted() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
}

export function restartOnboarding() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ONBOARDING_RESTART_EVENT));
}
```

Inside `useOnboarding`, add a listener effect right after the existing `waitForAppShell` effect (after the effect that closes with `return () => { cancelled = true; window.clearTimeout(timeoutId); };`, before `const dismiss = ...`):

```typescript
  useEffect(() => {
    if (!storageKey) return undefined;

    const handleRestart = () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage failures; still reopen for this session.
      }
      setOpen(true);
    };

    window.addEventListener(ONBOARDING_RESTART_EVENT, handleRestart);
    return () => window.removeEventListener(ONBOARDING_RESTART_EVENT, handleRestart);
  }, [storageKey]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useOnboarding.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOnboarding.ts src/hooks/useOnboarding.test.ts
git commit -m "Add restartOnboarding() to reopen the onboarding tour on demand"
```

---

### Task 2: Reset onboarding step index on reopen

**Files:**
- Modify: `src/components/ui/OnboardingWelcomeDialog.tsx`
- Test: `src/components/ui/OnboardingWelcomeDialog.test.tsx` (new)

**Interfaces:**
- Consumes: existing `OnboardingWelcomeDialogProps` (`open`, `onOpenChange`, `onOpenGuide`) — unchanged.
- Produces: nothing new for other tasks; this is a self-contained behavior fix.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/OnboardingWelcomeDialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWelcomeDialog } from './OnboardingWelcomeDialog';

describe('OnboardingWelcomeDialog step reset', () => {
  it('resets to step 1 when reopened after navigating forward', () => {
    const onOpenChange = vi.fn();
    const onOpenGuide = vi.fn();
    const { rerender } = render(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    expect(screen.getByText('create vaults')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText('import and discover')).toBeInTheDocument();

    rerender(
      <OnboardingWelcomeDialog open={false} onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );
    rerender(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    expect(screen.getByText('create vaults')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/OnboardingWelcomeDialog.test.tsx`
Expected: FAIL — after the close/reopen `rerender` calls, `screen.getByText('create vaults')` throws `Unable to find an element with the text: create vaults` because `stepIndex` is still `1` ("import and discover").

- [ ] **Step 3: Reset `stepIndex` when `open` becomes true**

In `src/components/ui/OnboardingWelcomeDialog.tsx`, add `useEffect` to the import (line 2):

```typescript
import { useEffect, useMemo, useState } from 'react';
```

Add the reset effect right after the `stepIndex`/`activeStep` declarations (after line 70, before `const isFirstStep = ...`):

```typescript
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  const activeStep = ONBOARDING_STEPS[stepIndex];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/OnboardingWelcomeDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/OnboardingWelcomeDialog.tsx src/components/ui/OnboardingWelcomeDialog.test.tsx
git commit -m "Reset onboarding tour to step 1 whenever it reopens"
```

---

### Task 3: Restack mobile onboarding footer buttons

**Files:**
- Modify: `src/components/ui/OnboardingWelcomeDialog.tsx`
- Test: `src/components/ui/OnboardingWelcomeDialog.test.tsx` (extend from Task 2)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — purely a layout fix, verified by DOM order/structure assertions since jsdom doesn't compute real layout/wrapping.

- [ ] **Step 1: Write the failing test**

Add to `src/components/ui/OnboardingWelcomeDialog.test.tsx` (new `describe` block, same file):

```tsx
describe('OnboardingWelcomeDialog mobile footer layout', () => {
  it('renders the primary action, secondary row, and skip link as three distinct rows', () => {
    const onOpenChange = vi.fn();
    const onOpenGuide = vi.fn();
    render(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    const footer = screen.getByRole('button', { name: /^next$/i }).closest('footer');
    expect(footer).not.toBeNull();

    const rows = footer!.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(3);

    // Row 1: primary action, full width on mobile
    expect(rows[0]).toHaveClass('w-full');
    expect(rows[0].querySelector('button')).toHaveTextContent(/next/i);

    // Row 2: secondary actions (back always present; "open guide" only on last step)
    expect(rows[1].querySelectorAll('button')).toHaveLength(1);
    expect(rows[1].querySelector('button')).toHaveTextContent(/back/i);

    // Row 3: skip, de-emphasized text link
    expect(rows[2]).toHaveTextContent(/skip/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/OnboardingWelcomeDialog.test.tsx`
Expected: FAIL — current footer is a single `<div className="flex flex-col-reverse ...">` with two direct children (skip button, then a wrapping div with back/open-guide/open-app), not a `<footer>` with 3 direct `div` rows, so `footer` is `null` and the test throws.

- [ ] **Step 3: Replace the footer markup**

In `src/components/ui/OnboardingWelcomeDialog.tsx`, replace the existing footer block (the `<div className="flex flex-col-reverse gap-2 ...">...</div>` that currently sits right before the closing `</DialogContent>`, matching from `<div className="flex flex-col-reverse gap-2 border-t...` through its matching closing `</div>`):

```tsx
          <footer className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row-reverse sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <Button
                variant="glow"
                className="w-full font-mono sm:w-auto"
                onClick={isLastStep ? handleOpenApp : handleNext}
              >
                {isLastStep ? (
                  'open app'
                ) : (
                  <>
                    next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <Button
                variant="outline"
                className="font-mono"
                onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
                disabled={isFirstStep}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                back
              </Button>
              {isLastStep && (
                <Button variant="outline" className="font-mono" onClick={handleOpenGuide}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  open guide
                </Button>
              )}
            </div>
            <div className="flex justify-center sm:justify-start">
              <Button
                variant="ghost"
                className="font-mono text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                skip
              </Button>
            </div>
          </footer>
```

This keeps the same handlers (`handleNext`, `handleOpenApp`, `handleOpenGuide`, `setStepIndex`, `onOpenChange`) and the same conditional (`isLastStep`) — only the layout container and row grouping change. On mobile (`flex-col`), rows render in source order: primary action first (full width), then back/open-guide, then skip as a de-emphasized link at the bottom, each its own row `div` (verified directly: this exact markup was rendered against the Step 1 test during planning and passed). On `sm:` and up, `flex-row-reverse` + `justify-between` restores a layout equivalent to the original three-zone footer (skip on the left, back/open-guide/primary grouped on the right, primary rightmost).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/OnboardingWelcomeDialog.test.tsx`
Expected: PASS (all 3 tests across both `describe` blocks)

- [ ] **Step 5: Manually verify on a narrow viewport**

Run: `npm run dev`, open the app in a browser, resize to ~375px width (or use device toolbar), clear the onboarding localStorage key (`localStorage.removeItem('refhub_onboarding_welcome_dismissed_v1:<your-user-id>')` in devtools console, or just use the restart button from Task 6 once implemented) and confirm the footer now reads, top to bottom: full-width "open app"/"next" button, then "back" (+ "open guide" on the last step), then a centered "skip" link — no orphaned right-aligned button.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/OnboardingWelcomeDialog.tsx src/components/ui/OnboardingWelcomeDialog.test.tsx
git commit -m "Restack mobile onboarding footer buttons by priority"
```

---

### Task 4: Resources data file

**Files:**
- Create: `src/config/resources.ts`
- Test: `src/config/resources.test.ts` (new)

**Interfaces:**
- Produces: `export interface RefHubResource { name: string; description: string; url: string }`, `export const resources: RefHubResource[]` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `src/config/resources.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { resources } from './resources';

describe('resources config', () => {
  it('has at least one entry, each with a non-empty name, description, and a refhub-io GitHub URL', () => {
    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      expect(resource.name.length).toBeGreaterThan(0);
      expect(resource.description.length).toBeGreaterThan(0);
      expect(resource.url).toMatch(/^https:\/\/github\.com\/refhub-io\//);
    }
  });

  it('has no duplicate names or URLs', () => {
    const names = resources.map((r) => r.name);
    const urls = resources.map((r) => r.url);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/resources.test.ts`
Expected: FAIL — `Cannot find module './resources'` (file doesn't exist yet)

- [ ] **Step 3: Create `src/config/resources.ts`**

```typescript
/**
 * Static list of public RefHub GitHub repositories, shown in the Help
 * Center's Resources tab. Update when a repo is added, archived, or renamed.
 */

export interface RefHubResource {
  name: string;
  description: string;
  url: string;
}

export const resources: RefHubResource[] = [
  {
    name: 'refhub.io',
    description: 'the frontend product and help center — this app.',
    url: 'https://github.com/refhub-io/refhub.io',
  },
  {
    name: '.netlify',
    description: 'serverless backend / api layer.',
    url: 'https://github.com/refhub-io/.netlify',
  },
  {
    name: 'refhub-skill',
    description: 'mcp skill for agents to read, write, and manage refhub vaults.',
    url: 'https://github.com/refhub-io/refhub-skill',
  },
  {
    name: 'refhub-mcp',
    description: 'mcp server implementation backing the refhub agent integrations.',
    url: 'https://github.com/refhub-io/refhub-mcp',
  },
  {
    name: 'refhub-extensions',
    description: 'browser extensions (chrome, edge, firefox) for sending pages into refhub.',
    url: 'https://github.com/refhub-io/refhub-extensions',
  },
  {
    name: 'refhub-cli',
    description: 'command-line client for scripting and agent workflows (npm i @refhub/cli).',
    url: 'https://github.com/refhub-io/refhub-cli',
  },
  {
    name: 'refhub-qr',
    description: 'qr code generation for sharing vaults and publications.',
    url: 'https://github.com/refhub-io/refhub-qr',
  },
  {
    name: 'refhub-ascii',
    description: 'ascii/terminal art for refhub branding (e.g. fastfetch).',
    url: 'https://github.com/refhub-io/refhub-ascii',
  },
  {
    name: 'refhub-paper-drafter',
    description: 'agent skill for drafting hci/visualization research papers from a vault and local notes.',
    url: 'https://github.com/refhub-io/refhub-paper-drafter',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/resources.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/resources.ts src/config/resources.test.ts
git commit -m "Add static RefHub repository list for the Resources tab"
```

---

### Task 5: Widen `helpOverlayTab` type in `KeyboardContext`

**Files:**
- Modify: `src/contexts/KeyboardContext.tsx`
- Test: `src/contexts/KeyboardContext.test.tsx` (new)

**Interfaces:**
- Produces: `helpOverlayTab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows'`, `openHelpOverlay: (tab?: 'keyboard' | 'guide' | 'resources' | 'ai-workflows') => void`, `setHelpOverlayTab: (tab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows') => void` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/KeyboardContext.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyboardProvider, useKeyboardContext } from './KeyboardContext';

describe('KeyboardContext help overlay tabs', () => {
  it('opens directly to the resources and ai-workflows tabs', () => {
    const { result } = renderHook(() => useKeyboardContext(), {
      wrapper: KeyboardProvider,
    });

    act(() => {
      result.current.openHelpOverlay('resources');
    });
    expect(result.current.helpOverlayTab).toBe('resources');
    expect(result.current.helpOverlayOpen).toBe(true);

    act(() => {
      result.current.openHelpOverlay('ai-workflows');
    });
    expect(result.current.helpOverlayTab).toBe('ai-workflows');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/contexts/KeyboardContext.test.tsx`
Expected: FAIL — TypeScript error / runtime mismatch: `'resources'` is not assignable to `'keyboard' | 'guide'`, so the test file fails to type-check and run.

- [ ] **Step 3: Widen the type in `KeyboardContext.tsx`**

Update all four occurrences of the `'keyboard' | 'guide'` union to `'keyboard' | 'guide' | 'resources' | 'ai-workflows'`:

Line 77 (`KeyboardState` interface):
```typescript
  /** Active tab in the help center. */
  helpOverlayTab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows';
```

Line 110 (`KeyboardContextValue` interface, `setHelpOverlayTab`):
```typescript
  /** Set the active help center tab. */
  setHelpOverlayTab: (tab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows') => void;
```

Line 112 (`KeyboardContextValue` interface, `openHelpOverlay`):
```typescript
  /** Open the help center to a specific tab. */
  openHelpOverlay: (tab?: 'keyboard' | 'guide' | 'resources' | 'ai-workflows') => void;
```

Line 130 (`useState` initializer):
```typescript
  const [helpOverlayTab, setHelpOverlayTab] = useState<'keyboard' | 'guide' | 'resources' | 'ai-workflows'>('keyboard');
```

Line 226 (`openHelpOverlay` implementation):
```typescript
  const openHelpOverlay = useCallback((tab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows' = 'keyboard') => {
    setHelpOverlayTab(tab);
    setHelpOverlayOpen(true);
  }, []);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/contexts/KeyboardContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/contexts/KeyboardContext.tsx src/contexts/KeyboardContext.test.tsx
git commit -m "Widen help overlay tab type to include resources and ai-workflows"
```

---

### Task 6: Help Center UI — Resources tab, AI Workflow Guides tab, restart button

**Files:**
- Modify: `src/components/ui/KeyboardHelpOverlay.tsx`
- Modify: `src/content/help-guide.md`
- Test: `src/components/ui/KeyboardHelpOverlay.test.tsx` (new)

**Interfaces:**
- Consumes: `restartOnboarding` from `@/hooks/useOnboarding` (Task 1), `resources` from `@/config/resources` (Task 4), the widened `helpOverlayTab` type (Task 5).

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/KeyboardHelpOverlay.test.tsx`:

```tsx
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider, useKeyboardContext } from '@/contexts/KeyboardContext';
import { resources } from '@/config/resources';
import * as onboardingModule from '@/hooks/useOnboarding';
import { KeyboardHelpOverlay } from './KeyboardHelpOverlay';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    // jsdom doesn't implement ResizeObserver; Radix ScrollArea needs it to mount.
    // @ts-expect-error test-only polyfill
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function Harness({ tab }: { tab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows' }) {
  const { openHelpOverlay } = useKeyboardContext();
  useEffect(() => {
    openHelpOverlay(tab);
  }, [openHelpOverlay, tab]);
  return <KeyboardHelpOverlay />;
}

describe('KeyboardHelpOverlay new tabs', () => {
  it('lists every configured resource with a working link on the resources tab', async () => {
    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="resources" />
        </KeyboardProvider>,
      );
    });

    expect(await screen.findByRole('tab', { name: /resources/i })).toHaveAttribute(
      'data-state',
      'active',
    );

    for (const resource of resources) {
      const link = screen.getByRole('link', { name: new RegExp(resource.name, 'i') });
      expect(link).toHaveAttribute('href', resource.url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('shows a coming-soon placeholder on the ai-workflows tab', async () => {
    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="ai-workflows" />
        </KeyboardProvider>,
      );
    });

    expect(await screen.findByRole('tab', { name: /ai.workflows/i })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('shows a restart_tour button only on the guide tab, which closes the overlay and restarts onboarding', async () => {
    const restartSpy = vi.spyOn(onboardingModule, 'restartOnboarding');

    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="keyboard" />
        </KeyboardProvider>,
      );
    });
    expect(screen.queryByRole('button', { name: /restart_tour/i })).not.toBeInTheDocument();

    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="guide" />
        </KeyboardProvider>,
      );
    });

    const restartButton = await screen.findByRole('button', { name: /restart_tour/i });
    await act(async () => {
      restartButton.click();
    });

    expect(restartSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/KeyboardHelpOverlay.test.tsx`
Expected: FAIL — no `resources` or `ai-workflows` tab exists yet (`getByRole('tab', { name: /resources/i })` finds nothing), and there is no `restart_tour` button.

- [ ] **Step 3: Update `src/content/help-guide.md`**

Replace the stale repo bullet list (the `### where can i find the refhub repositories?` section) so it points at the new tab instead of duplicating an unmaintained list:

```markdown
### where can i find the refhub repositories?

open the **resources** tab in this help center (the `?` menu) for the full, current list of refhub repositories with descriptions and links. it covers the frontend, backend, cli, mcp/agent integrations, and browser extensions.
```

- [ ] **Step 4: Update `src/components/ui/KeyboardHelpOverlay.tsx`**

Update the imports (replace lines 1–20):

```typescript
import { useState, useCallback } from 'react';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import { useHotkeys } from '@/hooks/useKeyboardNavigation';
import { SHORTCUT_HELP, formatCombo } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import helpGuide from '@/content/help-guide.md?raw';
import { resources } from '@/config/resources';
import { restartOnboarding } from '@/hooks/useOnboarding';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { BookOpen, Copy, Check, Keyboard, FolderGit2, ExternalLink, Bot, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
```

Add the restart handler inside the component, right after `handleCopy` (after line 72, before the `return (`):

```typescript
  const handleRestartTour = useCallback(() => {
    setHelpOverlayOpen(false);
    restartOnboarding();
  }, [setHelpOverlayOpen]);
```

Replace the header action block (lines 86–100, the `{helpOverlayTab === 'keyboard' && (...)}` block) with a block that switches on both tabs:

```tsx
            {helpOverlayTab === 'keyboard' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="w-3 h-3 mr-1 text-accent" />
                ) : (
                  <Copy className="w-3 h-3 mr-1" />
                )}
                {copied ? 'copied!' : 'copy_all'}
              </Button>
            )}
            {helpOverlayTab === 'guide' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestartTour}
                className="h-7 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                restart_tour
              </Button>
            )}
```

Replace the `TabsList` (lines 106–115) with a 4-column version, icon-only on mobile:

```tsx
            <TabsList className="grid w-full grid-cols-4 font-mono">
              <TabsTrigger value="keyboard" className="gap-2 text-xs">
                <Keyboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">keyboard</span>
              </TabsTrigger>
              <TabsTrigger value="guide" className="gap-2 text-xs">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">guide</span>
              </TabsTrigger>
              <TabsTrigger value="resources" className="gap-2 text-xs">
                <FolderGit2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">resources</span>
              </TabsTrigger>
              <TabsTrigger value="ai-workflows" className="gap-2 text-xs">
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ai_workflows</span>
              </TabsTrigger>
            </TabsList>
```

Add two new `TabsContent` panes right after the existing `guide` pane's closing `</TabsContent>` (after line 184, before the closing `</Tabs>`):

```tsx
          <TabsContent value="resources" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-full max-h-full">
              <div className="p-6 space-y-3">
                {resources.map((resource) => (
                  <a
                    key={resource.url}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm px-4 py-3 hover:border-primary/40 hover:bg-card/90 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-foreground">{resource.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{resource.description}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="ai-workflows" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <h3 className="font-mono text-base font-semibold">ai_workflow_guides()</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                guides for using refhub with ai agents and workflows are coming soon.
              </p>
            </div>
          </TabsContent>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ui/KeyboardHelpOverlay.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS (all existing tests plus the new ones from Tasks 1–6)

- [ ] **Step 7: Manually verify in the browser**

Run: `npm run dev`. Press `?` to open the Help Center. Confirm: 4 tabs visible, resources tab lists all 9 repos with working external links, ai_workflows tab shows the coming-soon placeholder, and clicking "restart_tour" on the guide tab closes the Help Center and immediately reopens the onboarding tour at step 1. Resize to mobile width and confirm the tab bar shows icons only (no crowding/overflow).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/KeyboardHelpOverlay.tsx src/components/ui/KeyboardHelpOverlay.test.tsx src/content/help-guide.md
git commit -m "Add Resources and AI Workflow Guides tabs, restart_tour action"
```

---

### Task 7: Fix Ctrl+S stale dirty-flag in fullscreen notes editor

**Files:**
- Modify: `src/components/publications/PublicationDialog.tsx`

**Interfaces:**
- Consumes: existing `fullscreenCleanNotesRef`, `formDataRef`, `notesFullscreen` — all already defined in this file (lines 182, 187, and the `notesFullscreen` state declared earlier in the component).
- Produces: nothing consumed by other tasks — this is a standalone bug fix.

**Root cause (already diagnosed):** Two separate code paths save the fullscreen notes editor:
1. Clicking the "save" button calls `handleFullscreenSave` (~line 353), which updates `fullscreenCleanNotesRef.current = formData.notes` after a successful save.
2. Pressing Ctrl+S fires the global hotkey handler registered via `useHotkeys('dialog', [...])` (~line 208–254), which has its own independent save logic and does **not** update `fullscreenCleanNotesRef`.

Because `handleExitFullscreen` (~line 385) checks `formData.notes !== fullscreenCleanNotesRef.current` to decide whether to show the unsaved-changes prompt, a Ctrl+S save followed by Escape leaves the stale ref pointing at the pre-edit snapshot, so the prompt fires even though the save succeeded.

**No automated test for this task.** `PublicationDialog` requires a full app context (`useAuth`, live Google Drive status fetch via `fetchGoogleDriveStatus`, `usePublicationRelations` data fetching, `KeyboardProvider`) with no existing mocks or test harness in this codebase (confirmed: no test file exists for this component, and none of its dependencies are currently mocked anywhere in the test suite). Building that harness from scratch is disproportionate to a one-line fix whose root cause is already fully diagnosed above; verify manually instead (Step 2).

- [ ] **Step 1: Add the ref update to the Ctrl+S hotkey handler**

In `src/components/publications/PublicationDialog.tsx`, inside the `useHotkeys('dialog', [...])` call (~line 208), update the `doSave` function's success path. Find:

```typescript
              await onSave(
                { ...formDataRef.current, authors, editor, keywords: kw },
                selectedTagsRef.current,
                publication ? undefined : selectedVaultIds,
                true, // isAutoSave
                undefined,
                notesFullscreen ? fullscreenSaveFeedbackRef : footerSaveFeedbackRef,
              );
              setModifiedFields(new Set());
              setLastSavedAt(new Date());
            } finally {
              setSaving(false);
            }
          };
          doSave();
          return true;
        },
        allowInInput: true,
      },
    ],
    [open, publication, selectedVaultIds, onSave, notesFullscreen],
  );
```

Replace with:

```typescript
              await onSave(
                { ...formDataRef.current, authors, editor, keywords: kw },
                selectedTagsRef.current,
                publication ? undefined : selectedVaultIds,
                true, // isAutoSave
                undefined,
                notesFullscreen ? fullscreenSaveFeedbackRef : footerSaveFeedbackRef,
              );
              setModifiedFields(new Set());
              setLastSavedAt(new Date());
              if (notesFullscreen) {
                fullscreenCleanNotesRef.current = formDataRef.current.notes ?? '';
              }
            } finally {
              setSaving(false);
            }
          };
          doSave();
          return true;
        },
        allowInInput: true,
      },
    ],
    [open, publication, selectedVaultIds, onSave, notesFullscreen],
  );
```

(`fullscreenCleanNotesRef` and `formDataRef` are refs with stable identity — no dependency array change needed.)

- [ ] **Step 2: Manually verify the fix**

Run: `npm run dev`. Open any publication, open its notes in fullscreen, type a change, press **Ctrl+S**, then press **Escape**. Confirm the editor exits fullscreen immediately with no "unsaved changes" prompt. As a regression check, repeat but click the **save** button instead of Ctrl+S before pressing Escape — confirm that path still exits cleanly too. As a second regression check, make an edit, press Escape **without** saving first — confirm the unsaved-changes prompt still appears (so the fix doesn't suppress the prompt when there's a genuine unsaved change).

- [ ] **Step 3: Commit**

```bash
git add src/components/publications/PublicationDialog.tsx
git commit -m "Fix stale dirty-flag ref after Ctrl+S save in fullscreen notes editor"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (restart) → Tasks 1, 6. Section 2 (Resources tab) → Tasks 4, 6. Section 3 (AI Workflow Guides) → Task 6. Section 4 (tab bar layout) → Tasks 5, 6. Out-of-scope bug fixes → Tasks 3 (mobile footer) and 7 (Ctrl+S).
- **Placeholder scan:** No TODOs/TBDs in code changes. Task 7 has no automated test by design, with the reasoning stated explicitly rather than left implicit.
- **Type consistency:** `RefHubResource`, `resources`, `ONBOARDING_RESTART_EVENT`, `restartOnboarding`, and the widened `helpOverlayTab` union are named and typed identically everywhere they're produced (Tasks 1, 4, 5) and consumed (Task 6).
