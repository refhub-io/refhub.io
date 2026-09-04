import { cn } from '@/lib/utils';
import { PublicationCard } from '@/components/publications/PublicationCard';
import type { Publication, Tag, Vault, VaultSection } from '@/types/database';

export interface CuratedSectionGroup {
  section: VaultSection;
  papers: Publication[];
}

interface CuratedSectionsBodyProps {
  vault: Vault;
  tags?: Tag[];
  grouped: CuratedSectionGroup[];
  onOpenPublication: (pub: Publication) => void;
  emptyMessage?: string;
  className?: string;
}

/** Renders a vault's curated sections exactly as visitors see them on
 * /public/:slug — shared by the public curated view and the owner-facing
 * sections editor's preview, so the preview can never drift from reality. */
export function CuratedSectionsBody({ vault, tags = [], grouped, onOpenPublication, emptyMessage = '// nothing_curated_yet', className }: CuratedSectionsBodyProps) {
  if (grouped.length === 0) {
    return <p className="text-sm text-muted-foreground font-mono py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <div className={cn('space-y-8', className)}>
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
