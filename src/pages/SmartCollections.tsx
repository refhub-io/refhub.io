import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sparkles, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAllPublications } from '@/hooks/useAllPublications';
import { useSmartCollections } from '@/hooks/useSmartCollections';
import { SmartCollectionDialog } from '@/components/collections/SmartCollectionDialog';
import { applyFilters } from '@/components/publications/FilterBuilder';
import type { SmartCollection, Tag, Vault } from '@/types/database';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function summarizeFilters(collection: SmartCollection, tags: Tag[], vaults: Vault[]): string {
  if (collection.filters.length === 0) return 'no rules yet';
  return collection.filters
    .map((f) => {
      let displayValue = f.value;
      if (f.field === 'tags') displayValue = tags.find((t) => t.id === f.value)?.name ?? f.value;
      if (f.field === 'vault') displayValue = vaults.find((v) => v.id === f.value)?.name ?? f.value;
      return `${f.field} ${f.operator.replace('_', ' ')}${displayValue ? ` ${displayValue}` : ''}`;
    })
    .join(' · ');
}

export default function SmartCollections() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { publications, tags, vaults, publicationTagsMap, publicationVaultsMap } = useAllPublications();
  const { collections, loading, createCollection, updateCollection, deleteCollection } = useSmartCollections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<SmartCollection | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<SmartCollection | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter((c) => c.name.toLowerCase().includes(query));
  }, [collections, searchQuery]);

  // useAllPublications() merges owned + shared vaults into one array; split
  // them back out here (rather than changing that hook's return shape) so
  // the sidebar can show "my vaults" vs "shared with me" correctly.
  const ownedVaults = useMemo(() => vaults.filter((v) => v.user_id === user?.id), [vaults, user?.id]);
  const sharedVaults = useMemo(() => vaults.filter((v) => v.user_id !== user?.id), [vaults, user?.id]);

  const openCreateDialog = () => {
    setEditingCollection(null);
    setDialogOpen(true);
  };

  const openEditDialog = (collection: SmartCollection) => {
    setEditingCollection(collection);
    setDialogOpen(true);
  };

  const handleSave = async (input: Parameters<typeof createCollection>[0]) => {
    const result = editingCollection
      ? await updateCollection(editingCollection.id, input)
      : await createCollection(input);
    if (!result) throw new Error('Failed to save smart collection');
  };

  const handleConfirmDelete = async () => {
    if (deletingCollection) {
      await deleteCollection(deletingCollection.id);
      setDeletingCollection(null);
    }
  };

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
        <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-4 lg:px-8 py-4 shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate font-mono leading-none flex items-center gap-2">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
                smart_<span className="text-gradient">collections</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate leading-none">
                // saved_filter_rules_that_stay_current_automatically • {collections.length}_collection{collections.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button onClick={openCreateDialog} variant="glow" className="shrink-0 font-mono">
              <Plus className="w-4 h-4 mr-2" />
              new_collection
            </Button>
          </div>

          <div className="flex items-center gap-3 mt-5 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search_collections..."
                className="pl-11 font-mono"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 md:p-10">
          {!loading && collections.length === 0 && (
            <div className="text-center py-16 text-muted-foreground font-mono">
              <p>// no_smart_collections_yet</p>
              <p className="text-sm mt-1">create one to save a filter rule set that stays current automatically</p>
            </div>
          )}

          {!loading && collections.length > 0 && filteredCollections.length === 0 && (
            <div className="text-center py-16 text-muted-foreground font-mono">
              <p>// no_collections_match_your_search</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCollections.map((collection) => {
              const matchCount = applyFilters(
                publications,
                collection.filters,
                publicationTagsMap,
                publicationVaultsMap,
              ).length;

              return (
                <article
                  key={collection.id}
                  className="p-5 rounded-2xl border-2 border-border bg-card/50 hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => navigate(`/collections/${collection.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: collection.color ?? 'hsl(var(--electric-purple))' }}
                      />
                      <h2 className="font-bold font-mono">{collection.name}</h2>
                    </div>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {matchCount}_paper{matchCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {collection.description && (
                    <p className="text-sm text-foreground/80 line-clamp-2 mb-2">{collection.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono line-clamp-2 mb-4">
                    {summarizeFilters(collection, tags, vaults)}
                  </p>
                  <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(collection)} aria-label="Edit">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingCollection(collection)}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <SmartCollectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editingCollection={editingCollection}
          allPublications={publications}
          tags={tags}
          vaults={vaults}
          publicationTagsMap={publicationTagsMap}
          publicationVaultsMap={publicationVaultsMap}
          onSave={handleSave}
        />

        <AlertDialog open={!!deletingCollection} onOpenChange={(open) => !open && setDeletingCollection(null)}>
          <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold font-mono">delete_smart_collection?</AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-sm">
                // this_deletes_the_saved_rules_for "{deletingCollection?.name}" — the publications themselves are never affected
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono"
              >
                delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
