import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FolderOpen, 
  Plus, 
  LogOut, 
  ChevronDown,
  ChevronRight,
  X,
  Sparkles,
  Zap,
  Globe,
  Scroll,
  Lock,
  Users,
  Settings,
  MoreVertical,
  Heart,
  Share2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Vault } from '@/types/database';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { Profile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';

interface SidebarProps {
  vaults: Vault[];
  sharedVaults?: Vault[];
  selectedVaultId: string | null;
  onSelectVault: (vaultId: string | null) => void;
  onCreateVault: () => void;
  onEditVault?: (vault: Vault) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  profile?: Profile | null;
  onEditProfile?: () => void;
}

export function Sidebar({ 
  vaults, 
  sharedVaults = [],
  selectedVaultId, 
  onSelectVault, 
  onCreateVault,
  onEditVault,
  isMobileOpen,
  onMobileClose,
  profile,
  onEditProfile
}: SidebarProps) {
  const [isVaultsExpanded, setIsVaultsExpanded] = useState(true);
  const [isSharedExpanded, setIsSharedExpanded] = useState(true);
  const [isFavoritesExpanded, setIsFavoritesExpanded] = useState(true);
  const { user, signOut } = useAuth();
  const { favoriteVaults } = useVaultFavorites();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-sidebar border-r-2 border-sidebar-border flex flex-col transition-transform duration-300 lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg">
                <span className="text-gradient">refhub</span>
                <span className="text-sidebar-foreground/60">.io</span>
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onMobileClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
          <button
            onClick={() => {
              onSelectVault(null);
              onMobileClose();
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
              selectedVaultId === null
                ? "bg-sidebar-accent text-sidebar-primary border-2 border-sidebar-primary/30"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 border-2 border-transparent"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              selectedVaultId === null ? "bg-sidebar-primary/20" : "bg-sidebar-accent"
            )}>
              <Zap className={cn("w-4 h-4", selectedVaultId === null ? "text-sidebar-primary" : "text-sidebar-foreground/60")} />
            </div>
            All Papers
          </button>

          <Link
            to="/codex"
            onClick={onMobileClose}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:bg-sidebar-accent/50 text-sidebar-foreground/80 border-2 border-transparent"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-orange-500/20">
              <Scroll className="w-4 h-4 text-amber-500" />
            </div>
            The Codex
          </Link>

          <div className="pt-4">
            <button
              onClick={() => setIsVaultsExpanded(!isVaultsExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors font-mono"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" />
                Vaults
              </span>
              {isVaultsExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {isVaultsExpanded && (
              <div className="mt-2 space-y-1">
                {vaults.map((vault) => (
                  <div
                    key={vault.id}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                      selectedVaultId === vault.id
                        ? "bg-sidebar-accent text-sidebar-foreground border-2 border-primary/30"
                        : "hover:bg-sidebar-accent/50 text-sidebar-foreground/70 border-2 border-transparent"
                    )}
                  >
                    <button
                      onClick={() => {
                        onSelectVault(vault.id);
                        onMobileClose();
                      }}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div 
                        className="w-3 h-3 rounded-md shrink-0 shadow-sm" 
                        style={{ backgroundColor: vault.color }}
                      />
                      <span className="truncate font-medium">{vault.name}</span>
                      {vault.is_public ? (
                        <Globe className="w-3 h-3 text-neon shrink-0" />
                      ) : vault.is_shared ? (
                        <Users className="w-3 h-3 text-blue-400 shrink-0" />
                      ) : (
                        <Lock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      )}
                    </button>
                    
                    {onEditVault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditVault(vault);
                        }}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => {
                    onCreateVault();
                    onMobileClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-sidebar-foreground/50 hover:text-sidebar-primary hover:bg-sidebar-accent/50 transition-all duration-200 border-2 border-dashed border-sidebar-border hover:border-sidebar-primary/50"
                >
                  <Plus className="w-4 h-4" />
                  <span className="font-mono">new_vault</span>
                </button>
              </div>
            )}
          </div>

          {/* Shared With Me Section */}
          {sharedVaults.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setIsSharedExpanded(!isSharedExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors font-mono"
              >
                <span className="flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5" />
                  Shared with me
                </span>
                {isSharedExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {isSharedExpanded && (
                <div className="mt-2 space-y-1">
                  {sharedVaults.map((vault) => (
                    <div
                      key={vault.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                        selectedVaultId === vault.id
                          ? "bg-sidebar-accent text-sidebar-foreground border-2 border-blue-400/30"
                          : "hover:bg-sidebar-accent/50 text-sidebar-foreground/70 border-2 border-transparent"
                      )}
                    >
                      <button
                        onClick={() => {
                          onSelectVault(vault.id);
                          onMobileClose();
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div 
                          className="w-3 h-3 rounded-md shrink-0 shadow-sm" 
                          style={{ backgroundColor: vault.color || '#6366f1' }}
                        />
                        <span className="truncate font-medium">{vault.name}</span>
                        <Share2 className="w-3 h-3 text-blue-400 shrink-0" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Favorites Section */}
          {favoriteVaults.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setIsFavoritesExpanded(!isFavoritesExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors font-mono"
              >
                <span className="flex items-center gap-2">
                  <Heart className="w-3.5 h-3.5" />
                  Favorites
                </span>
                {isFavoritesExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {isFavoritesExpanded && (
                <div className="mt-2 space-y-1">
                  {favoriteVaults.map((vault) => (
                    <Link
                      key={vault.id}
                      to={`/public/${vault.public_slug}`}
                      onClick={onMobileClose}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm hover:bg-sidebar-accent/50 text-sidebar-foreground/70 border-2 border-transparent transition-all duration-200"
                    >
                      <div 
                        className="w-3 h-3 rounded-md shrink-0 shadow-sm" 
                        style={{ backgroundColor: vault.color || '#6366f1' }}
                      />
                      <span className="truncate font-medium">{vault.name}</span>
                      <Globe className="w-3 h-3 text-neon shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="p-4 border-t-2 border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sidebar-accent/50 mb-3">
            <ProfileAvatar
              name={profile?.display_name || user?.email?.split('@')[0] || 'User'}
              avatarUrl={profile?.avatar_url}
              size={40}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-sidebar-foreground">
                {profile?.display_name || user?.email?.split('@')[0]}
              </p>
              {profile?.username ? (
                <p className="text-xs text-sidebar-foreground/50 truncate font-mono">@{profile.username}</p>
              ) : (
                <p className="text-xs text-sidebar-foreground/50 truncate font-mono">{user?.email}</p>
              )}
            </div>
            {onEditProfile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={onEditProfile}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent font-mono text-xs"
          >
            <LogOut className="w-4 h-4 mr-2" />
            sign_out()
          </Button>
        </div>
      </aside>
    </>
  );
}
