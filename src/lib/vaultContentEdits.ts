import type { Publication, PublicationTag, Tag } from '@/types/database';

/**
 * The changes a vault page can make to the vault's content in memory: optimistic updates, their
 * rollbacks, and local follow-ups to saved changes. Each one changes only the rows it names, so
 * whatever else changed meanwhile (realtime events from other people, other edits) stays.
 */
export interface VaultContentEdits {
  /** Puts a paper at the top of the list, unless it's there already. */
  addPublication(publication: Publication): void;
  /** Merges a patch into one paper. */
  updatePublication(id: string, patch: Partial<Publication>): void;
  /** Merges patches into several papers, by id. */
  updatePublications(patches: { id: string; patch: Partial<Publication> }[]): void;
  /**
   * Swaps one version of a paper for another: the saved row for its placeholder, or the previous
   * version on a rollback. If the new version is already in the list (realtime delivered it
   * first), the old one is simply removed.
   */
  replacePublication(id: string, publication: Publication): void;
  /** Removes papers, with their tag links. */
  removePublications(ids: string[]): void;
  /** Adds tags that aren't there yet. */
  addTags(tags: Tag[]): void;
  /** Swaps one version of a tag for another, as replacePublication does for papers. */
  replaceTag(id: string, tag: Tag): void;
  /** Removes tags, with their links to papers. */
  removeTags(ids: string[]): void;
  /** Adds tag links that aren't there yet. */
  addPublicationTagLinks(links: PublicationTag[]): void;
  /** Removes tag links, by id. */
  removePublicationTagLinks(ids: string[]): void;
}

type Update<T> = (update: (prev: T[]) => T[]) => void;

const addById = <T extends { id: string }>(list: T[], items: T[], at: 'start' | 'end'): T[] => {
  const present = new Set(list.map((item) => item.id));
  const fresh = items.filter((item) => !present.has(item.id));
  if (fresh.length === 0) return list;
  return at === 'start' ? [...fresh, ...list] : [...list, ...fresh];
};

const replaceById = <T extends { id: string }>(list: T[], id: string, item: T): T[] => {
  if (!list.some((existing) => existing.id === id)) return list;
  const rest = item.id === id ? list : list.filter((existing) => existing.id !== item.id);
  return rest.map((existing) => (existing.id === id ? item : existing));
};

const removeByIds = <T extends { id: string }>(list: T[], ids: string[]): T[] => {
  const gone = new Set(ids);
  return list.some((item) => gone.has(item.id)) ? list.filter((item) => !gone.has(item.id)) : list;
};

/** Builds the edits over three functional state updaters, such as React's setters. */
export function createVaultContentEdits(set: {
  publications: Update<Publication>;
  tags: Update<Tag>;
  publicationTags: Update<PublicationTag>;
}): VaultContentEdits {
  return {
    addPublication: (publication) => set.publications((prev) => addById(prev, [publication], 'start')),
    updatePublication: (id, patch) =>
      set.publications((prev) => prev.map((pub) => (pub.id === id ? { ...pub, ...patch } : pub))),
    updatePublications: (patches) => {
      const byId = new Map(patches.map(({ id, patch }) => [id, patch]));
      set.publications((prev) => prev.map((pub) => (byId.has(pub.id) ? { ...pub, ...byId.get(pub.id) } : pub)));
    },
    replacePublication: (id, publication) => set.publications((prev) => replaceById(prev, id, publication)),
    removePublications: (ids) => {
      const gone = new Set(ids);
      set.publications((prev) => removeByIds(prev, ids));
      set.publicationTags((prev) => prev.filter((link) =>
        !gone.has(link.vault_publication_id ?? '') && !gone.has(link.publication_id ?? '')));
    },
    addTags: (tags) => set.tags((prev) => addById(prev, tags, 'end')),
    replaceTag: (id, tag) => set.tags((prev) => replaceById(prev, id, tag)),
    removeTags: (ids) => {
      const gone = new Set(ids);
      set.tags((prev) => removeByIds(prev, ids));
      set.publicationTags((prev) => prev.filter((link) => !gone.has(link.tag_id)));
    },
    addPublicationTagLinks: (links) => set.publicationTags((prev) => addById(prev, links, 'end')),
    removePublicationTagLinks: (ids) => set.publicationTags((prev) => removeByIds(prev, ids)),
  };
}
