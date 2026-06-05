import { describe, expect, it, vi } from 'vitest';
import { createVaultPublicSlugCandidate, normalizeVaultPublicSlug } from '@/lib/vaultSlug';

describe('vault public slug helpers', () => {
  it('normalizes ASCII names for public URL slugs', () => {
    expect(normalizeVaultPublicSlug(' My Research: 2026! ')).toBe('my-research-2026');
  });

  it('does not reject arbitrary Unicode-only vault names when deriving a public slug', () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.set([0xab, 0xcd, 0x12, 0x34]);
        return array;
      },
    });

    expect(createVaultPublicSlugCandidate('📚 重要な研究')).toBe('vault-abcd1234');

    vi.stubGlobal('crypto', originalCrypto);
  });
});
