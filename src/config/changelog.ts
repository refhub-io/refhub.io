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
    id: 2,
    date: '2026-03-23',
    title: 'researcher profiles + graph fixes + mobile polish',
    features: [
      {
        tag: 'feature',
        title: 'researcher profile pages',
        description:
          'Every researcher now has a public profile at /profile/@username. Click any card in the researchers directory to see their bio, stats, and a grid of their public vaults — each linking directly to the vault.',
      },
      {
        tag: 'fix',
        title: 'researcher directory showing correct counts',
        description:
          'Vault and paper counts for other researchers were always 0 due to an RLS policy restricting visibility to the owner only. A new migration and SECURITY DEFINER function fix this — counts are now accurate for all researchers.',
      },
      {
        tag: 'improvement',
        title: 'relationship graph: disconnected components stay put',
        description:
          'Disconnected paper clusters no longer drift to the edges of the canvas. Nodes are pre-positioned in a grid and pinned in place, rendering immediately without any animated settle or zoom jump.',
      },
      {
        tag: 'improvement',
        title: 'keyboard shortcuts reorganised',
        description:
          'The help overlay (press ?) now groups shortcuts into focused panels: Paper Navigation, Paper Selection, Paper Popups & Actions, and a combined Dialogs & Editor section — no more scrolling through a single long list.',
      },
      {
        tag: 'improvement',
        title: 'mobile: toolbar keyboard hints hidden on narrow screens',
        description:
          'Inline keyboard hint badges are now hidden below 768 px, preventing toolbar overflow. The discover_related button is also visible as an icon on all screen sizes.',
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
          'Select one or more papers and press R (or click discover_related) to discover related work — references, papers that cite them, and recommendations — directly from the Semantic Scholar API. Add any discovery to the vault with one click.',
      },
      {
        tag: 'feature',
        title: 'automatic citation links',
        description:
          'When you add a paper from the references or cited_by tabs, the citation relationship is automatically created and appears in the collection graph.',
      },
      {
        tag: 'improvement',
        title: 'forward + backward search',
        description:
          'The discovery panel distinguishes cites→ (papers the selected work builds on) from ←cited_by (papers that build on the selected work), making it easy to trace intellectual lineage in both directions.',
      },
      {
        tag: 'improvement',
        title: 'abstract previews in discovery panel',
        description:
          'Each discovered paper now shows an abstract snippet, full author list, and a direct DOI or Semantic Scholar link so you can evaluate relevance before adding.',
      },
      {
        tag: 'improvement',
        title: 'keyboard shortcut r',
        description:
          'Press R with one or more papers selected to open vault augmentation without reaching for the mouse.',
      },
    ],
  },
];

export default changelog;
