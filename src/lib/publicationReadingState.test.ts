import { describe, expect, it, vi } from 'vitest';
import { updatePublicationReadingState } from './publicationReadingState';

function makeSupabaseMock({ vaultPubFound, updateError = null }: { vaultPubFound: boolean; updateError?: { message: string } | null }) {
  const updateEqSpy = vi.fn().mockResolvedValue({ error: updateError });
  const from = vi.fn((table: string) => {
    if (table === 'vault_publications') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: vaultPubFound ? { id: 'pub-1' } : null, error: null }),
          }),
        }),
        update: () => ({ eq: updateEqSpy }),
      };
    }
    // 'publications'
    return {
      update: () => ({ eq: updateEqSpy }),
    };
  });

  return { supabase: { from } as unknown as Parameters<typeof updatePublicationReadingState>[0], from, updateEqSpy };
}

describe('updatePublicationReadingState', () => {
  it('updates vault_publications when the id is a vault copy', async () => {
    const { supabase, from } = makeSupabaseMock({ vaultPubFound: true });

    const result = await updatePublicationReadingState(supabase, 'pub-1', { reading_state: 'read' });

    expect(result.error).toBeNull();
    expect(from).toHaveBeenCalledWith('vault_publications');
    expect(from).not.toHaveBeenCalledWith('publications');
  });

  it('falls back to publications when the id is not a vault copy', async () => {
    const { supabase, from } = makeSupabaseMock({ vaultPubFound: false });

    const result = await updatePublicationReadingState(supabase, 'pub-1', { important: true });

    expect(result.error).toBeNull();
    expect(from).toHaveBeenCalledWith('publications');
  });

  it('returns the error when the update fails', async () => {
    const { supabase } = makeSupabaseMock({ vaultPubFound: false, updateError: { message: 'boom' } });

    const result = await updatePublicationReadingState(supabase, 'pub-1', { reading_state: 'skimmed' });

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toBe('boom');
  });
});
