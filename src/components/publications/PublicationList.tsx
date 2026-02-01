import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Publication, Tag, Vault } from '@/types/database';
import { PublicationCard } from './PublicationCard';
import { PublicationTable } from './PublicationTable';
import { FilterBuilder, PublicationFilter, applyFilters } from './FilterBuilder';
import { ViewSettings, ViewMode, VisibleColumns, DEFAULT_VISIBLE_COLUMNS } from './ViewSettings';
import { useViewSettingsPersistence } from '@/hooks/useViewSettingsPersistence';
import { QRCodeDialog } from '@/components/vaults/QRCodeDialog';
import { TagManager } from '@/components/tags/TagManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { PersistentFilterBuilder } from './PersistentFilterBuilder';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Plus,
  Search,
  Download,
  SortAsc,
  CheckSquare,
  Square,
  Sparkles,
  Command,
  Upload,
  Network,
  Settings,
  MoreVertical,
  Tags
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PublicationListProps {
  publications: Publication[];
  tags: Tag[];
  vaults: Vault[];
  publicationTagsMap: Record<string, string[]>;
  publicationVaultsMap?: Record<string, string[]>; // Map of publication IDs to vault IDs
  relationsCountMap: Record<string, number>;
  selectedVault: Vault | null;
  onAddPublication?: () => void;
  onImportPublications?: () => void;
  onEditPublication?: (pub: Publication) => void;
  onDeletePublication?: (pub: Publication) => void;
  onExportBibtex: (pubs: Publication[]) => void;
  onMobileMenuOpen: () => void;
  onOpenGraph?: () => void;
  onEditVault?: (vault: Vault) => void;
  onVaultUpdate?: () => void;
  // Tag management props (optional - only shown if canEdit is true)
  canEditTags?: boolean;
  onUpdateTag?: (tagId: string, updates: Partial<Tag>) => Promise<Tag | null>;
  onDeleteTag?: (tagId: string) => Promise<{ success: boolean; error?: Error }>;
}

