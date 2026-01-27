import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation, VaultShare } from '@/types/database';
import { useVaultAccess } from '@/hooks/useVaultAccess';

interface VaultContentContextType {
  currentVault: Vault | null;
  publications: Publication[];
  tags: Tag[];
  publicationTags: PublicationTag[];
  publicationRelations: PublicationRelation[];
  vaultShares: VaultShare[];
  loading: boolean;
  error: string | null;
  setCurrentVaultId: (vaultId: string) => void;
  setPublications: React.Dispatch<React.SetStateAction<Publication[]>>;
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  setPublicationTags: React.Dispatch<React.SetStateAction<PublicationTag[]>>;
  setPublicationRelations: React.Dispatch<React.SetStateAction<PublicationRelation[]>>;
  setVaultShares: React.Dispatch<React.SetStateAction<VaultShare[]>>;
}

const VaultContentContext = createContext<VaultContentContextType | undefined>(undefined);

interface VaultContentProviderProps {
  children: ReactNode;
}

export function VaultContentProvider({ children }: VaultContentProviderProps) {
  const { user } = useAuth();
  const [currentVault, setCurrentVault] = useState<Vault | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [publicationRelations, setPublicationRelations] = useState<PublicationRelation[]>([]);
  const [vaultShares, setVaultShares] = useState<VaultShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentVaultId, setCurrentVaultIdState] = useState<string | null>(null);

  const { canView, refresh } = useVaultAccess(currentVaultId || '');

  // Fetch vault content when vaultId changes
  useEffect(() => {
    if (!currentVaultId || !user || !canView) return;

    const fetchVaultContent = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch publications in this vault - prioritize vault-specific copies
        const [
          vaultPubsRes,
          tagsRes,
          relationsRes,
          sharesRes
        ] = await Promise.all([
          supabase
            .from('vault_publications')
            .select('*')
            .eq('vault_id', currentVaultId)
            .order('created_at', { ascending: false }),
          supabase.from('tags').select('*').eq('vault_id', currentVaultId).order('name'),
          supabase.from('publication_relations').select('*'),
          supabase.from('vault_shares').select('*').eq('vault_id', currentVaultId)
        ]);

        // Get the vault publication IDs to fetch specific publication tags
        const vaultPublications = vaultPubsRes.data as any[]; // Define vaultPublications here
        const vaultPublicationIds = vaultPublications.map(vp => vp.id).filter(id => id); // Use the vault-specific copy IDs
        const originalPublicationIds = vaultPublications.map(vp => vp.original_publication_id).filter(id => id); // Also get original IDs

        // Fetch publication tags for both the vault-specific copies and the original publications in this vault
        let pubTagsRes;
        if (vaultPublicationIds.length > 0 || originalPublicationIds.length > 0) {
          // We need to fetch tags for both vault-specific copies and original publications
          // So we'll make two separate queries and combine the results
          let vaultTags = [];
          let originalTags = [];

          if (vaultPublicationIds.length > 0) {
            const { data: vtData, error: vtError } = await supabase
              .from('publication_tags')
              .select('*')
              .in('vault_publication_id', vaultPublicationIds);
            if (!vtError) vaultTags = vtData || [];
          }

          if (originalPublicationIds.length > 0) {
            const { data: otData, error: otError } = await supabase
              .from('publication_tags')
              .select('*')
              .in('publication_id', originalPublicationIds);
            if (!otError) originalTags = otData || [];
          }

          pubTagsRes = { data: [...vaultTags, ...originalTags], error: null };
        } else {
          pubTagsRes = { data: [], error: null };
        }

        if (vaultPubsRes.error) throw vaultPubsRes.error;
        if (tagsRes.error) throw tagsRes.error;
        if (pubTagsRes.error) throw pubTagsRes.error;
        if (relationsRes.error) throw relationsRes.error;
        if (sharesRes.error) throw sharesRes.error;

        // Get the vault details
        const { data: vaultData, error: vaultError } = await supabase
          .from('vaults')
          .select('*')
          .eq('id', currentVaultId)
          .single();

        if (vaultError) throw vaultError;

        // Convert vault publications to the same format as original publications
        const formattedVaultPublications = vaultPublications.map(vp => ({
          id: vp.id, // Use the vault publication ID
          user_id: vp.created_by, // Use the creator of the vault copy
          title: vp.title,
          authors: vp.authors,
          year: vp.year,
          journal: vp.journal,
          volume: vp.volume,
          issue: vp.issue,
          pages: vp.pages,
          doi: vp.doi,
          url: vp.url,
          abstract: vp.abstract,
          pdf_url: vp.pdf_url,
          bibtex_key: vp.bibtex_key,
          publication_type: vp.publication_type,
          notes: vp.notes,
          booktitle: vp.booktitle,
          chapter: vp.chapter,
          edition: vp.edition,
          editor: vp.editor,
          howpublished: vp.howpublished,
          institution: vp.institution,
          number: vp.number,
          organization: vp.organization,
          publisher: vp.publisher,
          school: vp.school,
          series: vp.series,
          type: vp.type,
          eid: vp.eid,
          isbn: vp.isbn,
          issn: vp.issn,
          keywords: vp.keywords,
          created_at: vp.created_at,
          updated_at: vp.updated_at,
          original_publication_id: vp.original_publication_id, // Keep track of the original
        }));

        setPublications(formattedVaultPublications);
        setTags(tagsRes.data as Tag[]);
        setPublicationTags(pubTagsRes.data as PublicationTag[]);
        setPublicationRelations(relationsRes.data as PublicationRelation[]);
        setVaultShares(sharesRes.data as VaultShare[]);
        setCurrentVault(vaultData as Vault);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load vault content');
        console.error('Error loading vault content:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVaultContent();
  }, [currentVaultId, user, canView]);

  const setCurrentVaultId = (vaultId: string) => {
    setCurrentVaultIdState(vaultId);
  };

  return (
    <VaultContentContext.Provider
      value={{
        currentVault,
        publications,
        tags,
        publicationTags,
        publicationRelations,
        vaultShares,
        loading,
        error,
        setCurrentVaultId,
        setPublications,
        setTags,
        setPublicationTags,
        setPublicationRelations,
        setVaultShares
      }}
    >
      {children}
    </VaultContentContext.Provider>
  );
}

export function useVaultContent() {
  const context = useContext(VaultContentContext);
  if (context === undefined) {
    throw new Error('useVaultContent must be used within a VaultContentProvider');
  }
  return context;
}