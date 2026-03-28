import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Publication, Tag, Vault } from '@/types/database';
import { PublicationCard } from './PublicationCard';
import { PublicationTable } from './PublicationTable';
import { PublicationFilter, applyFilters } from './FilterBuilder';
import { ViewSettings, ViewMode, VisibleColumns, DEFAULT_VISIBLE_COLUMNS } from './ViewSettings';
import { useViewSettingsPersistence, SortField, SortDirection } from '@/hooks/useViewSettingsPersistence';
import { QRCodeDialog } from '@/components/vaults/QRCodeDialog';
import { TagManager } from '@/components/tags/TagManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { PersistentFilterBuilder } from './PersistentFilterBuilder';
import { useKeyboardNavigation, useHotkeys } from '@/hooks/useKeyboardNavigation';
import { KbdFooterHint, KbdHint } from '@/components/ui/KbdHint';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
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
  BarChart3,
  Settings,
  MoreVertical,
  Tags,
  Telescope,
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
  vaultOwnerName?: string; // Display owner name next to item count
  isVaultContext?: boolean; // If true, shows "remove from vault" instead of "delete"
  onAddPublication?: () => void;
  onEditPublication?: (pub: Publication) => void;
  onOpenPublication?: (pub: Publication) => void;
  publicationActionLabel?: string;
  onDeletePublication?: (pub: Publication) => void;
  onExportBibtex: (pubs: Publication[]) => void;
  onDiscoverRelated?: (pubs: Publication[]) => void;
  onMobileMenuOpen: () => void;
  onOpenGraph?: () => void;
  onEditVault?: (vault: Vault) => void;
  onVaultUpdate?: () => void;
  // Tag management props (optional - only shown if canEdit is true)
  canEditTags?: boolean;
  onUpdateTag?: (tagId: string, updates: Partial<Tag>) => Promise<Tag | null>;
  onDeleteTag?: (tagId: string) => Promise<{ success: boolean; error?: Error }>;
  onCreateTag?: (name: string, parentId?: string) => Promise<Tag | null>;
}

