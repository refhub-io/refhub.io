# refhub.io — identify, aesthetics, style guidelines

> // coding_styling_and_dev_conventions for refhub.io

## Project Identity

refhub.io is a modern reference management platform for organizing academic publications, building citation networks, and sharing research collections. Built for the **command-line generation** — the visual identity is bold, dark-first, and developer/researcher-flavored with monospace accents, a neon color palette, subtle glow effects, and a clean data-dense UI. The whole experience should feel like a well-designed CLI tool that happens to live in the browser.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript 5.x + Vite 7.x |
| Package Manager | Bun |
| UI Components | shadcn/ui (Radix primitives + CVA variants) |
| Styling | Tailwind CSS 3.x with HSL CSS variable theming |
| Backend | Supabase (PostgreSQL + RLS + Auth + Realtime) |
| State | TanStack Query v5 (React Query) + Context API |
| Routing | React Router v6 |
| Forms | React Hook Form + Zod validation |
| Charts | Recharts (with shadcn/ui `ChartContainer` wrapper) |
| Graphs | react-force-graph-2d |
| Icons | Lucide React |
| Fonts | Plus Jakarta Sans (body/display), JetBrains Mono (mono/code) |

## Directory Structure

```
src/
├── components/
│   ├── ui/             # shadcn/ui primitives (button, card, dialog, etc.)
│   ├── layout/         # Shell components (Sidebar, VaultLayout, ThemeToggle)
│   ├── publications/   # Publication-specific components
│   ├── tags/           # Tag management components
│   ├── vaults/         # Vault management components
│   ├── notifications/  # Notification components
│   └── profile/        # Profile components
├── contexts/           # React Context providers (VaultContent, Keyboard)
├── hooks/              # Custom hooks (useAuth, useVaultAccess, etc.)
├── integrations/       # External service clients (Supabase)
├── lib/                # Utility libraries (bibtex, export, tagHierarchy, etc.)
├── pages/              # Route-level page components
├── types/              # TypeScript type definitions
└── config/             # App configuration (kbd.config.ts for keybindings)
```

## Keyboard-First Interaction

refhub is built **keyboard-first**. Every primary action should be reachable without a mouse. The keyboard system is inspired by **nvim/vim** keybindings and implemented through a layered architecture:

### Architecture
- **`src/config/kbd.config.ts`** — single source of truth for all keybindings. Every shortcut is defined here with combo strings and descriptions.
- **`src/lib/keyboard.ts`** — low-level utilities: key normalization, combo parsing, chord detection, cross-platform modifier mapping (Meta↔Ctrl).
- **`src/contexts/KeyboardContext.tsx`** — global provider with context stack (push/pop), shortcut registration, roving focus, multi-select state, and analytics.
- **`src/hooks/useKeyboardNavigation.tsx`** — full list navigation hook: `j`/`k` movement, `g g`/`G` jumps, `Space` toggle select, `Shift+Space` range select, `v` toggle view, `d` delete.

### Key Conventions
- **vim-style navigation**: `j`/`k` for up/down, `g g` / `G` for first/last, `Enter` to open.
- **Modifier combos**: `Ctrl+S` save, `Ctrl+E` export, `Ctrl+A` select all, `Ctrl+D` deselect.
- **Context-aware**: shortcuts are scoped to contexts (`global`, `vault-list`, `publication-list`, `dialog`, `editor`, `export`). Contexts push/pop as dialogs open/close.
- **`?` opens the help overlay** — always available, shows all active shortcuts.
- **Number keys `1`–`9`** jump directly to vaults by index.
- **Cross-platform**: `Meta` (Mac ⌘) and `Ctrl` (Windows/Linux) are normalized transparently.
- **Never steal focus from inputs**: shortcuts are suppressed when the user is typing in an editable field.

### When Adding New Features
- Always add keyboard shortcuts for primary actions.
- Register shortcuts in `kbd.config.ts` first, then wire them via `useHotkeys` or `useKeyboardNavigation`.
- Use `pushContext`/`popContext` for dialogs and overlays.
- Test that `?` overlay shows the new shortcuts.

## Coding Conventions

