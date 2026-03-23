import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { ViewMode, DEFAULT_VISIBLE_COLUMNS, VisibleColumns } from '@/components/publications/ViewSettings';
import { PublicationFilter } from '@/components/publications/FilterBuilder';

const VIEW_SETTINGS_STORAGE_KEY = 'refhub-view-settings';

export type SortField = 'title' | 'authors' | 'year' | 'journal' | 'type' | 'created';
export type SortDirection = 'asc' | 'desc';

interface StoredViewSettings {
  viewMode: ViewMode;
  visibleColumns: VisibleColumns;
  sortBy: SortField;
  sortDirection: SortDirection;
  filters: PublicationFilter[];
}

export const useViewSettingsPersistence = () => {
  const [storedSettings, setStoredSettings] = useState<StoredViewSettings>(() => {
    try {
      const stored = localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          viewMode: parsed.viewMode || 'cards',
          sortBy: parsed.sortBy || 'created',
          sortDirection: parsed.sortDirection || 'desc',
          visibleColumns: {
            ...DEFAULT_VISIBLE_COLUMNS,
            ...parsed.visibleColumns
          },
          filters: parsed.filters || []
        };
      }
      return {
        viewMode: 'cards' as ViewMode,
        sortBy: 'created' as SortField,
        sortDirection: 'desc' as SortDirection,
        visibleColumns: DEFAULT_VISIBLE_COLUMNS,
        filters: []
      };
    } catch (error) {
      logger.error('useViewSettingsPersistence', 'Error loading view settings from localStorage:', error);
      return {
        viewMode: 'cards' as ViewMode,
        sortBy: 'created' as SortField,
        sortDirection: 'desc' as SortDirection,
        visibleColumns: DEFAULT_VISIBLE_COLUMNS,
        filters: []
      };
    }
  });

  const saveSettings = useCallback((settings: StoredViewSettings) => {
    try {
      localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      setStoredSettings(settings);
    } catch (error) {
      logger.error('useViewSettingsPersistence', 'Error saving view settings to localStorage:', error);
    }
  }, []);

  const updateViewMode = useCallback((mode: ViewMode) => {
    const newSettings = {
      viewMode: mode,
      visibleColumns: storedSettings.visibleColumns,
      sortBy: storedSettings.sortBy,
      sortDirection: storedSettings.sortDirection,
      filters: storedSettings.filters
    };
    saveSettings(newSettings);
  }, [storedSettings.visibleColumns, storedSettings.sortBy, storedSettings.sortDirection, storedSettings.filters, saveSettings]);

  const updateVisibleColumns = useCallback((columns: VisibleColumns) => {
    const newSettings = {
      viewMode: storedSettings.viewMode,
      visibleColumns: columns,
      sortBy: storedSettings.sortBy,
      sortDirection: storedSettings.sortDirection,
      filters: storedSettings.filters
    };
    saveSettings(newSettings);
  }, [storedSettings.viewMode, storedSettings.sortBy, storedSettings.sortDirection, storedSettings.filters, saveSettings]);

  const updateSortBy = useCallback((sortBy: SortField, sortDirection?: SortDirection) => {
    const newSettings = {
      viewMode: storedSettings.viewMode,
      visibleColumns: storedSettings.visibleColumns,
      sortBy,
      sortDirection: sortDirection ?? storedSettings.sortDirection,
      filters: storedSettings.filters
    };
    saveSettings(newSettings);
  }, [storedSettings.viewMode, storedSettings.visibleColumns, storedSettings.sortDirection, storedSettings.filters, saveSettings]);

  const updateFilters = useCallback((filters: PublicationFilter[]) => {
    const newSettings = {
      viewMode: storedSettings.viewMode,
      visibleColumns: storedSettings.visibleColumns,
      sortBy: storedSettings.sortBy,
      sortDirection: storedSettings.sortDirection,
      filters
    };
    saveSettings(newSettings);
  }, [storedSettings.viewMode, storedSettings.visibleColumns, storedSettings.sortBy, storedSettings.sortDirection, saveSettings]);

  return {
    viewMode: storedSettings.viewMode,
    visibleColumns: storedSettings.visibleColumns,
    sortBy: storedSettings.sortBy,
    sortDirection: storedSettings.sortDirection,
    filters: storedSettings.filters,
    updateViewMode,
    updateVisibleColumns,
    updateSortBy,
    updateFilters
  };
};