import { describe, expect, it } from 'vitest';

import { orderImportPreviewIndices } from './importOrdering';

describe('orderImportPreviewIndices', () => {
  it('moves duplicate-marked items to the top while preserving relative order', () => {
    expect(orderImportPreviewIndices(6, new Set([1, 4]))).toEqual([1, 4, 0, 2, 3, 5]);
  });

  it('keeps original order when there are no duplicates', () => {
    expect(orderImportPreviewIndices(4, new Set())).toEqual([0, 1, 2, 3]);
  });
});
