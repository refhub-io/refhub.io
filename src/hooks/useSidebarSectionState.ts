import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';

const STORAGE_KEY = 'refhub_sidebar_sections_v1';

export interface SidebarSectionState {
  vaultsExpanded: boolean;
  sharedExpanded: boolean;
  favoritesExpanded: boolean;
  archivedExpanded: boolean;
}

const DEFAULT_STATE: SidebarSectionState = {
  vaultsExpanded: true,
  sharedExpanded: true,
  favoritesExpanded: true,
  // Collapsed by default -- archived vaults are housekeeping, not daily-use.
  archivedExpanded: false,
};

function readState(): SidebarSectionState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (error) {
    logger.error('useSidebarSectionState', 'Error loading sidebar section state from localStorage:', error);
    return DEFAULT_STATE;
  }
}

function persistState(state: SidebarSectionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    logger.error('useSidebarSectionState', 'Error saving sidebar section state to localStorage:', error);
  }
}

/**
 * Persists which sidebar sections (my_vaults / shared_with_me / favorites)
 * are expanded, across page navigations. Every page mounts its own fresh
 * Sidebar instance, so plain useState here reset on every single
 * navigation. Device-local (not per-user, not synced): this is a display
 * preference, not vault metadata, matching the pattern used elsewhere for
 * view settings / vault sidebar ordering.
 */
export function useSidebarSectionState() {
  const [state, setState] = useState<SidebarSectionState>(readState);

  const toggle = useCallback((key: keyof SidebarSectionState) => {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persistState(next);
      return next;
    });
  }, []);

  return { ...state, toggle };
}
