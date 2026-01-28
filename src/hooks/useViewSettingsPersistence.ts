import { useState, useCallback } from 'react';
import { ViewMode, DEFAULT_VISIBLE_COLUMNS, VisibleColumns } from '@/components/publications/ViewSettings';
import { PublicationFilter } from '@/components/publications/FilterBuilder';

const VIEW_SETTINGS_STORAGE_KEY = 'refhub-view-settings';

interface StoredViewSettings {
  viewMode: ViewMode;
  visibleColumns: VisibleColumns;
  sortBy: 'title' | 'year' | 'created';
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
          visibleColumns: {
            ...DEFAULT_VISIBLE_COLUMNS,
            ...parsed.visibleColumns
          },
          filters: parsed.filters || []
        };
      }
      return {
        viewMode: 'cards' as ViewMode,
        sortBy: 'created',
        visibleColumns: DEFAULT_VISIBLE_COLUMNS,
        filters: []
      };
    } catch (error) {
      console.error('Error loading view settings from localStorage:', error);
      return {
        viewMode: 'cards' as ViewMode,
        sortBy: 'created',
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
      console.error('Error saving view settings to localStorage:', error);
    }
  }, []);

  const updateViewMode = useCallback((mode: ViewMode) => {
    const newSettings = {
      viewMode: mode,
      visibleColumns: storedSettings.visibleColumns,
      sortBy: storedSettings.sortBy,
      filters: storedSettings.filters
    };
    saveSettings(newSettings);
  }, [storedSettings.visibleColumns, storedSettings.sortBy, storedSettings.filters, saveSettings]);

  const updateVisibleColumns = useCallback((columns: VisibleColumns) => {
    const newSettings = {
      viewMode: storedSettings.viewMode,
      visibleColumns: columns,
      sortBy: storedSettings.sortBy,
      filters: storedSettings.filters
    };
    saveSettings(newSettings);
  }, [storedSettings.viewMode, storedSettings.sortBy, storedSettings.filters, saveSettings]);

  const updateSortBy = useCallback((sortBy: 'title' | 'year' | 'created') => {
    const newSettings = {
      viewMode: storedSettings.viewMode,
      visibleColumns: storedSettings.visibleColumns,
      sortBy,
      filters: storedSettings.filters
    };
    saveSettings(newSettings);
  }, [storedSettings.viewMode, storedSettings.visibleColumns, storedSettings.filters, saveSettings]);

  const updateFilters = useCallback((filters: PublicationFilter[]) => {
    const newSettings = {
      viewMode: storedSettings.viewMode,
      visibleColumns: storedSettings.visibleColumns,
      sortBy: storedSettings.sortBy,
      filters
    };
    saveSettings(newSettings);
  }, [storedSettings.viewMode, storedSettings.visibleColumns, storedSettings.sortBy, saveSettings]);

  return {
    viewMode: storedSettings.viewMode,
    visibleColumns: storedSettings.visibleColumns,
    sortBy: storedSettings.sortBy,
    filters: storedSettings.filters,
    updateViewMode,
    updateVisibleColumns,
    updateSortBy,
    updateFilters
  };
};