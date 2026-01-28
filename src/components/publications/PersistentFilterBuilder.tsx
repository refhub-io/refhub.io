import { PublicationFilter } from './FilterBuilder';
import { FilterBuilder } from './FilterBuilder';
import { useViewSettingsPersistence } from '@/hooks/useViewSettingsPersistence';
import { Tag, Vault } from '@/types/database';

interface PersistentFilterBuilderProps {
  tags: Tag[];
  vaults: Vault[];
  onFiltersChange?: (filters: PublicationFilter[]) => void;
}

export function PersistentFilterBuilder({ tags, vaults, onFiltersChange }: PersistentFilterBuilderProps) {
  const {
    filters: persistedFilters,
    updateFilters
  } = useViewSettingsPersistence();

  const handleFiltersChange = (filters: PublicationFilter[]) => {
    updateFilters(filters);
    if (onFiltersChange) {
      onFiltersChange(filters);
    }
  };

  return (
    <FilterBuilder
      filters={persistedFilters}
      onFiltersChange={handleFiltersChange}
      tags={tags}
      vaults={vaults}
    />
  );
}