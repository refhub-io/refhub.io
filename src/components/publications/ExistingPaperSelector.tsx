import { useState, useMemo, useEffect } from 'react';
import { Publication, Vault } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Check } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { showError } from '@/lib/toast';
import { formatVaultPublication } from '@/lib/formatVaultPublication';
import { findRelationshipSuggestions, type RelationshipSuggestion } from '@/lib/relationshipSuggestions';
import { RelationshipSuggestionsList, suggestionKey } from './RelationshipSuggestionsList';

interface ExistingPaperSelectorProps {
  publications: Publication[];
  vaults: Vault[];
  currentVaultId: string | null;
  onAddToVaults: (publicationId: string, vaultIds: string[]) => Promise<void>;
  /** Called once the user is done reviewing (or there was nothing to review) — the host dialog should close. */
  onDone: () => void;
}

export function ExistingPaperSelector({
  publications,
  vaults,
  currentVaultId,
  onAddToVaults,
  onDone,
}: ExistingPaperSelectorProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [selectedVaultIds, setSelectedVaultIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [publicationVaults, setPublicationVaults] = useState<Map<string, Set<string>>>(new Map());

  // Entry point 2 (Library tab): once the paper has been added, check it against
  // the first selected vault's publications for citation relationships — the DOI
  // is already known, so there's no reason to wait for a separate manual trigger.
  // Non-null once an add has completed and there's something to check/review.
  const [checkedVaultName, setCheckedVaultName] = useState<string | null>(null);
  const [checkingRelationships, setCheckingRelationships] = useState(false);
  const [suggestions, setSuggestions] = useState<RelationshipSuggestion[]>([]);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  // Load which vaults each publication already has a copy in. Vault content
  // lives in vault_publications (one row per vault, copied from the
  // canonical publications row), not a vault_papers join table — each copy
  // points back to its source via original_publication_id.
  useEffect(() => {
    const loadPublicationVaults = async () => {
      if (publications.length === 0) return;

      const { data, error } = await supabase
        .from('vault_publications')
        .select('vault_id, original_publication_id')
        .in('original_publication_id', publications.map(p => p.id));

      if (!error && data) {
        const vaultMap = new Map<string, Set<string>>();
        data.forEach(item => {
          if (!item.original_publication_id) return;
          if (!vaultMap.has(item.original_publication_id)) {
            vaultMap.set(item.original_publication_id, new Set());
          }
          vaultMap.get(item.original_publication_id)!.add(item.vault_id);
        });
        setPublicationVaults(vaultMap);
      }
    };

    loadPublicationVaults();
  }, [publications]);

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

    const addedPublication = selectedPublication;
    const vaultIds = Array.from(selectedVaultIds);

    setIsAdding(true);
    try {
      await onAddToVaults(addedPublication.id, vaultIds);
      setSelectedPublication(null);
      setSelectedVaultIds(new Set());

      const doi = addedPublication.doi?.trim();
      if (!doi) {
        // No DOI, no citation data to check — same precondition as the other
        // relationship-suggestion entry points.
        onDone();
        return;
      }

      const firstVaultId = vaultIds[0];
      const firstVaultName = vaults.find((v) => v.id === firstVaultId)?.name ?? 'this vault';
      setCheckedVaultName(firstVaultName);
      setCheckingRelationships(true);
      try {
        // publication_relations references vault_publications.id, not the
        // canonical publications.id we were given — resolve the copy that
        // onAddToVaults just created in this vault before checking anything.
        const { data: newCopy } = await supabase
          .from('vault_publications')
          .select('id')
          .eq('vault_id', firstVaultId)
          .eq('original_publication_id', addedPublication.id)
          .maybeSingle();

        if (!newCopy) {
          setSuggestions([]);
          return;
        }

        const { data: vaultPubsData } = await supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', firstVaultId);
        const vaultPublications = (vaultPubsData || []).map(formatVaultPublication);

        // The just-created copy can't appear in any existing publication_relations
        // row yet (nothing could reference an id that didn't exist before this
        // add), so there's nothing to fetch there — an empty array is exact, not
        // an approximation.
        const found = await findRelationshipSuggestions(
          { id: newCopy.id, doi, title: addedPublication.title },
          vaultPublications,
          [],
        );
        setSuggestions(found);
      } catch {
        // Best-effort — a failed check just means nothing to review; the user
        // can still use the manual "check_relationships" button later.
        setSuggestions([]);
      } finally {
        setCheckingRelationships(false);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleApproveSuggestion = async (suggestion: RelationshipSuggestion) => {
    if (!user) return;
    setApprovingKey(suggestionKey(suggestion));
    try {
      const { error } = await supabase.from('publication_relations').insert({
        publication_id: suggestion.sourcePublicationId,
        related_publication_id: suggestion.targetPublicationId,
        relation_type: 'cites',
        created_by: user.id,
      });

      if (error) {
        if (error.code === '23505') {
          showError('Already linked', 'These papers are already linked.');
        } else if (error.code === '42501' || error.message?.includes('row-level security')) {
          showError('Permission denied', "You don't have permission to link papers in this vault.");
        } else {
          showError('Could not save relationship', error.message);
        }
        return;
      }

      setSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== suggestionKey(suggestion)));
    } finally {
      setApprovingKey(null);
    }
  };

  const handleDismissSuggestion = (suggestion: RelationshipSuggestion) => {
    setSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== suggestionKey(suggestion)));
  };

  const formatAuthors = (authors: string[]) => {
    if (!authors || authors.length === 0) return 'Unknown author';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  return (
    <div className="space-y-4 flex flex-col min-h-[320px] sm:min-h-0 h-full">
      {checkedVaultName ? (
        <>
          <div className="space-y-2">
            <Label className="font-semibold font-mono">check_relationships</Label>
            <p className="text-xs text-muted-foreground font-mono">
              // checking "{checkedVaultName}" for citation relationships
            </p>
          </div>

          {checkingRelationships ? (
            <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground font-mono">
              <LoadingSpinner size="xs" />
              checking_relationships...
            </div>
          ) : suggestions.length > 0 ? (
            <RelationshipSuggestionsList
              suggestions={suggestions}
              approvingKey={approvingKey}
              onApprove={handleApproveSuggestion}
              onDismiss={handleDismissSuggestion}
            />
          ) : (
            <p className="text-xs text-muted-foreground font-mono py-4">
              // no citation relationships found
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="glow" onClick={onDone} disabled={checkingRelationships}>
              done
            </Button>
          </div>
        </>
      ) : !selectedPublication ? (
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
          <div className="border-2 rounded-lg flex-1 min-h-0">
            <ScrollArea className="h-full max-h-full min-h-0">
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
            <Label className="font-semibold font-mono">add_to_vaults</Label>
            <p className="text-xs text-muted-foreground font-mono mb-2">
              // select one or more vaults to add this paper
            </p>
            <div className="border-2 rounded-lg max-h-48">
              <ScrollArea className="max-h-48 min-h-[120px] sm:min-h-0 sm:max-h-48 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {vaults.map((vault) => {
                    const isSelected = selectedVaultIds.has(vault.id);
                    const publicationVaultIds = publicationVaults.get(selectedPublication.id) || new Set();
                    const isCurrentVault = publicationVaultIds.has(vault.id);
                    
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
                  <LoadingSpinner size="xs" className="mr-2" />
                  Adding...
                </>
              ) : (
                `add_to_${selectedVaultIds.size}_vault${selectedVaultIds.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
