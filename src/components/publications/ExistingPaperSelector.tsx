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
import { logger } from '@/lib/logger';
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
  /** The host dialog's open state — used to reset the review screen when the
   * dialog closes via any path (X, Escape, outside click), not just "done".
   * The host keeps this component mounted across opens (forceMount), so
   * without this a stale review screen from a prior add would otherwise
   * reappear on the next open. */
  open: boolean;
}

export function ExistingPaperSelector({
  publications,
  vaults,
  currentVaultId,
  onAddToVaults,
  onDone,
  open,
}: ExistingPaperSelectorProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [selectedVaultIds, setSelectedVaultIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [publicationVaults, setPublicationVaults] = useState<Map<string, Set<string>>>(new Map());

  // Pre-add relationship scan (Library tab): check the selected-but-not-yet-added
  // paper against a chosen vault's existing papers, before ever committing the
  // add. Replaces the old post-add auto-trigger (which silently did nothing
  // whenever the underlying copy insert failed to leave a resolvable row,
  // among other flow issues) with an explicit, user-initiated action available
  // the moment paper + vault are both known.
  //
  // The paper's own canonical `publications.id` is already real and stable
  // pre-add (unlike a not-yet-imported DOI paper), so it doubles as the
  // suggestion's placeholder id directly — no separate placeholder scheme
  // needed. Approved suggestions are staged locally, not persisted; handleAdd
  // reconciles the placeholder to the real vault_publications id once the add
  // actually completes, then inserts them for real.
  const [ephemeralSuggestions, setEphemeralSuggestions] = useState<RelationshipSuggestion[]>([]);
  const [stagedRelations, setStagedRelations] = useState<RelationshipSuggestion[]>([]);
  const [scanningEphemeral, setScanningEphemeral] = useState(false);

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

  // Filter publications based on search - show all if no query. No cap here:
  // this used to slice(0, 20) unconditionally regardless of the comment
  // above it, which meant scrolling the (already-working) ScrollArea could
  // never reveal a library's 21st+ paper -- a plain array filter over a
  // few hundred publications is well within a single render's budget, no
  // virtualization needed at that scale.
  const filteredPublications = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) return publications;

    return publications.filter((pub) => {
      const titleMatch = pub.title.toLowerCase().includes(query);
      const authorMatch = pub.authors?.some(a => a.toLowerCase().includes(query));
      return titleMatch || authorMatch;
    });
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

  // AddImportDialog keeps this component mounted across opens (its Radix
  // TabsContent only unmounts when the tab itself goes inactive), so leftover
  // ephemeral scan state from a previous session would otherwise leak into
  // the next one. Reset explicitly before starting a new cycle.
  const resetEphemeralRelationships = () => {
    setEphemeralSuggestions([]);
    setStagedRelations([]);
    setScanningEphemeral(false);
  };

  // Covers close paths that skip an explicit reset entirely (X, Escape,
  // outside click) — those close the host dialog directly.
  useEffect(() => {
    if (!open) resetEphemeralRelationships();
  }, [open]);

  // A scan is only meaningful for THIS specific paper+vault pairing -- once
  // either changes, stale suggestions/staged approvals no longer apply.
  const selectedVaultIdsKey = Array.from(selectedVaultIds).sort().join(',');
  useEffect(() => {
    resetEphemeralRelationships();
  }, [selectedPublication?.id, selectedVaultIdsKey]);

  const handleScanEphemeralRelationships = async () => {
    const doi = selectedPublication?.doi?.trim();
    if (!doi || selectedVaultIds.size !== 1) return;
    const vaultId = Array.from(selectedVaultIds)[0];
    setScanningEphemeral(true);
    try {
      const { data: vaultPubsData, error } = await supabase
        .from('vault_publications')
        .select('*')
        .eq('vault_id', vaultId);
      if (error) throw error;
      const vaultPublications = (vaultPubsData || []).map(formatVaultPublication);
      const found = await findRelationshipSuggestions(
        { id: selectedPublication!.id, doi, title: selectedPublication!.title },
        vaultPublications,
        [],
      );
      setEphemeralSuggestions(found);
    } catch (error) {
      showError('Could not check relationships', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setScanningEphemeral(false);
    }
  };

  // Approving here only stages the suggestion locally -- there's no real
  // vault_publications row for this paper yet to reference, so nothing is
  // written to publication_relations until handleAdd resolves the real copy
  // id after the paper is actually added.
  const handleApproveEphemeralSuggestion = (suggestion: RelationshipSuggestion) => {
    setStagedRelations((prev) => [...prev, suggestion]);
    setEphemeralSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== suggestionKey(suggestion)));
  };

  const handleDismissEphemeralSuggestion = (suggestion: RelationshipSuggestion) => {
    setEphemeralSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== suggestionKey(suggestion)));
  };

  const handleAdd = async () => {
    if (!selectedPublication || selectedVaultIds.size === 0) return;

    const addedPublication = selectedPublication;
    const vaultIds = Array.from(selectedVaultIds);
    const pendingStagedRelations = stagedRelations;

    setIsAdding(true);
    try {
      await onAddToVaults(addedPublication.id, vaultIds);
      setSelectedPublication(null);
      setSelectedVaultIds(new Set());

      // Commit any relationship suggestions staged during the pre-add scan
      // (see handleScanEphemeralRelationships above) — only meaningful for
      // the same single-vault pairing the scan itself was restricted to.
      if (vaultIds.length === 1 && pendingStagedRelations.length > 0 && user) {
        const vaultId = vaultIds[0];
        try {
          // publication_relations references vault_publications.id, not the
          // canonical publications.id we were given — resolve the copy that
          // onAddToVaults just created in this vault before linking anything.
          const { data: newCopy, error: newCopyError } = await supabase
            .from('vault_publications')
            .select('id')
            .eq('vault_id', vaultId)
            .eq('original_publication_id', addedPublication.id)
            .maybeSingle();

          if (newCopyError) throw newCopyError;

          if (!newCopy) {
            logger.error('ExistingPaperSelector', 'Could not resolve the vault_publications copy to commit staged relationships', {
              vaultId,
              originalPublicationId: addedPublication.id,
            });
            showError('Paper added, but could not save its relationships', "Couldn't find its new vault copy to link against.");
          } else {
            const rows = pendingStagedRelations.map((s) => ({
              publication_id: s.sourcePublicationId === addedPublication.id ? newCopy.id : s.sourcePublicationId,
              related_publication_id: s.targetPublicationId === addedPublication.id ? newCopy.id : s.targetPublicationId,
              relation_type: 'cites' as const,
              created_by: user.id,
            }));
            const { error: insertError } = await supabase.from('publication_relations').insert(rows);
            if (insertError) {
              logger.error('ExistingPaperSelector', 'Failed to commit staged relationship suggestions after add', insertError);
              showError('Paper added, but could not save its relationships', insertError.message);
            }
          }
        } catch (error) {
          showError('Paper added, but could not save its relationships', error instanceof Error ? error.message : 'Unknown error');
        }
      }

      resetEphemeralRelationships();
      onDone();
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
    <div className="space-y-4 flex flex-col min-h-[320px] sm:min-h-0 h-full">
      {!selectedPublication ? (
        <>
          <div className="space-y-2 shrink-0">
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
                  className="shrink-0 text-xs font-mono"
                >
                  change
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

          {/* Pre-add relationship scan — only meaningful for a single
              selected vault and a paper with a DOI; multiple target vaults
              stays out of scope (see the "multi-vault relationship scan"
              enhancement issue). */}
          {selectedPublication.doi?.trim() && selectedVaultIds.size === 1 && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground font-mono">
                  // scan_for_relationships
                  {stagedRelations.length > 0 && ` (${stagedRelations.length} staged)`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  disabled={scanningEphemeral}
                  onClick={handleScanEphemeralRelationships}
                >
                  {scanningEphemeral ? <LoadingSpinner size="xs" /> : 'scan'}
                </Button>
              </div>
              {ephemeralSuggestions.length > 0 && (
                <RelationshipSuggestionsList
                  suggestions={ephemeralSuggestions}
                  approvingKey={null}
                  onApprove={handleApproveEphemeralSuggestion}
                  onDismiss={handleDismissEphemeralSuggestion}
                />
              )}
              {stagedRelations.length > 0 && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  // will link {stagedRelations.length} relationship{stagedRelations.length === 1 ? '' : 's'} once added
                </p>
              )}
            </div>
          )}

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
                  adding...
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
