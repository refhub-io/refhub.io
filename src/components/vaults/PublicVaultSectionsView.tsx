import { useMemo, useState } from 'react';
import { BarChart3, MoreVertical, Search } from 'lucide-react';
import { useVaultSections } from '@/hooks/useVaultSections';
import { PublicationCard } from '@/components/publications/PublicationCard';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { QRCodeDialog } from '@/components/vaults/QRCodeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Publication, Tag, Vault } from '@/types/database';

interface PublicVaultSectionsViewProps {
  vault: Vault;
  publications: Publication[];
  tags: Tag[];
  vaultOwnerName?: string;
  onOpenPublication: (pub: Publication) => void;
  onOpenGraph?: () => void;
  onMobileMenuOpen?: () => void;
  onVaultUpdate?: () => void;
}

export function PublicVaultSectionsView({ vault, publications, tags, vaultOwnerName, onOpenPublication, onOpenGraph, onMobileMenuOpen, onVaultUpdate }: PublicVaultSectionsViewProps) {
  const { sections, loading } = useVaultSections(vault.id);
  const [searchQuery, setSearchQuery] = useState('');

  const grouped = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    const matches = (pub: Publication) =>
      !searchLower ||
      pub.title.toLowerCase().includes(searchLower) ||
      pub.authors.some((a) => a.toLowerCase().includes(searchLower)) ||
      pub.journal?.toLowerCase().includes(searchLower);

    return sections
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        section,
        papers: publications
          .filter((p) => p.section_id === section.id && matches(p))
          .sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0)),
      }))
      .filter((group) => group.papers.length > 0);
  }, [sections, publications, searchQuery]);

  const curatedCount = useMemo(() => grouped.reduce((sum, g) => sum + g.papers.length, 0), [grouped]);

  if (loading) {
    return <p className="text-sm text-muted-foreground font-mono py-8 text-center">// loading_curated_view...</p>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-3 sm:px-4 lg:px-8 py-3 sm:py-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          {onMobileMenuOpen && (
            <MobileMenuButton onClick={onMobileMenuOpen} className="shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-md shrink-0 shadow-sm" style={{ backgroundColor: vault.color }} />
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate font-mono leading-none">{vault.name}</h1>
              <QRCodeDialog vault={vault} onVaultUpdate={onVaultUpdate ?? (() => {})} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate leading-none">
              {vaultOwnerName && <span>by {vaultOwnerName} • </span>}
              {curatedCount} curated item{curatedCount !== 1 ? 's' : ''} in {grouped.length} section{grouped.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <NotificationDropdown />

            {onOpenGraph && (
              <Button onClick={onOpenGraph} variant="outline" className="h-9 font-mono hidden lg:flex">
                <BarChart3 className="w-4 h-4 mr-2" />
                vault_analytics
              </Button>
            )}

            {onOpenGraph && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 lg:hidden" title="More actions">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono">
                  <DropdownMenuItem onClick={onOpenGraph}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    vault_analytics
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="mt-4 sm:mt-5 flex flex-row flex-wrap gap-2 sm:gap-3 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="search_papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 font-mono"
            />
          </div>
        </div>
      </header>

      <div className="px-3 sm:px-4 lg:px-8 py-6 space-y-8">
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground font-mono py-8 text-center">
            {searchQuery ? '// no_results_found' : '// nothing_curated_yet'}
          </p>
        ) : (
          grouped.map(({ section, papers }) => (
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
          ))
        )}
      </div>
    </div>
  );
}