### TypeScript
- Strict mode. All types defined in `src/types/`.
- Use `interface` for component props; `type` for unions/utilities.
- Prefer `const` assertions for static arrays/objects (`as const`).
- Export named functions, not default exports (exception: page components use default).

### React Patterns
- **Functional components only** — no class components.
- **`React.forwardRef`** for all reusable UI primitives.
- **CVA (class-variance-authority)** for component variant systems.
- **Compound components** for complex UI (e.g., `Card`, `CardHeader`, `CardContent`).
- **Custom hooks** in `src/hooks/` — prefix with `use`.
- **Context + Provider** for shared state; keep contexts focused and narrow.
- **`useMemo`/`useCallback`** for expensive computations and stable references.
- **`useRef`** for mutable values that don't trigger re-renders (pending updates, timers, etc.).

### State Management
- **TanStack Query** for server state (fetching, caching, mutations).
- **React Context** for cross-component UI state (vault content, keyboard shortcuts).
- **Local `useState`** for component-scoped UI state.
- **IndexedDB (idb-keyval)** for page-level cache persistence.
- **Optimistic updates** — update UI immediately, reconcile on server response.
- **Realtime subscriptions** via Supabase channels for collaborative features.

### Data Fetching
- Use `Promise.all` for parallel independent queries.
- Deduplicate by ID when aggregating across sources.
- Always handle loading/error/empty states.
- Use phased loading indicators for multi-step data fetches.

## Visual Style Guide

### Color System (HSL CSS Variables)
```
Primary:    purple  (262 83% 65%)   — actions, links, focus rings
Accent:     green   (142 71% 50%)   — success, highlights, secondary CTA
Destructive: red    (0 72% 51%)     — errors, delete actions
Neon palette:
  green:    142 76% 55%
  purple:   262 83% 65%
  pink:     330 81% 65%
  blue:     199 89% 55%
  orange:   24 95% 58%
```

### Dark Mode (Default)
- Background: very dark `240 6% 6%`
- Card: slightly lighter `240 6% 9%`
- Foreground: near-white `0 0% 95%`
- Muted text: `240 5% 55%`
- Borders: subtle `240 5% 18%`
- **Dark is the default**. Light mode is secondary.

### Typography
- **Headings & body**: `Plus Jakarta Sans` — clean, modern sans-serif.
- **Code, labels, badges, data**: `JetBrains Mono` — monospace for that dev/research feel.
- Comment-style headings: `// section_name` in monospace (e.g., `// graph`, `// filters`).
- Snake_case in UI labels where monospace is used (e.g., `3_papers • 5_links`).

### Component Styling
- Rounded corners: `rounded-lg` (0.75rem base radius).
- Borders: 1px subtle borders, elevated cards use `border-2`.
- Shadows: minimal — prefer border definition over drop shadows.
- Glass effect: `bg-card/95 backdrop-blur-xl` for floating panels/dialogs.
- Gradients: purple→pink (`bg-gradient-primary`), green→blue (`bg-gradient-accent`).
- Glow effects: `glow-purple`, `glow-green` for emphasis (sparingly).
- **Noise texture**: `bg-noise` overlay at 3% opacity on hero sections.

### Animations
- **Subtle and purposeful** — no gratuitous motion.
- Entry: `fade-in` (0.4s), `slide-up` (0.5s), `scale-in` (0.3s).
- Use `cubic-bezier(0.16, 1, 0.3, 1)` easing for natural feel.
- Loading: shimmer animation for skeleton states.
- Transitions: `transition-all duration-200` for interactive elements.

### Layout Patterns
- **Dialogs**: shadcn `Dialog` with `max-w-6xl w-[95vw]` for full views.
- **Mobile**: 95vw width, reduced padding (`p-3` vs `p-6`).
- **Responsive**: `sm:` breakpoint for mobile→desktop transitions.
- **Scrollable areas**: `scrollbar-thin` custom class.
- **Empty states**: centered monospace comment `// no data yet`.

### Data Visualization Style
- **Graph nodes**: small circles (4px radius), purple fill `hsl(260, 80%, 60%)`.
- **Graph links**: colored by relationship type, 2px width.
- **Labels**: monospace font, dark background pill, offset below node.
- **Chart colors**: use the neon palette variables.
- **Chart tooltips**: dark `bg-background` with `border-border/50`, `shadow-xl`.
- **Legends**: inline flex, small color indicators + monospace labels.
- Always use shadcn's `ChartContainer` wrapper for Recharts components.