export function PublicationList({
  publications,
  tags,
  vaults,
  publicationTagsMap,
  publicationVaultsMap,
  relationsCountMap,
  selectedVault,
  onAddPublication,
  onImportPublications,
  onEditPublication,
  onDeletePublication,
  onExportBibtex,
  onMobileMenuOpen,
  onOpenGraph,
  onEditVault,
  onVaultUpdate,
  canEditTags,
  onUpdateTag,
  onDeleteTag,
}: PublicationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

  // Calculate tag usage counts
  const tagUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(publicationTagsMap).forEach(tagIds => {
      tagIds.forEach(tagId => {
        counts.set(tagId, (counts.get(tagId) || 0) + 1);
      });
    });
    return counts;
  }, [publicationTagsMap]);

  const {
    viewMode: persistedViewMode,
    visibleColumns: persistedVisibleColumns,
    sortBy: persistedSortBy,
    filters: persistedFilters,
    updateViewMode,
    updateVisibleColumns,
    updateSortBy,
    updateFilters
  } = useViewSettingsPersistence();

  const [viewMode, setViewMode] = useState<ViewMode>(persistedViewMode);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(persistedVisibleColumns);
  // Use the persisted value as initial state for sortBy
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'created'>(persistedSortBy);
  const [filters, setFilters] = useState<PublicationFilter[]>(persistedFilters);

  // Sync local state with persisted state when it changes
  useEffect(() => {
    setFilters(persistedFilters);
  }, [persistedFilters]);

  // Update persisted settings when local state changes
  useEffect(() => {
    updateViewMode(viewMode);
  }, [viewMode, updateViewMode]);

  useEffect(() => {
    updateVisibleColumns(visibleColumns);
  }, [visibleColumns, updateVisibleColumns]);

  useEffect(() => {
    updateSortBy(sortBy);
  }, [sortBy, updateSortBy]);

  useEffect(() => {
    updateFilters(filters);
  }, [filters, updateFilters]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut to focus search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply search filter
  const searchFiltered = publications.filter((pub) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      pub.title.toLowerCase().includes(searchLower) ||
      pub.authors.some((a) => a.toLowerCase().includes(searchLower)) ||
      pub.journal?.toLowerCase().includes(searchLower)
    );
  });

  // Apply custom filters
  const customFiltered = applyFilters(searchFiltered, persistedFilters, publicationTagsMap);

  // Apply sorting
  const filteredPublications = customFiltered.sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'year':
        return (b.year || 0) - (a.year || 0);
      case 'created':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredPublications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPublications.map((p) => p.id)));
    }
  };

  const getPublicationTags = (pubId: string): Tag[] => {
    const tagIds = publicationTagsMap[pubId] || [];
    return tags.filter((t) => tagIds.includes(t.id));
  };

  const selectedPublications = publications.filter((p) => selectedIds.has(p.id));

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-x-hidden">
      {/* Header */}
      <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-4 lg:px-8 py-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <MobileMenuButton 
            onClick={onMobileMenuOpen}
            className="shrink-0"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {selectedVault && (
                <div 
                  className="w-4 h-4 rounded-md shrink-0 shadow-sm"
                  style={{ backgroundColor: selectedVault.color }}
                />
              )}
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate font-mono leading-none">
                {selectedVault ? selectedVault.name : (
                  <>
                    // <span className="text-gradient">all_papers</span>
                  </>
                )}
              </h1>
              {selectedVault && (
                <QRCodeDialog vault={selectedVault} onVaultUpdate={onVaultUpdate} />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate leading-none">
              {filteredPublications.length} item{filteredPublications.length !== 1 ? 's' : ''}
              {persistedFilters.length > 0 && (
                <span className="text-primary"> • {persistedFilters.length} filter{persistedFilters.length !== 1 ? 's' : ''}</span>
              )}
              {selectedIds.size > 0 && (
                <span className="text-neon-green"> • {selectedIds.size} selected</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <NotificationDropdown />

            {/* Visible buttons on larger screens */}
            {onOpenGraph && (
              <Button 
                onClick={onOpenGraph} 
                variant="outline" 
                className="h-9 font-mono hidden lg:flex"
              >
                <Network className="w-4 h-4 mr-2" />
                relationship_graph
              </Button>
            )}

            {onImportPublications && (
              <Button 
                onClick={onImportPublications} 
                variant="outline" 
                className="h-9 font-mono hidden lg:flex"
              >
                <Upload className="w-4 h-4 mr-2" />
                import_papers
              </Button>
            )}

            {selectedVault && onEditVault && (
              <Button 
                onClick={() => onEditVault(selectedVault)} 
                variant="outline" 
                className="h-9 font-mono hidden lg:flex"
              >
                <Settings className="w-4 h-4 mr-2" />
                vault_settings
              </Button>
            )}

            {/* Tag Manager - only shown when canEditTags and handlers are provided */}
            {canEditTags && onUpdateTag && onDeleteTag && (
              <Sheet open={isTagManagerOpen} onOpenChange={setIsTagManagerOpen}>
                <SheetTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="h-9 font-mono hidden lg:flex"
                  >
                    <Tags className="w-4 h-4 mr-2" />
                    manage_tags
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle className="font-mono">manage_tags()</SheetTitle>
                    <SheetDescription>
                      Rename or delete tags in this vault. Deleting a tag will untag publications but won't delete them.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                    <TagManager
                      tags={tags}
                      canEdit={canEditTags}
                      onUpdateTag={onUpdateTag}
                      onDeleteTag={onDeleteTag}
                      tagUsageCounts={tagUsageCounts}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}

            {/* Mobile dropdown with gradient styling */}
            {(onOpenGraph || onImportPublications || (selectedVault && onEditVault) || (canEditTags && onUpdateTag && onDeleteTag)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="glow" size="icon" className="h-9 w-9 lg:hidden" title="More actions">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono">
                  {onOpenGraph && (
                    <DropdownMenuItem onClick={onOpenGraph}>
                      <Network className="w-4 h-4 mr-2" />
                      relationship_graph
                    </DropdownMenuItem>
                  )}
                  {onImportPublications && (
                    <DropdownMenuItem onClick={onImportPublications}>
                      <Upload className="w-4 h-4 mr-2" />
                      import_papers
                    </DropdownMenuItem>
                  )}
                  {selectedVault && onEditVault && (
                    <DropdownMenuItem onClick={() => onEditVault(selectedVault)}>
                      <Settings className="w-4 h-4 mr-2" />
                      vault_settings
                    </DropdownMenuItem>
                  )}
                  {canEditTags && onUpdateTag && onDeleteTag && (
                    <DropdownMenuItem onClick={() => setIsTagManagerOpen(true)}>
                      <Tags className="w-4 h-4 mr-2" />
                      manage_tags
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {onAddPublication && (
              <Button onClick={onAddPublication} variant="glow" className="h-9 font-mono">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">add_paper</span>
              </Button>
            )}
          </div>
        </div>

        {/* Search, filters and view settings */}
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="search_papers..."
              className="pl-11 font-mono"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          </div>

          <div className={cn(
            "relative overflow-visible",
            persistedFilters.length > 0 && 'bg-primary/10 border-primary/30 rounded-md'
          )}>
            <PersistentFilterBuilder
              tags={tags}
              vaults={vaults}
              onFiltersChange={setFilters}
            />
            {persistedFilters.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full z-10"></span>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-9 w-9 relative overflow-visible",
                  sortBy !== 'created' && 'bg-primary/10 border-primary/30'
                )}
                title={`Sorting by: ${sortBy.replace('_', ' ')}`}
              >
                <SortAsc className="w-4 h-4" />
                {sortBy !== 'created' && ( // Show indicator when not default sort
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full z-10"></span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono">
              <DropdownMenuItem onClick={() => setSortBy('created')}>
                recently_added
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('year')}>
                publication_year
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('title')}>
                title_asc
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ViewSettings
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            visibleColumns={visibleColumns}
            onVisibleColumnsChange={setVisibleColumns}
            isViewModeChanged={viewMode !== 'cards'}
            isVisibleColumnsChanged={JSON.stringify(visibleColumns) !== JSON.stringify(DEFAULT_VISIBLE_COLUMNS)}
          />

          {filteredPublications.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={selectAll}
              title={selectedIds.size === filteredPublications.length ? 'deselect_all' : 'select_all'}
            >
              {selectedIds.size === filteredPublications.length ? (
                <CheckSquare className="w-4 h-4 text-neon-green" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </Button>
          )}

          {selectedIds.size > 0 && (
            <Button
              variant="accent"
              onClick={() => onExportBibtex(selectedPublications)}
            >
              <Download className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline font-mono">export({selectedIds.size})</span>
            </Button>
          )}
        </div>
      </header>

      {/* Publication list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin overflow-x-hidden p-4 lg:p-8">
        {filteredPublications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-primary flex items-center justify-center mb-6 shadow-lg glow-purple">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold mb-2 font-mono">
              {searchQuery || filters.length > 0 ? 'no_results_found' : 'no_papers_yet'}
            </h3>
            <p className="text-muted-foreground max-w-sm mb-8 font-mono text-sm">
              {searchQuery || filters.length > 0
                ? '// try_adjusting_your_search_or_filters'
                : '// add_your_first_paper_to_start_building_your_library'}
            </p>
            {!searchQuery && filters.length === 0 && (
              <Button onClick={onAddPublication} variant="glow" className="font-mono">
                <Plus className="w-4 h-4 mr-2" />
                add_your_first_paper
              </Button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <PublicationTable
            publications={filteredPublications}
            tags={tags}
            vaults={vaults}
            publicationTagsMap={publicationTagsMap}
            publicationVaultsMap={publicationVaultsMap}
            relationsCountMap={relationsCountMap}
            selectedIds={selectedIds}
            visibleColumns={visibleColumns}
            onToggleSelect={toggleSelection}
            onEdit={onEditPublication}
            onDelete={onDeletePublication}
            onExportBibtex={(pub) => onExportBibtex([pub])}
          />
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {filteredPublications.map((pub, index) => (
              <div
                key={pub.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <PublicationCard
                  publication={pub}
                  tags={getPublicationTags(pub.id)}
                  allTags={tags}
                  vaults={vaults}
                  publicationVaults={publicationVaultsMap ? publicationVaultsMap[pub.id] || [] : []}
                  relationsCount={relationsCountMap[pub.id] || 0}
                  isSelected={selectedIds.has(pub.id)}
                  visibleColumns={visibleColumns}
                  onToggleSelect={() => toggleSelection(pub.id)}
                  onEdit={() => onEditPublication(pub)}
                  onDelete={() => onDeletePublication(pub)}
                  onExportBibtex={() => onExportBibtex([pub])}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
