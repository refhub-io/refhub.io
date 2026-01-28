import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LayoutGrid, List, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewSettingsPersistence } from '@/hooks/useViewSettingsPersistence';

export type ViewMode = 'cards' | 'table';

export interface VisibleColumns {
  title: boolean;
  authors: boolean;
  year: boolean;
  journal: boolean;
  tags: boolean;
  vault: boolean;
  doi: boolean;
  notes: boolean;
  type: boolean;
  relations: boolean;
  pdf: boolean;
  abstract: boolean;
}

interface ViewSettingsProps {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  visibleColumns?: VisibleColumns;
  onVisibleColumnsChange?: (columns: VisibleColumns) => void;
  isViewModeChanged?: boolean;
  isVisibleColumnsChanged?: boolean;
}

const COLUMN_OPTIONS: { key: keyof VisibleColumns; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'authors', label: 'Authors' },
  { key: 'year', label: 'Year' },
  { key: 'journal', label: 'Journal' },
  { key: 'tags', label: 'Tags' },
  { key: 'vault', label: 'Vault' },
  { key: 'type', label: 'Type' },
  { key: 'doi', label: 'DOI' },
  { key: 'notes', label: 'Notes' },
  { key: 'relations', label: 'Relations' },
  { key: 'pdf', label: 'PDF' },
  { key: 'abstract', label: 'Abstract' },
];

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  title: true,
  authors: true,
  year: true,
  journal: true,
  tags: true,
  vault: false,
  doi: false,
  notes: true,
  type: false,
  relations: true,
  pdf: true,
  abstract: false,
};

export function ViewSettings({
  viewMode: externalViewMode,
  onViewModeChange: externalOnViewModeChange,
  visibleColumns: externalVisibleColumns,
  onVisibleColumnsChange: externalOnVisibleColumnsChange,
  isViewModeChanged = false,
  isVisibleColumnsChanged = false,
}: ViewSettingsProps) {
  const {
    viewMode: persistedViewMode,
    visibleColumns: persistedVisibleColumns,
    updateViewMode,
    updateVisibleColumns
  } = useViewSettingsPersistence();

  // Use external props if provided, otherwise use persisted values
  const currentViewMode = externalViewMode ?? persistedViewMode;
  const currentVisibleColumns = externalVisibleColumns ?? persistedVisibleColumns;

  const handleViewModeChange = (mode: ViewMode) => {
    if (externalOnViewModeChange) {
      externalOnViewModeChange(mode);
    } else {
      updateViewMode(mode);
    }
  };

  const toggleColumn = (key: keyof VisibleColumns) => {
    // Don't allow disabling title
    if (key === 'title') return;

    const newColumns = {
      ...currentVisibleColumns,
      [key]: !currentVisibleColumns[key],
    };

    if (externalOnVisibleColumnsChange) {
      externalOnVisibleColumnsChange(newColumns);
    } else {
      updateVisibleColumns(newColumns);
    }
  };

  const activeColumnCount = Object.values(currentVisibleColumns).filter(Boolean).length;

  return (
    <div className="flex items-center gap-2">
      {/* View Mode Toggle */}
      <div className={cn(
        "flex items-center border border-border rounded-lg overflow-visible relative",
        (isViewModeChanged || isVisibleColumnsChanged) && 'bg-primary/10 border-primary/30'
      )}>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 w-9 rounded-none border-0',
            currentViewMode === 'cards' && 'bg-primary/20 text-primary'
          )}
          onClick={() => handleViewModeChange('cards')}
          title="Card view"
        >
          <LayoutGrid className="w-4 h-4" />
        </Button>
        <div className="w-px h-5 bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 w-9 rounded-none border-0',
            currentViewMode === 'table' && 'bg-primary/20 text-primary'
          )}
          onClick={() => handleViewModeChange('table')}
          title="Table view"
        >
          <List className="w-4 h-4" />
        </Button>
        {currentViewMode === 'table' && ( // Show indicator when current mode is table (not default)
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full z-10"></span>
        )}
      </div>

      {/* Column Settings */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-2 font-mono text-xs relative",
              isVisibleColumnsChanged && 'bg-primary/10 border-primary/30'
            )}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Properties</span>
            <span className={cn(
              "bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]",
              isVisibleColumnsChanged && "bg-white text-primary font-bold"
            )}>
              {activeColumnCount}
            </span>
            {isVisibleColumnsChanged && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full z-10"></span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3 bg-popover border-2">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Visible Properties</h4>
            <p className="text-xs text-muted-foreground font-mono">
              // toggle columns in {currentViewMode} view
            </p>
            <div className="space-y-2">
              {COLUMN_OPTIONS.map((col) => (
                <div key={col.key} className="flex items-center gap-2">
                  <Checkbox
                    id={col.key}
                    checked={currentVisibleColumns[col.key]}
                    onCheckedChange={() => toggleColumn(col.key)}
                    disabled={col.key === 'title'}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label
                    htmlFor={col.key}
                    className={cn(
                      'text-xs font-mono cursor-pointer',
                      col.key === 'title' && 'text-muted-foreground'
                    )}
                  >
                    {col.label}
                    {col.key === 'title' && ' (required)'}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
