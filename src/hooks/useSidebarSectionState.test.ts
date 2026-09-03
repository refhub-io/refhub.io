import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSidebarSectionState } from './useSidebarSectionState';

describe('useSidebarSectionState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults every section to expanded when nothing is stored', () => {
    const { result } = renderHook(() => useSidebarSectionState());
    expect(result.current.vaultsExpanded).toBe(true);
    expect(result.current.sharedExpanded).toBe(true);
    expect(result.current.favoritesExpanded).toBe(true);
  });

  it('toggle() flips a section and persists it', () => {
    const { result } = renderHook(() => useSidebarSectionState());

    act(() => {
      result.current.toggle('vaultsExpanded');
    });

    expect(result.current.vaultsExpanded).toBe(false);
    expect(result.current.sharedExpanded).toBe(true);
  });

  it('a second hook instance (simulating a fresh Sidebar mount after navigation) reads the persisted state instead of resetting to defaults', () => {
    const { result: first } = renderHook(() => useSidebarSectionState());
    act(() => {
      first.current.toggle('favoritesExpanded');
    });
    expect(first.current.favoritesExpanded).toBe(false);

    // Simulates React Router unmounting the previous page's Sidebar and
    // mounting a brand new instance for the next page.
    const { result: second } = renderHook(() => useSidebarSectionState());
    expect(second.current.favoritesExpanded).toBe(false);
    expect(second.current.vaultsExpanded).toBe(true);
  });

  it('ignores corrupted localStorage content and falls back to defaults', () => {
    localStorage.setItem('refhub_sidebar_sections_v1', '{not valid json');
    const { result } = renderHook(() => useSidebarSectionState());
    expect(result.current.vaultsExpanded).toBe(true);
  });
});
