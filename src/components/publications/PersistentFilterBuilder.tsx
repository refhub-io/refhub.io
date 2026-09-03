import { FilterField, PublicationFilter } from './FilterBuilder';
import { FilterBuilder } from './FilterBuilder';
import { useViewSettingsPersistence } from '@/hooks/useViewSettingsPersistence';
import { Tag, Vault } from '@/types/database';

interface PersistentFilterBuilderProps {
  tags: Tag[];
  vaults: Vault[];
  onFiltersChange?: (filters: PublicationFilter[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /** Restricts the field picker to this subset. Omit for the full field list. */
  filterableFields?: FilterField[];
}

export function PersistentFilterBuilder({ tags, vaults, onFiltersChange, open, onOpenChange, onCloseAutoFocus, filterableFields }: PersistentFilterBuilderProps) {
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
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      filterableFields={filterableFields}
    />
  );
}