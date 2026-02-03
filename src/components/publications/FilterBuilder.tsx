import { useState } from 'react';
import { Tag, Vault } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, X, Filter, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterField = 
  | 'title' 
  | 'authors' 
  | 'year' 
  | 'journal' 
  | 'tags' 
  | 'vault' 
  | 'doi' 
  | 'notes'
  | 'publication_type';

export type FilterOperator = 
  | 'contains' 
  | 'not_contains' 
  | 'equals' 
  | 'not_equals' 
  | 'is_empty' 
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than';

export interface PublicationFilter {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

interface FilterBuilderProps {
  filters: PublicationFilter[];
  onFiltersChange: (filters: PublicationFilter[]) => void;
  tags: Tag[];
  vaults: Vault[];
}

const FIELD_OPTIONS: { value: FilterField; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'authors', label: 'Authors' },
  { value: 'year', label: 'Year' },
  { value: 'journal', label: 'Journal' },
  { value: 'tags', label: 'Tags' },
  { value: 'vault', label: 'Vault' },
  { value: 'doi', label: 'DOI' },
  { value: 'notes', label: 'Notes' },
  { value: 'publication_type', label: 'Type' },
];

const getOperatorsForField = (field: FilterField): { value: FilterOperator; label: string }[] => {
  const textOperators = [
    { value: 'contains' as FilterOperator, label: 'contains' },
    { value: 'not_contains' as FilterOperator, label: 'does not contain' },
    { value: 'equals' as FilterOperator, label: 'equals' },
    { value: 'not_equals' as FilterOperator, label: 'does not equal' },
    { value: 'is_empty' as FilterOperator, label: 'is empty' },
    { value: 'is_not_empty' as FilterOperator, label: 'is not empty' },
  ];

  const numberOperators = [
    { value: 'equals' as FilterOperator, label: 'equals' },
    { value: 'not_equals' as FilterOperator, label: 'does not equal' },
    { value: 'greater_than' as FilterOperator, label: 'greater than' },
    { value: 'less_than' as FilterOperator, label: 'less than' },
    { value: 'is_empty' as FilterOperator, label: 'is empty' },
    { value: 'is_not_empty' as FilterOperator, label: 'is not empty' },
  ];

  const selectOperators = [
    { value: 'equals' as FilterOperator, label: 'is' },
    { value: 'not_equals' as FilterOperator, label: 'is not' },
    { value: 'is_empty' as FilterOperator, label: 'is empty' },
    { value: 'is_not_empty' as FilterOperator, label: 'is not empty' },
  ];

  switch (field) {
    case 'year':
      return numberOperators;
    case 'tags':
    case 'vault':
    case 'publication_type':
      return selectOperators;
    default:
      return textOperators;
  }
};

const needsValueInput = (operator: FilterOperator): boolean => {
  return !['is_empty', 'is_not_empty'].includes(operator);
};

