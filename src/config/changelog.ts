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
    id: 4,
    date: '2026-03-28',
    title: 'browser extensions are here',
    features: [
      {
        tag: 'feature',
        title: 'chrome & firefox extensions released on github',
        description:
          'the refhub browser extensions are now available — install directly from github releases today. save papers to your vaults without ever leaving the tab you\'re reading. chrome & firefox store submissions are pending validation and dropping soon™.',
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
          'the codex page is now live for browse-oriented research exploration. search and filter across public vaults with instant graph previews, nodes-of-interest hovers, and keyboard-first navigation for power users.',
      },
      {
        tag: 'feature',
        title: 'semantic scholar pipeline for smarter discovery',
        description:
          'deep integration with semantic scholar is now active: related works, citation paths, and referenced-by graphs are sourced from semantic scholar and link directly into your select/save workflow.',
      },
      {
        tag: 'feature',
        title: 'vault forking + hearting',
        description:
          'you can now fork public vaults to clone their paper sets instantly, and favorite vaults with a ❤️ for fast access in the dashboard. backup, remix, and curate with confidence.',
      },
      {
        tag: 'improvement',
        title: 'minor ux improvements and fixes',
        description:
          'various small ui/ux polish updates were applied across auth, vault lists, and reader mode. improved focus ring handling, button spacing, keyboard response, and notification clarity.',
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
          'every researcher now has a public profile at /profile/@username. click any card in the researchers directory to see their bio, stats, and a grid of their public vaults — each linking directly to the vault.',
      },
      {
        tag: 'fix',
        title: 'researcher directory showing correct counts',
        description:
          'vault and paper counts for other researchers were always 0 due to an RLS policy restricting visibility to the owner only. a new migration and security definer function fix this — counts are now accurate for all researchers.',
      },
      {
        tag: 'improvement',
        title: 'relationship graph: disconnected components stay put',
        description:
          'disconnected paper clusters no longer drift to the edges of the canvas. nodes are pre-positioned in a grid and pinned in place, rendering immediately without any animated settle or zoom jump.',
      },
      {
        tag: 'improvement',
        title: 'keyboard shortcuts reorganised',
        description:
          'the help overlay (press ?) now groups shortcuts into focused panels: paper navigation, paper selection, paper popups & actions, and a combined dialogs & editor section — no more scrolling through a single long list.',
      },
      {
        tag: 'improvement',
        title: 'mobile: toolbar keyboard hints hidden on narrow screens',
        description:
          'inline keyboard hint badges are now hidden below 768 px, preventing toolbar overflow. the discover_related button is also visible as an icon on all screen sizes.',
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
        title: 'vault augmentation via semantic scholar',
        description:
          'select one or more papers and press r (or click discover_related) to discover related work — references, papers that cite them, and recommendations — directly from the semantic scholar api. add any discovery to the vault with one click.',
      },
      {
        tag: 'feature',
        title: 'automatic citation links',
        description:
          'when you add a paper from the references or cited_by tabs, the citation relationship is automatically created and appears in the collection graph.',
      },
      {
        tag: 'improvement',
        title: 'forward + backward search',
        description:
          'the discovery panel distinguishes cites→ (papers the selected work builds on) from ←cited_by (papers that build on the selected work), making it easy to trace intellectual lineage in both directions.',
      },
      {
        tag: 'improvement',
        title: 'abstract previews in discovery panel',
        description:
          'each discovered paper now shows an abstract snippet, full author list, and a direct doi or semantic scholar link so you can evaluate relevance before adding.',
      },
      {
        tag: 'improvement',
        title: 'keyboard shortcut r',
        description:
          'press r with one or more papers selected to open vault augmentation without reaching for the mouse.',
      },
    ],
  },
];

export default changelog;