### Interaction Patterns
- **Badges**: `font-mono text-xs` with `variant="outline"` for metadata.
- **Buttons**: `rounded-xl`, `gap-2`, various CVA variants.
- **Hover states**: opacity changes, scale nudges (`hover:scale-[1.02]`), bg shifts.
- **Focus**: ring-based focus indicators via Tailwind.
- **Click-to-navigate**: graph nodes → open publication, list items → open detail.

## Copywriting & Wording

refhub's voice is **terse, technical, and lowercase**. The UI reads like well-commented source code, not a marketing page. Everything is written for someone who lives in a terminal.

### Core Rules
1. **`//` prefix for section headers and empty states.** This is the signature pattern — section labels look like code comments.
   - `// graph`, `// filters`, `// timeline`, `// tags`
   - `// no paper relationships to visualize yet`
   - `// loading the codex...`
   - `// no collections match your search`
2. **lowercase always.** No title case, no sentence case in UI chrome. Headings, labels, badges, legends, tooltips — all lowercase.
   - correct: `// collection_analytics`
   - wrong: `// Collection Analytics` or `Collection Analytics`
3. **snake_case for monospace contexts.** Anywhere `font-mono` is used — badges, stats, legends, loading phases — use underscores instead of spaces.
   - `12_papers • 5_links`
   - `loading_vault_metadata`
   - `syncing_tags`
   - `mapping_connections`
4. **`•` (bullet) as separator** in inline stats and badge strings. Not pipes, not slashes.
   - `42_papers • 8_tags • 3_links`
5. **Short, declarative phrases.** No articles ("the", "a"), no filler words. Direct and imperative where possible.
   - correct: `export selected`, `open vault settings`
   - wrong: `Export the selected items`, `Open the vault settings dialog`
6. **snake_case in meta/SEO** contexts too: `// your_research_organized`, `organize_papers • build_collections`.
7. **Descriptions and longer text** (vault descriptions, abstracts, tooltips with explanation) can use normal sentence case and spacing — the snake_case/comment style is for **UI chrome** only.

### Phrasing Patterns by Context
| Context | Pattern | Example |
|---------|---------|---------|
| Section heading | `// {name}` | `// graph`, `// timeline` |
| Empty state | `// no {things} yet` | `// no tags assigned yet` |
| Loading state | `// loading {thing}...` | `// loading public vault...` |
| Badge / stat | `{n}_{noun} • {n}_{noun}` | `12_papers • 5_links` |
| Phase indicator | `{verb}_{noun}` | `fetching_publications`, `mapping_relations` |
| Page title | `refhub.io \| // {slug}` | `refhub.io \| // your_research_organized` |
| Button label | lowercase imperative | `export`, `add paper`, `fork vault` |
| Menu item | lowercase phrase | `open relationship graph`, `edit vault settings` |
| Error | `// {what went wrong}` | `// failed to load vault` |
| Confirmation | lowercase question | `delete 3 publications?` |

### Words to Prefer
| Use | Instead of |
|-----|-----------|
| vault | collection, folder, project |
| paper / publication | document, item, entry |
| tag | label, category (unless referring to vault categories) |
| codex | explore, browse, discover |
| fork | copy, duplicate, clone |
| link / relation | connection, edge, reference |

## Performance Guidelines
- Lazy-load heavy components (graphs, charts) with `React.lazy` + `Suspense`.
- Use `ResizeObserver` for responsive canvas/chart sizing.
- Debounce expensive operations (search, filter, realtime).
- Cache aggressively with IndexedDB for instant page restoration.
- Use Vite manual chunks for vendor splitting (chart-libs, etc.).

## Testing
- Vitest for unit tests.
- Test utilities and data transformations, not UI implementation details.

## Supabase / Backend
- **Row Level Security (RLS)** on all tables — never bypass.
- Vault-scoped permissions: owner / editor / viewer roles.
- Realtime channels per vault: `vault-content-sync-${vaultId}`.
- Always filter data by `user_id` or vault membership.
