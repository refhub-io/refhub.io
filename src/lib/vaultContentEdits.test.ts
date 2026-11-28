import { beforeEach, describe, expect, it } from 'vitest';
import type { Publication, PublicationTag, Tag } from '@/types/database';
import { createVaultContentEdits } from './vaultContentEdits';

const pub = (id: string, title = id) => ({ id, title }) as Publication;
const tag = (id: string, name = id) => ({ id, name }) as Tag;
const link = (id: string, vaultPublicationId: string | null, tagId: string, publicationId: string | null = null) =>
  ({ id, vault_publication_id: vaultPublicationId, publication_id: publicationId, tag_id: tagId }) as PublicationTag;

let state: { publications: Publication[]; tags: Tag[]; publicationTags: PublicationTag[] };
const edits = createVaultContentEdits({
  publications: (update) => { state.publications = update(state.publications); },
  tags: (update) => { state.tags = update(state.tags); },
  publicationTags: (update) => { state.publicationTags = update(state.publicationTags); },
});
const ids = (list: { id: string }[]) => list.map((item) => item.id);

beforeEach(() => {
  state = {
    publications: [pub('p1'), pub('p2')],
    tags: [tag('t1'), tag('t2')],
    publicationTags: [link('l1', 'p1', 't1'), link('l2', 'p2', 't2'), link('l3', null, 't1', 'p2')],
  };
});

describe('vault content edits', () => {
  it('adds a paper at the top, once', () => {
    edits.addPublication(pub('p3'));
    edits.addPublication(pub('p3'));
    expect(ids(state.publications)).toEqual(['p3', 'p1', 'p2']);
  });

  it('patches only the papers it names', () => {
    edits.updatePublication('p1', { title: 'renamed' });
    edits.updatePublications([{ id: 'p2', patch: { section_id: 's1', section_position: 2 } }]);
    expect(state.publications).toEqual([
      { id: 'p1', title: 'renamed' },
      { id: 'p2', title: 'p2', section_id: 's1', section_position: 2 },
    ]);
  });

  it('swaps a placeholder for the saved row, in place', () => {
    state.publications = [pub('temp_1'), pub('p1')];
    edits.replacePublication('temp_1', pub('p9', 'saved'));
    expect(state.publications).toEqual([{ id: 'p9', title: 'saved' }, { id: 'p1', title: 'p1' }]);
  });

  it('drops the placeholder when realtime delivered the saved row first', () => {
    state.publications = [pub('p9', 'from realtime'), pub('temp_1'), pub('p1')];
    edits.replacePublication('temp_1', pub('p9', 'saved'));
    expect(state.publications).toEqual([{ id: 'p9', title: 'saved' }, { id: 'p1', title: 'p1' }]);
  });

  it("leaves the list alone when the paper to replace isn't there", () => {
    edits.replacePublication('gone', pub('p9'));
    expect(ids(state.publications)).toEqual(['p1', 'p2']);
  });

  it("removes papers with their tag links, by either id", () => {
    edits.removePublications(['p2']);
    expect(ids(state.publications)).toEqual(['p1']);
    expect(ids(state.publicationTags)).toEqual(['l1']);
  });

  it('adds, replaces and removes tags, and removing one drops its links', () => {
    edits.addTags([tag('t2'), tag('t3')]);
    edits.replaceTag('t3', tag('t3', 'renamed'));
    expect(state.tags).toEqual([tag('t1'), tag('t2'), { id: 't3', name: 'renamed' }]);
    edits.removeTags(['t1']);
    expect(ids(state.tags)).toEqual(['t2', 't3']);
    expect(ids(state.publicationTags)).toEqual(['l2']);
  });

  it('adds tag links once and removes them by id', () => {
    edits.addPublicationTagLinks([link('l1', 'p1', 't1'), link('l4', 'p1', 't2')]);
    edits.removePublicationTagLinks(['l2']);
    expect(ids(state.publicationTags)).toEqual(['l1', 'l3', 'l4']);
  });
});
