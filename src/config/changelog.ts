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
