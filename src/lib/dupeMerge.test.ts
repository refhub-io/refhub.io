import { describe, expect, it } from 'vitest';

import type { Publication } from '@/types/database';
import { buildMergePlan, listFieldConflicts, listVaultConflicts } from './dupeMerge';

const basePub = (over: Partial<Publication>): Publication =>
  ({
    id: 'x',
    user_id: 'u1',
    title: 'A Title',
    authors: ['Doe, Jane'],
    year: 2020,
    journal: 'A Journal',
    volume: null,
    issue: null,
    pages: null,
    doi: null,
    url: null,
    abstract: null,
    pdf_url: null,
    bibtex_key: null,
    publication_type: 'article',
    notes: null,
    booktitle: null,
    chapter: null,
    edition: null,
    editor: null,
    howpublished: null,
    institution: null,
    number: null,
    organization: null,
    publisher: null,
    school: null,
    series: null,
    type: null,
    eid: null,
    isbn: null,
    issn: null,
    keywords: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...over,
  }) as Publication;

describe('listFieldConflicts', () => {
  it('reports only fields where both sides are non-empty and different', () => {
    const left = basePub({ id: 'l', pages: '1-10', doi: '10.1/x', volume: null });
    const right = basePub({ id: 'r', pages: '1-12', doi: '10.1/x', volume: '3' });
    const conflicts = listFieldConflicts(left, right);
    expect(conflicts.map((c) => c.field)).toEqual(['pages']);
  });
});

describe('listVaultConflicts', () => {
  const links = [
    { id: 'c1', vault_id: 'v1', original_publication_id: 'l' },
    { id: 'c2', vault_id: 'v1', original_publication_id: 'r' },
    { id: 'c3', vault_id: 'v2', original_publication_id: 'r' },
    { id: 'c4', vault_id: 'v3', original_publication_id: 'other' },
  ];

  it('reports vaults containing copies of both papers', () => {
    const conflicts = listVaultConflicts('l', 'r', links);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].vault_id).toBe('v1');
    expect(conflicts[0].leftCopy.id).toBe('c1');
    expect(conflicts[0].rightCopy.id).toBe('c2');
  });
});

describe('buildMergePlan', () => {
  const left = basePub({ id: 'l', pages: '1-10', volume: null, abstract: 'left abstract' });
  const right = basePub({ id: 'r', pages: '1-12', volume: '3', abstract: null });
  const links = [
    { id: 'c1', vault_id: 'v1', original_publication_id: 'l' },
    { id: 'c2', vault_id: 'v1', original_publication_id: 'r' },
    { id: 'c3', vault_id: 'v2', original_publication_id: 'r' },
  ];

  it('applies field choices, auto-fills one-sided values, plans repoint/delete', () => {
    const plan = buildMergePlan(left, right, links, {
      survivor: 'left',
      fieldChoices: { pages: 'right' },
      vaultChoices: { v1: 'right' },
    });

    expect(plan.survivorId).toBe('l');
    expect(plan.loserId).toBe('r');
    // chosen from right
    expect(plan.survivorPatch.pages).toBe('1-12');
    // auto-filled from the non-empty side, no explicit choice needed
    expect(plan.survivorPatch.volume).toBe('3');
    // survivor already has this value → not in patch
    expect(plan.survivorPatch.abstract).toBeUndefined();
    // v1 keeps the right copy (which belongs to the loser → re-point), left copy deleted
    expect(plan.deleteCopyIds).toEqual(['c1']);
    // c2 kept in v1 (re-pointed) + c3 un-conflicted loser copy (re-pointed)
    expect([...plan.repointCopyIds].sort()).toEqual(['c2', 'c3']);
    // c1 (dropped) relations must be re-pointed to the kept copy c2
    expect(plan.droppedCopyReplacements).toEqual([{ droppedCopyId: 'c1', keptCopyId: 'c2' }]);
  });

  it('defaults unspecified conflicted vaults to the survivor side', () => {
    const plan = buildMergePlan(left, right, links, {
      survivor: 'left',
      fieldChoices: {},
      vaultChoices: {},
    });
    // v1 defaults to left copy kept (already points at survivor, no repoint), right copy deleted
    expect(plan.deleteCopyIds).toEqual(['c2']);
    expect(plan.repointCopyIds).toEqual(['c3']);
    // c2 (dropped) relations must be re-pointed to the kept copy c1
    expect(plan.droppedCopyReplacements).toEqual([{ droppedCopyId: 'c2', keptCopyId: 'c1' }]);
  });
});
