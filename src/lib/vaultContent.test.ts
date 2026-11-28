import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication, PublicationTag, Tag } from '@/types/database';
import { buildPdfAssetsMap, fetchVaultContentRows, publicVaultTagging } from './vaultContent';

const paper = (id: string, original: string | null) => ({ id, original_publication_id: original }) as Publication;

describe('buildPdfAssetsMap', () => {
  it("uses a vault copy's own stored PDF over its canonical paper's", () => {
    const map = buildPdfAssetsMap([paper('vp-1', 'p-1')], [
      { publication_id: 'p-1', vault_publication_id: null, stored_pdf_url: 'canonical' },
      { publication_id: 'p-1', vault_publication_id: 'vp-1', stored_pdf_url: 'own' },
    ]);
    expect(map).toEqual({ 'vp-1': 'own' });
  });

  it("falls back to the canonical paper's PDF, and to null without either", () => {
    const map = buildPdfAssetsMap([paper('vp-1', 'p-1'), paper('vp-2', 'p-2'), paper('vp-3', null)], [
      { publication_id: 'p-1', vault_publication_id: null, stored_pdf_url: 'canonical' },
    ]);
    expect(map).toEqual({ 'vp-1': 'canonical', 'vp-2': null, 'vp-3': null });
  });
});

describe('fetchVaultContentRows', () => {
  it('asks get_vault_content for the vault and returns its rows', async () => {
    const rows = { vault: { id: 'vault-1' }, vault_publications: [] };
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

    await expect(fetchVaultContentRows({ rpc } as unknown as SupabaseClient, 'vault-1')).resolves.toBe(rows);
    expect(rpc).toHaveBeenCalledWith('get_vault_content', { p_vault_id: 'vault-1' });
  });

  it('throws the error when the call fails', async () => {
    const error = { code: '57014', message: 'canceling statement due to statement timeout' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });

    await expect(fetchVaultContentRows({ rpc } as unknown as SupabaseClient, 'vault-1')).rejects.toBe(error);
  });
});

describe('publicVaultTagging', () => {
  const link = (id: string, tagId: string, vaultPublicationId: string | null, publicationId: string | null = null) =>
    ({ id, tag_id: tagId, vault_publication_id: vaultPublicationId, publication_id: publicationId }) as PublicationTag;
  const tag = (id: string, vaultId: string | null) => ({ id, name: id, vault_id: vaultId }) as Tag;

  it("keeps the links on the vault's papers and the tags they use", () => {
    const tagging = publicVaultTagging(
      { publication_tags: [link('l-1', 'vault-tag', 'vp-1'), link('l-2', 'owner-tag', 'vp-2')], tags: [tag('vault-tag', 'v-1'), tag('owner-tag', null), tag('unused', 'v-1')] },
      ['vp-1', 'vp-2'],
    );
    expect(tagging.publicationTags.map((l) => l.id)).toEqual(['l-1', 'l-2']);
    expect(tagging.tags.map((t) => t.id)).toEqual(['vault-tag', 'owner-tag']);
  });

  it("leaves out canonical links and the visitor's own tags", () => {
    const tagging = publicVaultTagging(
      { publication_tags: [link('l-1', 'vault-tag', 'vp-1'), link('l-2', 'personal', null, 'p-1'), link('l-3', 'vault-tag', 'vp-elsewhere')], tags: [tag('vault-tag', 'v-1'), tag('personal', null)] },
      ['vp-1'],
    );
    expect(tagging.publicationTags.map((l) => l.id)).toEqual(['l-1']);
    expect(tagging.tags.map((t) => t.id)).toEqual(['vault-tag']);
  });
});
