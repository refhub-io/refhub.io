import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVaultSections } from '@/hooks/useVaultSections';
import { PublicationCard } from '@/components/publications/PublicationCard';
import type { Publication, Tag, Vault } from '@/types/database';

interface PublicVaultSectionsViewProps {
  vault: Vault;
  publications: Publication[];
  tags: Tag[];
  onOpenPublication: (pub: Publication) => void;
}

export function PublicVaultSectionsView({ vault, publications, tags, onOpenPublication }: PublicVaultSectionsViewProps) {
  const { sections, loading } = useVaultSections(vault.id);

  const grouped = useMemo(() => {
    return sections
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        section,
        papers: publications
          .filter((p) => p.section_id === section.id)
          .sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0)),
      }))
      .filter((group) => group.papers.length > 0);
  }, [sections, publications]);

  if (loading) {
    return <p className="text-sm text-muted-foreground font-mono py-8 text-center">// loading_curated_view...</p>;
  }

  return (
    <div className="space-y-8">
      {grouped.map(({ section, papers }) => (
        <div key={section.id}>
          <div className="mb-3">
            <h2 className="text-base font-bold font-mono">{section.name}</h2>
            {section.description && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{section.description}</p>
            )}
          </div>
          <div className="space-y-2">
            {papers.map((pub) => (
              <div key={pub.id}>
                {pub.featured && (
                  <div className="mb-1 px-3 py-1.5 text-xs font-mono text-primary bg-primary/10 rounded-t-md border border-b-0 border-primary/30">
                    ★ featured{pub.featured_note ? ` — ${pub.featured_note}` : ''}
                  </div>
                )}
                <PublicationCard
                  publication={pub}
                  tags={tags}
                  allTags={tags}
                  vaults={[vault]}
                  publicationVaults={[vault.id]}
                  relationsCount={0}
                  isSelected={false}
                  onToggleSelect={() => {}}
                  onOpen={() => onOpenPublication(pub)}
                  onExportBibtex={() => {}}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