export function PublicationList({
  publications,
  tags,
  vaults,
  publicationTagsMap,
  publicationVaultsMap,
  relationsCountMap,
  selectedVault,
  vaultOwnerName,
  isVaultContext = false,
  onAddPublication,
  onEditPublication,
  onOpenPublication,
  publicationActionLabel = 'edit',
  onDeletePublication,
  onExportBibtex,
  onDiscoverRelated,
  onMobileMenuOpen,
  onOpenGraph,
  onEditVault,
  onVaultUpdate,
  canEditTags,
  onUpdateTag,
  onDeleteTag,
  onCreateTag,
}: PublicationListProps) {
  const openPublication = onOpenPublication || onEditPublication;
  const [searchQuery, setSearchQuery] = useState('');
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const { pushContext, popContext } = useKeyboardContext();

  // While any toolbar popup is open, push 'dialog' context so publication-list
  // shortcuts (j/k/up/down/space/enter) don't fire inside them. Radix handles
  // arrow key / Escape navigation natively. When all popups close, context pops
  // back to publication-list automatically.
  useEffect(() => {
    if (filterOpen || sortDropdownOpen || propertiesOpen) {
      pushContext('dialog');
      return () => popContext();
    }
  }, [filterOpen, sortDropdownOpen, propertiesOpen, pushContext, popContext]);

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
    sortDirection: persistedSortDirection,
    filters: persistedFilters,
    updateViewMode,
    updateVisibleColumns,
    updateSortBy,
    updateFilters
  } = useViewSettingsPersistence();

  const [viewMode, setViewMode] = useState<ViewMode>(persistedViewMode);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(persistedVisibleColumns);
  // Use the persisted value as initial state for sortBy
  const [sortBy, setSortBy] = useState<SortField>(persistedSortBy);
  const [sortDirection, setSortDirection] = useState<SortDirection>(persistedSortDirection);
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
    updateSortBy(sortBy, sortDirection);
  }, [sortBy, sortDirection, updateSortBy]);

  useEffect(() => {
    updateFilters(filters);
  }, [filters, updateFilters]);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const dir = sortDirection === 'asc' ? 1 : -1;
  const filteredPublications = customFiltered.sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return dir * a.title.localeCompare(b.title);
      case 'authors': {
        const aFirst = a.authors[0] || '';
        const bFirst = b.authors[0] || '';
        return dir * aFirst.localeCompare(bFirst);
      }
      case 'year':
        return dir * ((a.year || 0) - (b.year || 0));
      case 'journal': {
        const aJ = a.journal || '';
        const bJ = b.journal || '';
        return dir * aJ.localeCompare(bJ);
      }
      case 'type': {
        const aT = a.publication_type || '';
        const bT = b.publication_type || '';
        return dir * aT.localeCompare(bT);
      }
      case 'created':
      default:
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  });

  // Handler for table header sort clicks
  const handleTableSort = useCallback((field: SortField) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      // Default direction per field: year/created default desc, others default asc
      setSortDirection(field === 'year' || field === 'created' ? 'desc' : 'asc');
    }
  }, [sortBy]);

  // ─── Keyboard navigation ─────────────────────────────────────────────────
  // kbNav is declared first so toggleSelection/selectAll can use it as the
  // single source of truth for selection, eliminating the dual-state problem.
  const kbContext = viewMode === 'table' ? 'publication-table' as const : 'publication-list' as const;
  const itemIds = useMemo(() => filteredPublications.map((p) => p.id), [filteredPublications]);

  const handleKbOpen = useCallback(
    (id: string) => {
      const pub = filteredPublications.find((p) => p.id === id);
      if (pub && openPublication) openPublication(pub);
    },
    [filteredPublications, openPublication],
  );

  const handleKbDelete = useCallback(
    (ids: string[]) => {
      if (!onDeletePublication) return;
      const pub = publications.find((p) => ids.includes(p.id));
      if (pub) onDeletePublication(pub);
    },
    [publications, onDeletePublication],
  );

  const handleKbToggleView = useCallback(() => {
    setViewMode((prev) => (prev === 'cards' ? 'table' : 'cards'));
    setFilterOpen(false);
    setSortDropdownOpen(false);
    setPropertiesOpen(false);
  }, []);

  const handleKbExport = useCallback(
    (ids: string[]) => {
      const pubs = publications.filter((p) => ids.includes(p.id));
      if (pubs.length > 0) onExportBibtex(pubs);
    },
    [publications, onExportBibtex],
  );

  const kbNav = useKeyboardNavigation({
    context: kbContext,
    itemIds,
    onOpen: handleKbOpen,
    onDelete: handleKbDelete,
    onToggleView: handleKbToggleView,
    onExport: handleKbExport,
    activateOnMount: true,
    bootstrapOnNav: true,
    containerRef: listContainerRef as React.RefObject<HTMLElement>,
    resetKey: selectedVault?.id ?? 'all_papers',
  });

  // kbNav.selectedIds is the single source of truth for selection.
  // Both keyboard (Space) and click-based selection update kbNav directly.
  const selectedIds = kbNav.selectedIds;

  const toggleSelection = useCallback((id: string) => {
    kbNav.setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbNav.setSelectedIds]);

  const selectAll = useCallback(() => {
    const allFilteredSelected =
      filteredPublications.length > 0 &&
      filteredPublications.every((p) => kbNav.selectedIds.has(p.id));
    if (allFilteredSelected) {
      kbNav.clearSelection();
    } else {
      kbNav.setSelectedIds(new Set(filteredPublications.map((p) => p.id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPublications, kbNav.selectedIds, kbNav.clearSelection, kbNav.setSelectedIds]);

  const getPublicationTags = (pubId: string): Tag[] => {
    const tagIds = publicationTagsMap[pubId] || [];
    return tags.filter((t) => tagIds.includes(t.id));
  };

  const selectedPublications = publications.filter((p) => selectedIds.has(p.id));


  // Meta+K / Ctrl+K → focus search (registered through keyboard system)
  useHotkeys(
    'global',
    [
      {
        combo: 'Meta+k',
        description: 'Focus search',
        handler: (e) => {
          e.preventDefault();
          searchInputRef.current?.focus();
          return true;
        },
        allowInInput: true,
      },
    ],
    [],
  );

  // publication-list context: p, f, s shortcuts
  useHotkeys(
    kbContext,
    [
      {
        combo: 'p',
        description: 'Show properties popup',
        handler: (e) => {
          e.preventDefault();
          setPropertiesOpen((prev) => !prev);
          setFilterOpen(false);
          setSortDropdownOpen(false);
          return true;
        },
      },
      {
        combo: 'f',
        description: 'Show filter popup',
        handler: (e) => {
          e.preventDefault();
          setFilterOpen((prev) => !prev);
          setSortDropdownOpen(false);
          setPropertiesOpen(false);
          return true;
        },
      },
      {
        combo: 's',
        description: 'Show sort popup',
        handler: (e) => {
          e.preventDefault();
          setSortDropdownOpen((prev) => !prev);
          setFilterOpen(false);
          setPropertiesOpen(false);
          return true;
        },
      },
      {
        combo: 'r',
        description: 'Discover related papers',
        handler: (e) => {
          if (!onDiscoverRelated || selectedPublications.length === 0) return false;
          e.preventDefault();
          onDiscoverRelated(selectedPublications);
          return true;
        },
      },
    ],
    [kbContext, onDiscoverRelated, selectedPublications],
  );

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
              {vaultOwnerName && (
                <span>by {vaultOwnerName} • </span>
              )}
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
                <BarChart3 className="w-4 h-4 mr-2" />
                vault_analytics
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
                      onCreateTag={onCreateTag}
                      tagUsageCounts={tagUsageCounts}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}

            {/* Mobile dropdown with gradient styling */}
            {(onOpenGraph || (selectedVault && onEditVault) || (canEditTags && onUpdateTag && onDeleteTag)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="glow" size="icon" className="h-9 w-9 lg:hidden" title="More actions">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono">
                  {onOpenGraph && (
                    <DropdownMenuItem onClick={onOpenGraph}>
                      <BarChart3 className="w-4 h-4 mr-2" />
                      vault_analytics
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
          {/* Search input — left side, grows to fill available space */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="search_papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 font-mono"
            />
          </div>

          {/* Filter button with shortcut hint */}
          <div className="flex items-center">
            <KbdHint shortcut="f" size="xs" className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4 mr-1" />
            <div className={cn(
              "relative overflow-visible",
              persistedFilters.length > 0 && 'bg-primary/10 border-primary/30 rounded-md'
            )}>
              <PersistentFilterBuilder
                tags={tags}
                vaults={vaults}
                onFiltersChange={setFilters}
                open={filterOpen}
                onOpenChange={setFilterOpen}
              />
              {persistedFilters.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full z-10"></span>
              )}
            </div>
          </div>

          {/* Sort button with shortcut hint */}
          <div className="flex items-center">
            <KbdHint shortcut="s" size="xs" className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4 mr-1" />
            <div className="relative overflow-visible">
              <DropdownMenu open={sortDropdownOpen} onOpenChange={setSortDropdownOpen}>
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
                    {sortBy !== 'created' && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full z-10"></span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono">
                  <DropdownMenuItem onClick={() => { setSortBy('created'); setSortDirection('desc'); }}>
                    recently_added
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortBy('year'); setSortDirection('desc'); }}>
                    publication_year
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortBy('title'); setSortDirection('asc'); }}>
                    title_asc
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* View toggle and properties — hints rendered adjacent to each control inside ViewSettings */}
          <ViewSettings
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            visibleColumns={visibleColumns}
            onVisibleColumnsChange={setVisibleColumns}
            isViewModeChanged={viewMode !== 'cards'}
            isVisibleColumnsChanged={JSON.stringify(visibleColumns) !== JSON.stringify(DEFAULT_VISIBLE_COLUMNS)}
            viewHint={<KbdHint shortcut="v" size="xs" className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4" />}
            propertiesHint={<KbdHint shortcut="p" size="xs" className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4" />}
            propertiesOpen={propertiesOpen}
            onPropertiesOpenChange={setPropertiesOpen}
          />

          {selectedIds.size > 0 && onDiscoverRelated && (
            <div className="flex items-center">
              <KbdHint shortcut="r" size="xs" className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4 mr-1" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => onDiscoverRelated(selectedPublications)}
                className="h-9 w-9 sm:w-auto sm:px-3 font-mono"
              >
                <Telescope className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">discover_related</span>
              </Button>
            </div>
          )}

          {filteredPublications.length > 0 && (
            <div className="flex items-center">
              <KbdHint
                shortcut={selectedIds.size > 0 ? 'Ctrl+D' : 'Ctrl+A'}
                size="xs"
                className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4 mr-1"
              />
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
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center">
              <KbdHint shortcut="Ctrl+E" size="xs" className="hidden md:inline-flex !px-1 !py-0.5 !text-[10px] !leading-none !h-4 mr-1" />
              <Button
                variant="accent"
                onClick={() => onExportBibtex(selectedPublications)}
              >
                <Download className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline font-mono">export({selectedIds.size})</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Keyboard navigation hint bar */}
      {filteredPublications.length > 0 && (
        <KbdFooterHint className="shrink-0 hidden md:flex" />
      )}

      {/* Publication list */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin overflow-x-hidden p-4 lg:p-8 outline-none"
        {...kbNav.containerProps}
      >
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
            isVaultContext={isVaultContext}
            onToggleSelect={toggleSelection}
            onOpen={openPublication}
            primaryActionLabel={publicationActionLabel}
            onDelete={onDeletePublication}
            onExportBibtex={(pub) => onExportBibtex([pub])}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleTableSort}
            focusedIndex={kbNav.focusedIndex}
            kbItemProps={kbNav.itemProps}
          />
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {filteredPublications.map((pub, index) => (
              <div
                key={pub.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
                {...kbNav.itemProps(index, pub.id)}
              >
                <PublicationCard
                  publication={pub}
                  tags={getPublicationTags(pub.id)}
                  allTags={tags}
                  vaults={vaults}
                  publicationVaults={publicationVaultsMap ? publicationVaultsMap[pub.id] || [] : []}
                  relationsCount={relationsCountMap[pub.id] || 0}
                  isSelected={selectedIds.has(pub.id)}
                  isFocused={kbNav.isFocused(index)}
                  visibleColumns={visibleColumns}
                  isVaultContext={isVaultContext}
                  onToggleSelect={() => toggleSelection(pub.id)}
                  onOpen={openPublication ? () => openPublication(pub) : undefined}
                  primaryActionLabel={publicationActionLabel}
                  onDelete={onDeletePublication ? () => onDeletePublication(pub) : undefined}
                  onExportBibtex={() => onExportBibtex([pub])}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ARIA live region for selection announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedIds.size > 0 && `${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} selected`}
      </div>
    </div>
  );
}
