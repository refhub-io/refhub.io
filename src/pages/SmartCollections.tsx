import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAllPublications } from '@/hooks/useAllPublications';
import { useSmartCollections } from '@/hooks/useSmartCollections';
import { SmartCollectionDialog } from '@/components/collections/SmartCollectionDialog';
import { applyFilters } from '@/components/publications/FilterBuilder';
import type { SmartCollection } from '@/types/database';
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

function summarizeFilters(collection: SmartCollection): string {
  if (collection.filters.length === 0) return 'no rules yet';
  return collection.filters
    .map((f) => `${f.field} ${f.operator.replace('_', ' ')}${f.value ? ` ${f.value}` : ''}`)
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
        onCreateVault={() => navigate('/dashboard')}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <main className="flex-1 lg:pl-72 p-6 md:p-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} />
            <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-violet-500" />
              smart_collections
            </h1>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
        </div>

        {!loading && collections.length === 0 && (
          <div className="text-center py-16 text-muted-foreground font-mono">
            <p>No smart collections yet.</p>
            <p className="text-sm mt-1">Create one to save a filter rule set that stays current automatically.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => {
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
                      style={{ backgroundColor: collection.color ?? '#8b5cf6' }}
                    />
                    <h2 className="font-bold font-mono">{collection.name}</h2>
                  </div>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {matchCount} {matchCount === 1 ? 'paper' : 'papers'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono line-clamp-2 mb-4">
                  {summarizeFilters(collection)}
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete smart collection?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the saved rules for "{deletingCollection?.name}". The publications themselves are
                never affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
