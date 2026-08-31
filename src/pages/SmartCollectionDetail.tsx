import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useAllPublications } from '@/hooks/useAllPublications';
import { useSmartCollections } from '@/hooks/useSmartCollections';
import { supabase } from '@/integrations/supabase/client';
import { applyFilters } from '@/components/publications/FilterBuilder';
import { PublicationList } from '@/components/publications/PublicationList';
import { SmartCollectionDialog } from '@/components/collections/SmartCollectionDialog';
import { VaultAugmentDialog, type AugmentTab } from '@/components/publications/VaultAugmentDialog';
import { exportMultipleToBibtex, downloadBibtex } from '@/lib/bibtex';
import type { SSPaper } from '@/lib/semanticScholar';
import type { Publication } from '@/types/database';

const RULE_HINTS: Record<string, string> = {
  year: 'try loosening the year range',
  tags: 'try removing a tag rule',
  vault: 'try removing the vault rule',
  reading_state: 'try removing the reading-state rule',
};

export default function SmartCollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { publications, tags, vaults, publicationTagsMap, publicationVaultsMap, loading: publicationsLoading, refetch } =
    useAllPublications();
  const { collections, loading: collectionsLoading, updateCollection } = useSmartCollections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // A smart collection has no membership to add newly-discovered papers into
  // (it's filter rules, not a container) — unlike a vault. "Discover" here
  // asks which of the user's own vaults a found paper should actually land
  // in, then runs the same Semantic Scholar dialog vault pages already use.
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);
  const [augmentSeedPublications, setAugmentSeedPublications] = useState<Publication[]>([]);
  const [targetVaultId, setTargetVaultId] = useState<string | null>(null);
  const [isAugmentDialogOpen, setIsAugmentDialogOpen] = useState(false);

  const collection = collections.find((c) => c.id === id) ?? null;

  // useAllPublications() merges owned + shared vaults into one array; split
  // them back out here (rather than changing that hook's return shape) so
  // the sidebar can show "my vaults" vs "shared with me" correctly.
  const ownedVaults = useMemo(() => vaults.filter((v) => v.user_id === user?.id), [vaults, user?.id]);
  const sharedVaults = useMemo(() => vaults.filter((v) => v.user_id !== user?.id), [vaults, user?.id]);

  const handleExportBibtex = (pubs: Publication[]) => {
    if (pubs.length === 0) return;
    downloadBibtex(exportMultipleToBibtex(pubs), `${collection?.name ?? 'smart-collection'}.bib`);
  };

  const filtered = useMemo(() => {
    if (!collection) return [];
    return applyFilters(publications, collection.filters, publicationTagsMap, publicationVaultsMap);
  }, [collection, publications, publicationTagsMap, publicationVaultsMap]);

  // The paper picker for "add this Semantic Scholar result" only needs to
  // dedupe against whatever's already in the chosen target vault, not the
  // whole cross-vault publication set.
  const targetVaultPublications = useMemo(() => {
    if (!targetVaultId) return [];
    return publications.filter((p) => (publicationVaultsMap[p.id] || []).includes(targetVaultId));
  }, [publications, publicationVaultsMap, targetVaultId]);

  const handleAddSSPaper = async (paper: SSPaper, _tab: AugmentTab, _sourcePublicationIds: string[]) => {
    if (!user || !targetVaultId) return;
    const { error } = await supabase.from('vault_publications').insert({
      vault_id: targetVaultId,
      created_by: user.id,
      title: paper.title,
      authors: paper.authors.map((a) => a.name),
      year: paper.year,
      doi: paper.externalIds?.DOI ?? null,
      url: paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : null,
      publication_type: 'article',
      abstract: paper.abstract,
      pdf_url: paper.openAccessPdfUrl,
      reading_state: 'unread',
    });
    if (error) throw error;
    toast({ title: 'Paper added ✨' });
    refetch();
  };

  const loading = publicationsLoading || collectionsLoading;

  if (!loading && !collection) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <p className="font-mono text-muted-foreground">Smart collection not found.</p>
      </div>
    );
  }

  const emptyRuleHint = collection?.filters.map((f) => RULE_HINTS[f.field]).find(Boolean);

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarDndBoundary
        vaults={ownedVaults}
        sharedVaults={sharedVaults}
        selectedVaultId={null}
        onSelectVault={(vaultId) => (vaultId ? navigate(`/vault/${vaultId}`) : navigate('/dashboard'))}
        onCreateVault={() => navigate('/dashboard?createVault=1')}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <main className="flex-1 lg:pl-72 flex flex-col min-h-screen">
        {/* Slim back-nav + edit-rules bar. The title/item-count itself comes
            from PublicationList's own header below (via listTitle) — matching
            vault pages, which never duplicate the title above PublicationList
            either — so this bar stays a single line with no leftover gap. */}
        <div className="flex items-center justify-between px-4 lg:px-8 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1">
            <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} />
            <Button variant="ghost" size="icon" onClick={() => navigate('/collections')} aria-label="Back to collections">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit rules
          </Button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        )}

        {!loading && collection && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground font-mono">
            <p>No papers match this collection's rules.</p>
            {emptyRuleHint && <p className="text-sm mt-1">{emptyRuleHint}</p>}
          </div>
        )}

        {!loading && collection && filtered.length > 0 && (
          <PublicationList
            publications={filtered}
            tags={tags}
            vaults={vaults}
            publicationTagsMap={publicationTagsMap}
            publicationVaultsMap={publicationVaultsMap}
            relationsCountMap={{}}
            selectedVault={null}
            listTitle={collection?.name}
            dragDisabled
            onExportBibtex={handleExportBibtex}
            onDiscoverRelated={ownedVaults.length > 0 ? (pubs) => {
              setAugmentSeedPublications(pubs);
              setTargetVaultId(null);
              setIsVaultPickerOpen(true);
            } : undefined}
            onDiscoverByTopic={ownedVaults.length > 0 ? () => {
              setAugmentSeedPublications([]);
              setTargetVaultId(null);
              setIsVaultPickerOpen(true);
            } : undefined}
            onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
          />
        )}

        <Dialog open={isVaultPickerOpen} onOpenChange={setIsVaultPickerOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-mono">discover_related_papers</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground font-mono">
              // a_smart_collection_has_no_papers_of_its_own — pick a vault to add anything you find to
            </p>
            <Select value={targetVaultId ?? undefined} onValueChange={setTargetVaultId}>
              <SelectTrigger className="font-mono text-sm">
                <SelectValue placeholder="choose a vault..." />
              </SelectTrigger>
              <SelectContent>
                {ownedVaults.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="font-mono text-sm">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsVaultPickerOpen(false)} className="font-mono">
                cancel
              </Button>
              <Button
                variant="glow"
                disabled={!targetVaultId}
                onClick={() => {
                  setIsVaultPickerOpen(false);
                  setIsAugmentDialogOpen(true);
                }}
                className="font-mono"
              >
                continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <VaultAugmentDialog
          open={isAugmentDialogOpen}
          onOpenChange={setIsAugmentDialogOpen}
          publications={augmentSeedPublications}
          vaultPublications={targetVaultPublications}
          onAddPaper={handleAddSSPaper}
        />

        {collection && (
          <SmartCollectionDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            editingCollection={collection}
            allPublications={publications}
            tags={tags}
            vaults={vaults}
            publicationTagsMap={publicationTagsMap}
            publicationVaultsMap={publicationVaultsMap}
            onSave={async (input) => {
              const result = await updateCollection(collection.id, input);
              if (!result) throw new Error('Failed to save smart collection');
            }}
          />
        )}
      </main>
    </div>
  );
}
