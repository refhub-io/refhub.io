import { useState } from 'react';
import { Publication, Tag, Vault } from '@/types/database';
import { PublicationCard } from './PublicationCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Search, 
  Download, 
  Menu, 
  Filter,
  SortAsc,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PublicationListProps {
  publications: Publication[];
  tags: Tag[];
  vaults: Vault[];
  publicationTagsMap: Record<string, string[]>;
  selectedVault: Vault | null;
  onAddPublication: () => void;
  onEditPublication: (pub: Publication) => void;
  onDeletePublication: (pub: Publication) => void;
  onExportBibtex: (pubs: Publication[]) => void;
  onMobileMenuOpen: () => void;
}

export function PublicationList({
  publications,
  tags,
  vaults,
  publicationTagsMap,
  selectedVault,
  onAddPublication,
  onEditPublication,
  onDeletePublication,
  onExportBibtex,
  onMobileMenuOpen,
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
      <header className="bg-card border-b border-border px-4 lg:px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={onMobileMenuOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl lg:text-3xl font-bold truncate">
              {selectedVault ? selectedVault.name : 'All Publications'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredPublications.length} publication{filteredPublications.length !== 1 ? 's' : ''}
              {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
            </p>
          </div>

          <Button onClick={onAddPublication} className="shrink-0">
            <Plus className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">Add</span>
          </Button>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search publications..."
              className="pl-10"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <SortAsc className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy('created')}>
                Recently Added
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('year')}>
                Publication Year
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('title')}>
                Title A-Z
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
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </Button>
          )}

          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={() => onExportBibtex(selectedPublications)}
            >
              <Download className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">Export ({selectedIds.size})</span>
            </Button>
          )}
        </div>
      </header>

      {/* Publication list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
        {filteredPublications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              {searchQuery ? 'No results found' : 'No publications yet'}
            </h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Add your first publication to start building your library'}
            </p>
            {!searchQuery && (
              <Button onClick={onAddPublication}>
                <Plus className="w-4 h-4 mr-2" />
                Add Publication
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {filteredPublications.map((pub, index) => (
              <div
                key={pub.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <PublicationCard
                  publication={pub}
                  tags={getPublicationTags(pub.id)}
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
