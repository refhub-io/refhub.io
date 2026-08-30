import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react';
import { useAllPublications } from '@/hooks/useAllPublications';
import { useSmartCollections } from '@/hooks/useSmartCollections';
import { applyFilters } from '@/components/publications/FilterBuilder';
import { PublicationList } from '@/components/publications/PublicationList';
import { SmartCollectionDialog } from '@/components/collections/SmartCollectionDialog';
import { exportMultipleToBibtex, downloadBibtex } from '@/lib/bibtex';
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
  const { publications, tags, vaults, publicationTagsMap, publicationVaultsMap, loading: publicationsLoading } =
    useAllPublications();
  const { collections, loading: collectionsLoading, updateCollection } = useSmartCollections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const collection = collections.find((c) => c.id === id) ?? null;

  const handleExportBibtex = (pubs: Publication[]) => {
    if (pubs.length === 0) return;
    downloadBibtex(exportMultipleToBibtex(pubs), `${collection?.name ?? 'smart-collection'}.bib`);
  };

  const filtered = useMemo(() => {
    if (!collection) return [];
    return applyFilters(publications, collection.filters, publicationTagsMap, publicationVaultsMap);
  }, [collection, publications, publicationTagsMap, publicationVaultsMap]);

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
      <Sidebar
        vaults={[]}
        selectedVaultId={null}
        onSelectVault={() => navigate('/dashboard')}
        onCreateVault={() => navigate('/dashboard')}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <main className="flex-1 lg:pl-72 p-6 md:p-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} />
            <Button variant="ghost" size="icon" onClick={() => navigate('/collections')} aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold font-mono flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              {collection?.name}
            </h1>
          </div>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit rules
          </Button>
        </div>

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
            onExportBibtex={handleExportBibtex}
            onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
          />
        )}

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
            onSave={(input) => updateCollection(collection.id, input)}
          />
        )}
      </main>
    </div>
  );
}
