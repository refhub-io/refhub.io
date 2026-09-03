import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVaultSections } from './useVaultSections';

const mockFetch = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();

vi.mock('@/lib/vaultSections', () => ({
  fetchVaultSections: (...args: unknown[]) => mockFetch(...args),
  createVaultSection: (...args: unknown[]) => mockCreate(...args),
  updateVaultSection: (...args: unknown[]) => mockUpdate(...args),
  deleteVaultSection: (...args: unknown[]) => mockDelete(...args),
  reorderVaultSections: (...args: unknown[]) => mockReorder(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

describe('useVaultSections', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockReorder.mockReset();
  });

  it('loads sections for the given vault id on mount', async () => {
    mockFetch.mockResolvedValue([{ id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' }]);

    const { result } = renderHook(() => useVaultSections('v1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sections).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith({}, 'v1');
  });

  it('does not fetch when vaultId is null', () => {
    renderHook(() => useVaultSections(null));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('createSection appends the created section and refreshes', async () => {
    mockFetch.mockResolvedValueOnce([]);
    const created = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockCreate.mockResolvedValue(created);
    mockFetch.mockResolvedValueOnce([created]);

    const { result } = renderHook(() => useVaultSections('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createSection({ name: 'starter_papers', description: null });
    });

    expect(mockCreate).toHaveBeenCalledWith({}, 'v1', { name: 'starter_papers', description: null, position: 0 });
    expect(result.current.sections).toHaveLength(1);
  });

  it('deleteSection removes the section from local state', async () => {
    const existing = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetch.mockResolvedValue([existing]);
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useVaultSections('v1'));
    await waitFor(() => expect(result.current.sections).toHaveLength(1));

    await act(async () => {
      await result.current.deleteSection('s1');
    });

    expect(mockDelete).toHaveBeenCalledWith({}, 's1');
    expect(result.current.sections).toHaveLength(0);
  });
});
