import { useState } from 'react';
import { Publication, Tag, Vault } from '@/types/database';
import { PublicationCard } from './PublicationCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { 
  Plus, 
  Search, 
  Download, 
  Menu, 
  SortAsc,
  CheckSquare,
  Square,
  Sparkles,
  Command,
  Upload,
  Network,
  Settings
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
  relationsCountMap: Record<string, number>;
  selectedVault: Vault | null;
  onAddPublication: () => void;
  onImportPublications: () => void;
  onEditPublication: (pub: Publication) => void;
  onDeletePublication: (pub: Publication) => void;
  onExportBibtex: (pubs: Publication[]) => void;
  onMobileMenuOpen: () => void;
  onOpenGraph: () => void;
  onEditVault?: (vault: Vault) => void;
}

export function PublicationList({
  publications,
  tags,
  vaults,
  publicationTagsMap,
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
}: PublicationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'created'>('created');

  const filteredPublications = publications
    .filter((pub) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        pub.title.toLowerCase().includes(searchLower) ||
        pub.authors.some((a) => a.toLowerCase().includes(searchLower)) ||
        pub.journal?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
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
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-4 lg:px-8 py-5 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={onMobileMenuOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              {selectedVault && (
                <div 
                  className="w-4 h-4 rounded-md shrink-0 shadow-sm"
                  style={{ backgroundColor: selectedVault.color }}
                />
              )}
              <h1 className="text-2xl lg:text-3xl font-bold truncate">
                {selectedVault ? selectedVault.name : (
                  <>
                    <span className="text-gradient">All Papers</span>
                  </>
                )}
              </h1>
              {selectedVault && onEditVault && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
                  onClick={() => onEditVault(selectedVault)}
                  title="Edit vault settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              {filteredPublications.length} item{filteredPublications.length !== 1 ? 's' : ''}
              {selectedIds.size > 0 && (
                <span className="text-neon-green"> • {selectedIds.size} selected</span>
              )}
            </p>
          </div>

          <NotificationDropdown />

          <Button onClick={onOpenGraph} variant="outline" size="icon" className="shrink-0" title="View relationship graph">
            <Network className="w-4 h-4" />
          </Button>

          <Button onClick={onImportPublications} variant="outline" className="shrink-0">
            <Upload className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">Import</span>
          </Button>

          <Button onClick={onAddPublication} variant="glow" className="shrink-0">
            <Plus className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">Add Paper</span>
          </Button>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-3 mt-5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search papers..."
              className="pl-11 font-mono"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <SortAsc className="w-4 h-4" />
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

          {filteredPublications.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={selectAll}
              title={selectedIds.size === filteredPublications.length ? 'Deselect all' : 'Select all'}
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
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-8">
        {filteredPublications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-primary flex items-center justify-center mb-6 shadow-lg glow-purple">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold mb-2">
              {searchQuery ? 'No results found' : 'No papers yet'}
            </h3>
            <p className="text-muted-foreground max-w-sm mb-8 font-mono text-sm">
              {searchQuery
                ? '// try adjusting your search terms'
                : '// add your first paper to start building your library'}
            </p>
            {!searchQuery && (
              <Button onClick={onAddPublication} variant="glow">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Paper
              </Button>
            )}
          </div>
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
                  relationsCount={relationsCountMap[pub.id] || 0}
                  isSelected={selectedIds.has(pub.id)}
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
