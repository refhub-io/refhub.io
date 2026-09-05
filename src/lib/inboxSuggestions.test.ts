// src/lib/inboxSuggestions.test.ts
import { describe, expect, it } from 'vitest';
import { suggestVaultForItem, suggestTagsForItem } from './inboxSuggestions';
import type { Publication, Vault } from '@/types/database';

function makePublication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'pub-1', user_id: 'user-1', title: 'Deep Learning for NLP',
    authors: ['Ada Lovelace'], year: 2020, journal: null, volume: null, issue: null, pages: null,
    doi: null, url: null, abstract: null, pdf_url: null, bibtex_key: null,
    publication_type: 'article', notes: null, booktitle: null, chapter: null, edition: null,
    editor: null, howpublished: null, institution: null, number: null, organization: null,
    publisher: null, school: null, series: null, type: null, eid: null, isbn: null, issn: null,
    keywords: null, reading_state: 'unread', important: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    id: 'vault-1', user_id: 'user-1', name: 'NLP Vault', description: '', color: '#000',
    category: 'research', abstract: '', visibility: 'private', public_slug: null,
    archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('suggestVaultForItem', () => {
  it('suggests the vault whose publications share authors with the item', () => {
    const pub = makePublication({ id: 'pub-1', authors: ['Ada Lovelace'], title: 'Deep Learning for NLP' });
    const otherVaultPub = makePublication({ id: 'pub-2', authors: ['Someone Unrelated'], title: 'Cooking Basics' });
    const vaults = [makeVault({ id: 'vault-1', name: 'NLP Vault' }), makeVault({ id: 'vault-2', name: 'Cooking' })];
    const publicationVaultsMap = { 'pub-1': ['vault-1'], 'pub-2': ['vault-2'] };

    const result = suggestVaultForItem(
      { title: 'Attention and NLP', authors: ['Ada Lovelace'] },
      [pub, otherVaultPub],
      vaults,
      publicationVaultsMap,
    );
    expect(result).toBe('vault-1');
  });

  it('returns null when no vault clears the minimum threshold', () => {
    const pub = makePublication({ id: 'pub-1', authors: ['Someone Else'], title: 'Unrelated Topic' });
    const result = suggestVaultForItem(
      { title: 'Completely Different Subject', authors: ['A Third Person'] },
      [pub],
      [makeVault()],
      { 'pub-1': ['vault-1'] },
    );
    expect(result).toBeNull();
  });

  it('returns null for an empty library', () => {
    expect(suggestVaultForItem({ title: 'Anything' }, [], [], {})).toBeNull();
  });
});

describe('suggestTagsForItem', () => {
  it('suggests tags already applied to the most similar publication in the suggested vault', () => {
    const pub = makePublication({ id: 'pub-1', authors: ['Ada Lovelace'], title: 'Deep Learning for NLP' });
    const publicationVaultsMap = { 'pub-1': ['vault-1'] };
    const publicationTagsMap = { 'pub-1': ['tag-nlp', 'tag-deep-learning'] };

    const result = suggestTagsForItem(
      { title: 'Attention and NLP', authors: ['Ada Lovelace'] },
      'vault-1',
      [pub],
      publicationVaultsMap,
      publicationTagsMap,
    );
    expect(result).toEqual(['tag-nlp', 'tag-deep-learning']);
  });

  it('returns an empty array when suggestedVaultId is null', () => {
    expect(suggestTagsForItem({ title: 'X' }, null, [], {}, {})).toEqual([]);
  });
});
