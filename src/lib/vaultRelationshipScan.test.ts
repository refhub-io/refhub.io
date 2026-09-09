import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

const mockFindRelationshipSuggestions = vi.fn();

vi.mock('@/lib/relationshipSuggestions', () => ({
  findRelationshipSuggestions: (...args: unknown[]) => mockFindRelationshipSuggestions(...args),
}));

import { runVaultRelationshipScan } from './vaultRelationshipScan';
import type { Publication } from '@/types/database';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'p1', user_id: 'u1', title: 'A Paper', authors: [], year: 2020,
    journal: null, volume: null, issue: null, pages: null, doi: '10.1/abc', url: null,
    abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article', notes: null,
    booktitle: null, chapter: null, edition: null, editor: null, howpublished: null,
    institution: null, number: null, organization: null, publisher: null, school: null,
    series: null, type: null, eid: null, isbn: null, issn: null, keywords: null,
    reading_state: 'unread', important: false, created_at: '', updated_at: '',
    ...overrides,
  };
}

describe('runVaultRelationshipScan', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMemoryStorage());
    mockFindRelationshipSuggestions.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips publications without a DOI', async () => {
    const { suggestions, skippedCount } = await runVaultRelationshipScan([makePub({ id: 'no-doi', doi: null })], []);
    expect(suggestions).toEqual([]);
    expect(skippedCount).toBe(0);
    expect(mockFindRelationshipSuggestions).not.toHaveBeenCalled();
  });

  it('collects suggestions across all DOI-bearing publications', async () => {
    mockFindRelationshipSuggestions
      .mockResolvedValueOnce([
        { sourcePublicationId: 'p1', sourceTitle: 'A Paper', targetPublicationId: 'x1', targetTitle: 'X Paper', discoveredVia: 'references' },
      ])
      .mockResolvedValueOnce([
        { sourcePublicationId: 'p2', sourceTitle: 'B Paper', targetPublicationId: 'x2', targetTitle: 'Y Paper', discoveredVia: 'references' },
      ]);
    const pubs = [makePub({ id: 'p1', doi: '10.1/a' }), makePub({ id: 'p2', doi: '10.1/b' })];

    const { suggestions } = await runVaultRelationshipScan(pubs, []);

    expect(mockFindRelationshipSuggestions).toHaveBeenCalledTimes(2);
    expect(suggestions).toHaveLength(2); // two different pairs from two different publications
  });

  it('deduplicates identical relationship pairs across publications', async () => {
    const sharedSuggestion = { sourcePublicationId: 'p1', sourceTitle: 'A Paper', targetPublicationId: 'x1', targetTitle: 'X Paper', discoveredVia: 'references' as const };
    mockFindRelationshipSuggestions
      .mockResolvedValueOnce([sharedSuggestion])
      .mockResolvedValueOnce([sharedSuggestion]);
    const pubs = [makePub({ id: 'p1', doi: '10.1/a' }), makePub({ id: 'p2', doi: '10.1/b' })];

    const { suggestions } = await runVaultRelationshipScan(pubs, []);

    expect(mockFindRelationshipSuggestions).toHaveBeenCalledTimes(2);
    expect(suggestions).toHaveLength(1); // the same pair should only appear once
  });

  it('skips DOIs successfully checked within the TTL window on a second run', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([]);
    const pubs = [makePub({ id: 'p1', doi: '10.1/a' })];

    await runVaultRelationshipScan(pubs, []);
    const second = await runVaultRelationshipScan(pubs, []);

    expect(second.skippedCount).toBe(1);
    expect(mockFindRelationshipSuggestions).toHaveBeenCalledTimes(1);
  });

  it('rechecks every DOI when skipRecentMs is 0', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([]);
    const pubs = [makePub({ id: 'p1', doi: '10.1/a' })];

    await runVaultRelationshipScan(pubs, []);
    const second = await runVaultRelationshipScan(pubs, [], undefined, { skipRecentMs: 0 });

    expect(second.skippedCount).toBe(0);
    expect(mockFindRelationshipSuggestions).toHaveBeenCalledTimes(2);
  });

  it('does not cache a DOI whose check failed, so it is retried on the next run', async () => {
    mockFindRelationshipSuggestions
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce([]);
    const pubs = [makePub({ id: 'p1', doi: '10.1/a' })];

    await runVaultRelationshipScan(pubs, []); // fails, not cached
    const second = await runVaultRelationshipScan(pubs, []); // should retry, not skip

    expect(second.skippedCount).toBe(0);
    expect(mockFindRelationshipSuggestions).toHaveBeenCalledTimes(2);
  });
});
