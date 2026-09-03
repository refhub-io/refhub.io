import { describe, expect, it, vi } from 'vitest';
import {
  fetchVaultSections,
  createVaultSection,
  updateVaultSection,
  deleteVaultSection,
  reorderVaultSections,
  updateVaultPublicationSection,
} from './vaultSections';

describe('fetchVaultSections', () => {
  it('selects sections for a vault ordered by position', async () => {
    const sections = [{ id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' }];
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: sections, error: null }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await fetchVaultSections(supabase, 'v1');
    expect(result).toEqual(sections);
  });

  it('throws when the query errors', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: new Error('boom') }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(fetchVaultSections(supabase, 'v1')).rejects.toThrow('boom');
  });
});

describe('createVaultSection', () => {
  it('inserts a section at the given position and returns it', async () => {
    const created = { id: 's2', vault_id: 'v1', name: 'evaluation', description: 'how we test it', position: 1, created_at: '', updated_at: '' };
    const supabase = {
      from: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              expect(row).toMatchObject({ vault_id: 'v1', name: 'evaluation', description: 'how we test it', position: 1 });
              return Promise.resolve({ data: created, error: null });
            },
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await createVaultSection(supabase, 'v1', { name: 'evaluation', description: 'how we test it', position: 1 });
    expect(result).toEqual(created);
  });
});

describe('updateVaultSection', () => {
  it('updates the given fields and returns the updated row', async () => {
    const updated = { id: 's1', vault_id: 'v1', name: 'renamed', description: null, position: 0, created_at: '', updated_at: '' };
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              single: () => {
                expect(patch).toEqual({ name: 'renamed' });
                return Promise.resolve({ data: updated, error: null });
              },
            }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await updateVaultSection(supabase, 's1', { name: 'renamed' });
    expect(result).toEqual(updated);
  });
});

describe('deleteVaultSection', () => {
  it('deletes the section by id', async () => {
    let deletedId: string | undefined;
    const supabase = {
      from: () => ({
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletedId = id;
            return Promise.resolve({ error: null });
          },
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await deleteVaultSection(supabase, 's1');
    expect(deletedId).toBe('s1');
  });
});

describe('reorderVaultSections', () => {
  it('updates position for every id in the given order', async () => {
    const updates: { id: string; position: number }[] = [];
    const supabase = {
      from: () => ({
        update: (patch: { position: number }) => ({
          eq: (_col: string, id: string) => {
            updates.push({ id, position: patch.position });
            return Promise.resolve({ error: null });
          },
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await reorderVaultSections(supabase, ['s2', 's1', 's3']);
    expect(updates).toEqual([
      { id: 's2', position: 0 },
      { id: 's1', position: 1 },
      { id: 's3', position: 2 },
    ]);
  });
});

describe('updateVaultPublicationSection', () => {
  it('patches only the given fields on the vault_publications row', async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            capturedPatch = patch;
            return Promise.resolve({ error: null });
          },
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await updateVaultPublicationSection(supabase, 'vp1', { featured: true, featured_note: 'why it matters' });
    expect(capturedPatch).toEqual({ featured: true, featured_note: 'why it matters' });
  });
});
