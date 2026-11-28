import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, BookOpen, Eye, GitFork, Heart } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import VaultAbstractBlock from '@/components/vaults/VaultAbstractBlock';
import type { CodexVault } from '@/lib/codexVaults';

function getOwnerInitials(owner: CodexVault['owner']) {
  if (!owner) return '?';
  if (owner.display_name) {
    return owner.display_name.slice(0, 2).toUpperCase();
  }
  if (owner.username) {
    return owner.username.slice(0, 2).toUpperCase();
  }
  return '?';
}

function getOwnerName(owner: CodexVault['owner']) {
  if (!owner) return 'Unknown';
  return owner.display_name || owner.username || 'Unknown';
}

interface CodexVaultCardProps {
  vault: CodexVault;
  /** Signed in: show the favorite and fork buttons. */
  canAct: boolean;
  /** The viewer owns this vault, so they can't favorite or fork it. */
  isOwn: boolean;
  favorite: boolean;
  forking: boolean;
  onFavorite: (e: MouseEvent, vaultId: string) => void;
  onFork: (e: MouseEvent, vault: CodexVault) => void;
}

/** A public vault in the Codex grid. */
export function CodexVaultCard({ vault, canAct, isOwn, favorite, forking, onFavorite, onFork }: CodexVaultCardProps) {
  return (
    <Link
      to={`/public/${vault.public_slug}`}
      className="group"
    >
      <article
        className={`h-full p-6 rounded-2xl border-2 bg-card/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 flex flex-col ${vault.is_fork ? 'bg-amber-500/[0.03]' : ''}`}
        style={{ borderColor: `${vault.color}40` }}
      >
        {/* Header with owner info */}
        <div className="flex items-start gap-3 mb-4">
          <Avatar className="w-10 h-10 border-2 border-border ring-2 ring-background group-hover:ring-primary/20 transition-all">
            {vault.owner?.avatar_url ? (
              <img src={vault.owner.avatar_url} alt={getOwnerName(vault.owner)} className="object-cover" />
            ) : (
              <AvatarFallback className="text-xs font-mono bg-gradient-to-br from-primary/20 to-primary/10">
                {getOwnerInitials(vault.owner)}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground font-mono truncate">
                {vault.owner?.username ? `@${vault.owner.username}` : getOwnerName(vault.owner)}
              </span>
              <span className="text-xs text-muted-foreground/50">•</span>
              <span className="text-xs text-muted-foreground/70 font-mono">
                {formatDistanceToNow(new Date(vault.updated_at), { addSuffix: true })}
              </span>
            </div>
            <h2 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1 font-mono">
              {vault.name}
            </h2>
          </div>
          <div 
            className="w-8 h-8 rounded-lg shrink-0 shadow-sm group-hover:scale-110 transition-transform flex items-center justify-center"
            style={{ backgroundColor: vault.color }}
          >
            <BookOpen className="w-4 h-4 text-white/90" />
          </div>
        </div>

        {/* Category Badge */}
        <div className="mb-3 flex flex-wrap gap-2">
          {vault.is_fork && (
            <Badge variant="outline" className="w-fit text-xs font-mono border-amber-500/30 text-amber-600">
              forked
            </Badge>
          )}
          {vault.category && (
            <Badge variant="secondary" className="w-fit text-xs font-mono">
              {vault.category.toLowerCase().replace(/\s+/g, '_')}
            </Badge>
          )}
        </div>

        {/* Description/Abstract */}
        {(vault.abstract || vault.description) && (
          <div className="mb-4 flex-1">
            <VaultAbstractBlock abstract={vault.abstract} description={vault.description} />
          </div>
        )}

        {/* Stats Row */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/50 pt-3 text-xs font-mono text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{vault.publication_count}_papers</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{vault.stats?.view_count || 0}_views</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{vault.favorites_count || 0}_favorites</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <GitFork className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{vault.fork_count || 0}_forks</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {canAct && (
              <>
                <button
                  onClick={(e) => onFavorite(e, vault.id)}
                  disabled={isOwn}
                  className={`p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${favorite ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'}`}
                  title={isOwn ? 'you_own_this_vault' : undefined}
                >
                  <Heart className={`w-4 h-4 ${favorite ? 'fill-rose-500' : ''}`} />
                </button>
                <button
                  onClick={(e) => onFork(e, vault)}
                  disabled={forking || isOwn}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isOwn ? 'you_own_this_vault' : undefined}
                >
                  <GitFork className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center text-sm text-primary font-semibold group-hover:gap-2 transition-all font-mono">
            explore
            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </article>
    </Link>
  );
}
