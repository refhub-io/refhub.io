import { useState, useMemo } from 'react';
import { Publication, Vault } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExistingPaperSelectorProps {
  publications: Publication[];
  vaults: Vault[];
  currentVaultId: string | null;
  onAddToVaults: (publicationId: string, vaultIds: string[]) => Promise<void>;
}

export function ExistingPaperSelector({
  publications,
  vaults,
  currentVaultId,
  onAddToVaults,
}: ExistingPaperSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [selectedVaultIds, setSelectedVaultIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  // Filter publications based on search - show all if no query
  const filteredPublications = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    let results = publications;
    
    if (query) {
      results = publications.filter((pub) => {
        const titleMatch = pub.title.toLowerCase().includes(query);
        const authorMatch = pub.authors?.some(a => a.toLowerCase().includes(query));
        return titleMatch || authorMatch;
      });
    }
    
    return results.slice(0, 20); // Limit results for performance
  }, [publications, searchQuery]);

  const handleSelectPublication = (pub: Publication) => {
    setSelectedPublication(pub);
    setSearchQuery('');
    // Pre-select current vault if available
    if (currentVaultId) {
      setSelectedVaultIds(new Set([currentVaultId]));
    }
  };

  const toggleVault = (vaultId: string) => {
    const newSet = new Set(selectedVaultIds);
    if (newSet.has(vaultId)) {
      newSet.delete(vaultId);
    } else {
      newSet.add(vaultId);
    }
    setSelectedVaultIds(newSet);
  };

  const handleAdd = async () => {
    if (!selectedPublication || selectedVaultIds.size === 0) return;
    
    setIsAdding(true);
    try {
      await onAddToVaults(selectedPublication.id, Array.from(selectedVaultIds));
      // Reset state
      setSelectedPublication(null);
      setSelectedVaultIds(new Set());
    } finally {
      setIsAdding(false);
    }
  };

  const formatAuthors = (authors: string[]) => {
    if (!authors || authors.length === 0) return 'Unknown author';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  return (
    <div className="space-y-4">
      {!selectedPublication ? (
        <>
          <div className="space-y-2">
            <Label className="font-semibold">Search Your Papers</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or author..."
                className="pl-10 font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              // find papers from your library or shared vaults
            </p>
          </div>

          {/* Search Results */}
          <div className="border-2 rounded-lg max-h-60 overflow-hidden">
            <ScrollArea className="h-full max-h-60">
              <div className="p-2 space-y-1">
                {filteredPublications.length > 0 ? (
                  filteredPublications.map((pub) => (
                    <button
                      key={pub.id}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        "hover:bg-primary/10 hover:border-primary/30",
                        "focus:outline-none focus:ring-2 focus:ring-primary/50"
                      )}
                      onClick={() => handleSelectPublication(pub)}
                    >
                      <p className="font-medium text-sm line-clamp-2">{pub.title}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {formatAuthors(pub.authors || [])} • {pub.year || 'n.d.'}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                    {searchQuery.trim() 
                      ? `// no papers found matching "${searchQuery}"`
                      : '// no papers in your library yet'
                    }
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </>
      ) : (
        <>
          {/* Selected Paper */}
          <div className="space-y-2">
            <Label className="font-semibold">Selected Paper</Label>
            <div className="p-4 border-2 rounded-lg bg-primary/5 border-primary/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2">{selectedPublication.title}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {formatAuthors(selectedPublication.authors)} • {selectedPublication.year || 'n.d.'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedPublication(null);
                    setSelectedVaultIds(new Set());
                  }}
                  className="shrink-0 text-xs"
                >
                  Change
                </Button>
              </div>
            </div>
          </div>

          {/* Vault Selection */}
          <div className="space-y-2">
            <Label className="font-semibold">Add to Vaults</Label>
            <p className="text-xs text-muted-foreground font-mono mb-2">
              // select one or more vaults to add this paper
            </p>
            <div className="border-2 rounded-lg max-h-48 overflow-hidden">
              <ScrollArea className="h-full max-h-48">
                <div className="p-2 space-y-1">
                  {vaults.map((vault) => {
                    const isSelected = selectedVaultIds.has(vault.id);
                    const isCurrentVault = selectedPublication.vault_id === vault.id;
                    
                    return (
                      <button
                        key={vault.id}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                          isSelected
                            ? "bg-primary/10 border-primary/50"
                            : "hover:bg-muted/50 border-transparent",
                          isCurrentVault && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => !isCurrentVault && toggleVault(vault.id)}
                        disabled={isCurrentVault}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div
                          className="w-4 h-4 rounded-md shrink-0"
                          style={{ backgroundColor: vault.color }}
                        />
                        <span className="flex-1 text-sm font-medium truncate">
                          {vault.name}
                        </span>
                        {isCurrentVault && (
                          <span className="text-xs text-muted-foreground font-mono">
                            (current)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Add Button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="glow"
              onClick={handleAdd}
              disabled={isAdding || selectedVaultIds.size === 0}
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add to ${selectedVaultIds.size} Vault${selectedVaultIds.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
