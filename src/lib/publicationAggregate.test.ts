import { describe, expect, it } from 'vitest';
import {
  mergeMissingDisplayMetadata,
  buildAllPublications,
  buildPublicationVaultsMap,
  buildPublicationTagsMap,
  type RawVaultPublicationRow,
} from './publicationAggregate';
import type { Publication, PublicationTag } from '@/types/database';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'p1', user_id: 'u1', title: 'Title', authors: ['A'], year: 2020,
    journal: null, volume: null, issue: null, pages: null, doi: null, url: null,
    abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article',
    notes: null, booktitle: null, chapter: null, edition: null, editor: null,
    howpublished: null, institution: null, number: null, organization: null,
    publisher: null, school: null, series: null, type: null, eid: null,
    isbn: null, issn: null, keywords: null, reading_state: 'unread', important: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRawVaultPub(overrides: Partial<RawVaultPublicationRow> = {}): RawVaultPublicationRow {
  return {
    id: 'vp1', vault_id: 'vault-1', created_by: 'u1', title: 'VP Title',
    authors: ['A'], year: 2021, journal: null, volume: null, issue: null,
    pages: null, doi: null, url: null, abstract: null, pdf_url: null,
    bibtex_key: null, publication_type: 'article', notes: null, booktitle: null,
    chapter: null, edition: null, editor: null, howpublished: null,
    institution: null, number: null, organization: null, publisher: null,
    school: null, series: null, type: null, eid: null, isbn: null, issn: null,
    keywords: null, reading_state: 'unread', important: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    original_publication_id: null,
    ...overrides,
  };
}

describe('mergeMissingDisplayMetadata', () => {
  it('fills a missing canonical field from the vault instance', () => {
    const canonical = makePub({ abstract: null });
    const instance = makePub({ abstract: 'from vault copy' });
    expect(mergeMissingDisplayMetadata(canonical, instance).abstract).toBe('from vault copy');
  });

  it('never overwrites a canonical field that already has a value', () => {
    const canonical = makePub({ abstract: 'canonical abstract' });
    const instance = makePub({ abstract: 'vault abstract' });
    expect(mergeMissingDisplayMetadata(canonical, instance).abstract).toBe('canonical abstract');
  });
});

describe('buildAllPublications', () => {
  it('keeps a standalone canonical publication with no vault copies', () => {
    const { allPublications } = buildAllPublications([makePub({ id: 'p1' })], []);
    expect(allPublications.map((p) => p.id)).toEqual(['p1']);
  });

  it('merges a vault copy into its canonical publication by original_publication_id', () => {
    const canonical = makePub({ id: 'p1', abstract: null });
    const vp = makeRawVaultPub({ id: 'vp1', original_publication_id: 'p1', abstract: 'filled in' });
    const { allPublications, vaultPublicationLinks } = buildAllPublications([canonical], [vp]);

    expect(allPublications).toHaveLength(1);
    expect(allPublications[0].abstract).toBe('filled in');
    expect(vaultPublicationLinks).toEqual([{ id: 'vp1', vault_id: 'vault-1', original_publication_id: 'p1' }]);
  });

  it('treats a vault copy with no original_publication_id as standalone', () => {
    const vp = makeRawVaultPub({ id: 'vp1', original_publication_id: null });
    const { allPublications } = buildAllPublications([], [vp]);
    expect(allPublications.map((p) => p.id)).toEqual(['vp1']);
  });
});

describe('buildPublicationVaultsMap', () => {
  it('maps a publication to every vault its copies appear in', () => {
    const publications = [makePub({ id: 'p1' })];
    const links = [
      { id: 'vp1', vault_id: 'vault-a', original_publication_id: 'p1' },
      { id: 'vp2', vault_id: 'vault-b', original_publication_id: 'p1' },
    ];
    expect(buildPublicationVaultsMap(publications, links)).toEqual({ p1: ['vault-a', 'vault-b'] });
  });

  it('maps a standalone vault publication to its own id', () => {
    const publications = [makePub({ id: 'vp1' })];
    const links = [{ id: 'vp1', vault_id: 'vault-a', original_publication_id: null }];
    expect(buildPublicationVaultsMap(publications, links)).toEqual({ vp1: ['vault-a'] });
  });
});

describe('buildPublicationTagsMap', () => {
  it('maps a canonical publication to its own publication_tags row', () => {
    const publications = [makePub({ id: 'p1' })];
    const publicationTags: PublicationTag[] = [
      { id: 't1', publication_id: 'p1', vault_publication_id: null, tag_id: 'tag-1' },
    ];
    expect(buildPublicationTagsMap(publications, publicationTags, [])).toEqual({ p1: ['tag-1'] });
  });

  it('resolves a vault-copy tag row to the canonical publication id', () => {
    const publications = [makePub({ id: 'p1' })];
    const links = [{ id: 'vp1', vault_id: 'vault-a', original_publication_id: 'p1' }];
    const publicationTags: PublicationTag[] = [
      { id: 't1', publication_id: null, vault_publication_id: 'vp1', tag_id: 'tag-1' },
    ];
    expect(buildPublicationTagsMap(publications, publicationTags, links)).toEqual({ p1: ['tag-1'] });
  });
});
