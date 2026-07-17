/**
 * App changelog — add a new entry at the TOP of the array to trigger a "What's new" notification.
 * Increment `id` by 1 each time. The localStorage key stores the highest seen id.
 */

export type ChangelogTag = 'feature' | 'improvement' | 'fix';

export interface ChangelogFeature {
  tag: ChangelogTag;
  title: string;
  description: string;
}

export interface ChangelogEntry {
  /** Incrementing integer. Bump this to trigger the notification for all users. */
  id: number;
  date: string;
  title: string;
  features: ChangelogFeature[];
}

const changelog: ChangelogEntry[] = [
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
  {
    id: 13,
    date: '2026-07-17',
    title: 'help center: resources and restart tour',
    features: [
      {
        tag: 'feature',
        title: 'resources tab',
        description:
          'the help center now lists and links every refhub repository (cli, extensions, mcp server, and more) in a new resources tab.',
      },
      {
        tag: 'feature',
        title: 'restart the onboarding tour',
        description:
          'replay the interactive onboarding walkthrough anytime from the help center guide tab.',
      },
      {
        tag: 'fix',
        title: 'ctrl+s in fullscreen notes',
        description:
          'saving fullscreen notes with ctrl+s no longer triggers a false "unsaved changes" prompt when you exit right after.',
      },
    ],
  },
  {
    id: 12,
    date: '2026-07-15',
    title: 'faster, more resilient paper discovery',
    features: [
      {
        tag: 'improvement',
        title: 'smarter paper discovery',
        description:
          'related papers, references, citations, doi lookups, and topic search now try openalex first with automatic fallback to semantic scholar, and vault augmentation fetches recommendations in fewer, larger batched requests -- broader coverage, faster results, and steadier topic discovery for new vaults.',
      },
      {
        tag: 'fix',
        title: 'coordinated rate limiting',
        description:
          'semantic scholar requests now share one rate limit across the whole app instead of a per-session allowance, so discovery and paper sync see fewer unexpected slowdowns during heavy use.',
      },
    ],
  },
  {
    id: 11,
    date: '2026-06-19',
    title: 'semantic scholar queues and onboarding',
    features: [
      {
        tag: 'feature',
        title: 'guided onboarding',
        description:
          'new users now get a skippable onboarding stepper with highlighted app areas for vaults, papers, researchers, the codex, and sharing.',
      },
      {
        tag: 'feature',
        title: 'help center guide',
        description:
          'the ? menu now includes a scrollable guide tab alongside keyboard shortcuts, with concise explanations of core refhub workflows.',
      },
      {
        tag: 'improvement',
        title: 'semantic scholar queue polish',
        description:
          'semantic scholar augmentation now handles queued requests, rate limits, retry states, and completion feedback more clearly.',
      },
      {
        tag: 'fix',
        title: 'minor workflow fixes',
        description:
          'recent fixes improved collaborator lookup, new-vault redirects, edit-paper links, profile back navigation, and small onboarding details.',
      },
    ],
  },
  {
    id: 10,
    date: '2026-05-22',
    title: 'better vault sharing',
    features: [
      {
        tag: 'feature',
        title: 'branded qr codes',
        description:
          'vault share links now use custom refhub qr codes with a cleaner branded design and svg downloads.',
      },
      {
        tag: 'improvement',
        title: 'polished qr share dialog',
        description:
          'qr sharing now loads cleanly, avoids visual flicker, and fits better on mobile screens.',
      },
    ],
  },
  {
    id: 9,
    date: '2026-05-12',
    title: 'clearer all papers counts and vault context',
    features: [
      {
        tag: 'improvement',
        title: 'vault context in all papers',
        description:
          'the all_papers view now shows where each paper appears, including vault instance counts and aggregated tags.',
      },
      {
        tag: 'fix',
        title: 'consistent public paper counts',
        description:
          'public profile counts now match /all-papers by counting distinct publications instead of duplicate vault copies.',
      },
    ],
  },
  {
    id: 8,
    date: '2026-05-08',
    title: 'collaborate on public vaults',
    features: [
      {
        tag: 'feature',
        title: 'request editor access',
        description:
          'signed-in users can request editor access from public vault pages, and owners can review and approve requests in settings.',
      },
      {
        tag: 'improvement',
        title: 'public vault access requests',
        description:
          'access requests are now visible in public vault settings, with clearer pending-request indicators for vault owners.',
      },
      {
        tag: 'improvement',
        title: 'direct sharing for public vaults',
        description:
          'vault owners can grant or revoke editor access on public vaults directly from the sharing settings.',
      },
      {
        tag: 'fix',
        title: 'consistent vault settings access',
        description:
          'the vault settings gear now appears consistently across pages that render the sidebar.',
      },
    ],
  },
  {
    id: 7,
    date: '2026-05-08',
    title: 'smoother publication + vault saves',
    features: [
      {
        tag: 'fix',
        title: 'publication edits stay in place',
        description:
          'saving a publication no longer resets the form, so follow-up edits and metadata checks are less disruptive.',
      },
      {
        tag: 'improvement',
        title: 'faster vault settings saves',
        description:
          'vault settings now save in place with keyboard shortcut support and clearer button styling.',
      },
      {
        tag: 'improvement',
        title: 'cleaner collaboration discovery',
        description:
          'collaborator autocomplete is more reliable, and researcher discovery focuses on completed profiles.',
      },
      {
        tag: 'fix',
        title: 'correct version and extension links',
        description:
          'bug reports now include the live app version, and extension links point to the current browser store listing.',
      },
    ],
  },
  {
    id: 6,
    date: '2026-04-19',
    title: 'agentic reference management',
    features: [
      {
        tag: 'feature',
        title: 'refhub skill for claude code',
        description:
          'manage vaults from claude code by searching papers, adding references, and querying vault content directly.',
      },
      {
        tag: 'feature',
        title: 'refhub cli',
        description:
          'a command-line interface is now available for searching papers, managing vaults, and automating reference workflows.',
      },
    ],
  },
  {
    id: 5,
    date: '2026-04-08',
    title: 'drive pdf links + browser store installs',
    features: [
      {
        tag: 'feature',
        title: 'google drive pdf links',
        description:
          'pdfs saved by the extension now appear across vault cards, tables, and publication dialogs with quick-open actions.',
      },
      {
        tag: 'feature',
        title: 'browser extensions live',
        description:
          'the chrome and firefox extensions are now available from the official browser stores for saving papers from the page.',
      },
    ],
  },
  {
    id: 4,
    date: '2026-03-28',
    title: 'browser extensions are here',
    features: [
      {
        tag: 'feature',
        title: 'chrome and firefox extensions',
        description:
          'the refhub browser extensions are available from github releases, with browser store submissions underway.',
      },
    ],
  },
  {
    id: 3,
    date: '2026-03-27',
    title: 'codex is live + semantic scholar integration',
    features: [
      {
        tag: 'feature',
        title: 'codex launched',
        description:
          'the codex page now supports browsing public vaults with search, filters, graph previews, and keyboard navigation.',
      },
      {
        tag: 'feature',
        title: 'semantic scholar discovery',
        description:
          'related works, citation paths, and referenced-by graphs now use semantic scholar data for richer paper discovery.',
      },
      {
        tag: 'feature',
        title: 'vault forking and favorites',
        description:
          'public vaults can now be forked into your workspace and favorited for faster access from the dashboard.',
      },
      {
        tag: 'improvement',
        title: 'general ux polish',
        description:
          'auth, vault lists, reader mode, focus states, buttons, shortcuts, and notifications received small usability improvements.',
      },
    ],
  },
  {
    id: 2,
    date: '2026-03-23',
    title: 'researcher profiles + graph fixes + mobile polish',
    features: [
      {
        tag: 'feature',
        title: 'researcher profile pages',
        description:
          'researchers now have public profile pages with bio, stats, and a grid of their public vaults.',
      },
      {
        tag: 'fix',
        title: 'accurate researcher counts',
        description:
          'researcher directory vault and paper counts now display correctly for profiles beyond the current user.',
      },
      {
        tag: 'improvement',
        title: 'steadier relationship graph',
        description:
          'disconnected paper clusters now stay positioned instead of drifting around the graph canvas.',
      },
      {
        tag: 'improvement',
        title: 'organized keyboard shortcuts',
        description:
          'the keyboard help overlay now groups shortcuts by task, making paper and dialog actions easier to scan.',
      },
      {
        tag: 'improvement',
        title: 'mobile toolbar polish',
        description:
          'toolbar keyboard hints are hidden on narrow screens, reducing overflow on mobile.',
      },
    ],
  },
  {
    id: 1,
    date: '2026-03-22',
    title: 'vault augmentation + semantic scholar',
    features: [
      {
        tag: 'feature',
        title: 'semantic scholar vault augmentation',
        description:
          'select papers and discover related references, citations, and recommendations directly from semantic scholar.',
      },
      {
        tag: 'feature',
        title: 'automatic citation links',
        description:
          'adding papers from references or cited_by results now creates the matching citation relationship automatically.',
      },
      {
        tag: 'improvement',
        title: 'forward and backward search',
        description:
          'discovery now separates papers a work cites from papers that cite it, making citation trails easier to follow.',
      },
      {
        tag: 'improvement',
        title: 'abstract previews in discovery',
        description:
          'discovered papers now show abstracts, authors, and source links before you add them to a vault.',
      },
      {
        tag: 'improvement',
        title: 'keyboard shortcut for discovery',
        description:
          'press r with selected papers to open vault augmentation without leaving the keyboard.',
      },
    ],
  },
];

export default changelog;
