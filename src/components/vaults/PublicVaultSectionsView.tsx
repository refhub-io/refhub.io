import { useMemo, useState } from 'react';
import { BarChart3, MoreVertical, Search } from 'lucide-react';
import { CuratedSectionsBody } from '@/components/vaults/CuratedSectionsBody';
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
import type { Publication, Tag, Vault, VaultSection } from '@/types/database';

interface PublicVaultSectionsViewProps {
  vault: Vault;
  sections: VaultSection[];
  publications: Publication[];
  tags: Tag[];
  vaultOwnerName?: string;
  onOpenPublication: (pub: Publication) => void;
  onOpenGraph?: () => void;
  onMobileMenuOpen?: () => void;
  onVaultUpdate?: () => void;
}

// sections/loading are fetched once by the parent (which already needs them
// to decide whether to show the curated/all_papers tabs at all) and passed
// down here — fetching them again on every mount was causing a loading flash
// each time a visitor switched from all_papers back to curated.
export function PublicVaultSectionsView({ vault, sections, publications, tags, vaultOwnerName, onOpenPublication, onOpenGraph, onMobileMenuOpen, onVaultUpdate }: PublicVaultSectionsViewProps) {
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

      <CuratedSectionsBody
        vault={vault}
        tags={tags}
        grouped={grouped}
        onOpenPublication={onOpenPublication}
        emptyMessage={searchQuery ? '// no_results_found' : '// nothing_curated_yet'}
        className="px-3 sm:px-4 lg:px-8 py-6"
      />
    </div>
  );
}