export function FilterBuilder({ filters, onFiltersChange, tags, vaults }: FilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const addFilter = () => {
    const newFilter: PublicationFilter = {
      id: crypto.randomUUID(),
      field: 'title',
      operator: 'contains',
      value: '',
    };
    onFiltersChange([...filters, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<PublicationFilter>) => {
    onFiltersChange(
      filters.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const removeFilter = (id: string) => {
    onFiltersChange(filters.filter((f) => f.id !== id));
  };

  const clearAllFilters = () => {
    onFiltersChange([]);
  };

  const renderValueInput = (filter: PublicationFilter) => {
    if (!needsValueInput(filter.operator)) return null;

    switch (filter.field) {
      case 'tags':
        return (
          <Select
            value={filter.value}
            onValueChange={(value) => updateFilter(filter.id, { value })}
          >
            <SelectTrigger className="h-8 w-full sm:w-32 text-xs font-mono">
              <SelectValue placeholder="Select tag" />
            </SelectTrigger>
            <SelectContent>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id} className="text-xs font-mono">
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'vault':
        return (
          <Select
            value={filter.value}
            onValueChange={(value) => updateFilter(filter.id, { value })}
          >
            <SelectTrigger className="h-8 w-full sm:w-32 text-xs font-mono">
              <SelectValue placeholder="Select vault" />
            </SelectTrigger>
            <SelectContent>
              {vaults.map((vault) => (
                <SelectItem key={vault.id} value={vault.id} className="text-xs font-mono">
                  {vault.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'publication_type':
        return (
          <Select
            value={filter.value}
            onValueChange={(value) => updateFilter(filter.id, { value })}
          >
            <SelectTrigger className="h-8 w-full sm:w-32 text-xs font-mono">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {['article', 'book', 'conference', 'thesis', 'preprint', 'other'].map((type) => (
                <SelectItem key={type} value={type} className="text-xs font-mono">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'year':
        return (
          <Input
            type="number"
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            placeholder="Year"
            className="h-8 w-full sm:w-24 text-xs font-mono"
          />
        );
      default:
        return (
          <Input
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            placeholder="Value..."
            className="h-8 w-full sm:w-32 text-xs font-mono"
          />
        );
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={filters.length > 0 ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-9 gap-2 font-mono text-xs',
            filters.length > 0 && 'bg-primary/20 border-primary/50 text-primary hover:bg-primary/30'
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Filter</span>
          {filters.length > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="start" 
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[400px] max-w-[calc(100vw-2rem)] p-3 bg-popover border-2"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Filters</h4>
            {filters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearAllFilters}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {filters.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono py-2">
              // no filters applied
            </p>
          ) : (
            <div className="space-y-3">
              {filters.map((filter, index) => (
                <div key={filter.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    {index > 0 && (
                      <span className="text-xs text-muted-foreground font-mono w-8 shrink-0">and</span>
                    )}
                    {index === 0 && <span className="w-8 shrink-0 hidden sm:block" />}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    <Select
                      value={filter.field}
                      onValueChange={(value: FilterField) => {
                        const operators = getOperatorsForField(value);
                        updateFilter(filter.id, { 
                          field: value, 
                          operator: operators[0].value,
                          value: '' 
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-full sm:w-28 text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filter.operator}
                      onValueChange={(value: FilterOperator) => updateFilter(filter.id, { operator: value })}
                    >
                      <SelectTrigger className="h-8 w-full sm:w-36 text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getOperatorsForField(filter.field).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {renderValueInput(filter)}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeFilter(filter.id)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs font-mono"
            onClick={addFilter}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Utility function to apply filters to publications
// eslint-disable-next-line react-refresh/only-export-components
export function applyFilters(
  publications: Publication[],
  filters: PublicationFilter[],
  publicationTagsMap: Record<string, string[]>
): Publication[] {
  if (filters.length === 0) return publications;

  return publications.filter((pub) => {
    return filters.every((filter) => {
      const { field, operator, value } = filter;

      let fieldValue: string | number | string[] | null | undefined;
      switch (field) {
        case 'title':
          fieldValue = pub.title || '';
          break;
        case 'authors':
          fieldValue = (pub.authors || []).join(' ');
          break;
        case 'year':
          fieldValue = pub.year;
          break;
        case 'journal':
          fieldValue = pub.journal || '';
          break;
        case 'tags':
          fieldValue = publicationTagsMap[pub.id] || [];
          break;
        case 'vault':
          fieldValue = ''; // TODO: Implement vault lookup
          break;
        case 'doi':
          fieldValue = pub.doi || '';
          break;
        case 'notes':
          fieldValue = pub.notes || '';
          break;
        case 'publication_type':
          fieldValue = pub.publication_type || '';
          break;
        default:
          fieldValue = '';
      }

      switch (operator) {
        case 'contains':
          if (field === 'tags') {
            return fieldValue.includes(value);
          }
          return String(fieldValue).toLowerCase().includes(value.toLowerCase());
        case 'not_contains':
          if (field === 'tags') {
            return !fieldValue.includes(value);
          }
          return !String(fieldValue).toLowerCase().includes(value.toLowerCase());
        case 'equals':
          if (field === 'tags') {
            return fieldValue.includes(value);
          }
          if (field === 'year') {
            return fieldValue === parseInt(value, 10);
          }
          return String(fieldValue).toLowerCase() === value.toLowerCase();
        case 'not_equals':
          if (field === 'tags') {
            return !fieldValue.includes(value);
          }
          if (field === 'year') {
            return fieldValue !== parseInt(value, 10);
          }
          return String(fieldValue).toLowerCase() !== value.toLowerCase();
        case 'is_empty':
          if (field === 'tags') {
            return fieldValue.length === 0;
          }
          return !fieldValue || String(fieldValue).trim() === '';
        case 'is_not_empty':
          if (field === 'tags') {
            return fieldValue.length > 0;
          }
          return fieldValue && String(fieldValue).trim() !== '';
        case 'greater_than':
          return fieldValue > parseInt(value, 10);
        case 'less_than':
          return fieldValue < parseInt(value, 10);
        default:
          return true;
      }
    });
  });
}
