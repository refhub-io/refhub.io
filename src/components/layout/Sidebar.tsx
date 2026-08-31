import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  FolderOpen,
  Plus,
  LogOut,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Zap,
  Globe,
  Scroll,
  Lock,
  Shield,
  Users,
  Settings,
  MoreVertical,
  Heart,
  Share2,
  GripVertical,
  Sparkles
} from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { BrandMark } from '@/components/branding/BrandMark';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Vault } from '@/types/database';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { Profile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFavoritesOrder } from '@/hooks/useVaultFavoritesOrder';
import { resolveVaultDragEndAction } from '@/lib/vaultSidebarDnd';
import { ThemeToggle } from './ThemeToggle';
import { useKeyboardNavigation, useHotkeys } from '@/hooks/useKeyboardNavigation';
import { KbdHint } from '@/components/ui/KbdHint';
import { KeyboardShortcutsButton } from '@/components/ui/KeyboardHelpOverlay';
import { WhatsNewDialog } from '@/components/ui/WhatsNewDialog';
import { useWhatsNew } from '@/hooks/useWhatsNew';
import { SortableVaultRow } from '@/components/dnd/SortableVaultRow';
import { VaultDragOverlayContent } from '@/components/dnd/VaultDragOverlayContent';
import type { ActiveVaultDrag } from '@/hooks/useVaultDragAndDrop';

/** Vaults shown per sidebar section before a "show more" toggle appears — keeps
 * the sidebar scannable and matches the 1-9 keybind range for owned vaults. */
const VISIBLE_VAULT_LIMIT = 9;

export interface SidebarProps {
  /** Owned vaults, already in the user's custom sidebar order. */
  vaults: Vault[];
  sharedVaults?: Vault[];
  /** Vault ids a dragged paper may be dropped on (owned + editable shared). */
  droppableVaultIds?: Set<string>;
  /** True while a paper (not a vault) is being dragged — gates the
   * "drop here" row highlight so it doesn't also fire while reordering. */
  isDraggingPublication?: boolean;
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
  droppableVaultIds,
  isDraggingPublication = false,
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
  const [showAllOwnedVaults, setShowAllOwnedVaults] = useState(false);
  const [showAllSharedVaults, setShowAllSharedVaults] = useState(false);
  const [showAllFavoriteVaults, setShowAllFavoriteVaults] = useState(false);
  const { user, signOut } = useAuth();
  const { favoriteVaults } = useVaultFavorites();
  const { orderFavorites, reorder: reorderFavorites } = useVaultFavoritesOrder(user?.id);
  const [activeFavoriteDrag, setActiveFavoriteDrag] = useState<ActiveVaultDrag | null>(null);
  const { open: whatsNewOpen, hasUnseen, onOpenChange: onWhatsNewOpenChange, openDialog: openWhatsNew } = useWhatsNew();
  const navigate = useNavigate();
  const location = useLocation();
  // Derive active vault from URL for instant feedback on click
  // This makes the vault appear selected immediately without waiting for data to load
  const vaultIdFromUrl = location.pathname.startsWith('/vault/') 
    ? location.pathname.split('/vault/')[1]?.split('/')[0] 
    : null;
  const activeVaultId = vaultIdFromUrl || selectedVaultId;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Close sidebar on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        onMobileClose();
      }
    };

    if (isMobileOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isMobileOpen, onMobileClose]);

  const isCodexActive = location.pathname === '/codex';
  const isUsersActive = location.pathname === '/users';
  const isCollectionsActive = location.pathname.startsWith('/collections');
  // Dashboard is active when on /dashboard or on / without a vault selected
  const isDashboardActive = location.pathname === '/dashboard' || (location.pathname === '/' && !activeVaultId);

  // ─── Vault list keyboard navigation ─────────────────────────────────────────
  // Every list here is memoized end-to-end (slice → ids) so a drag in progress
  // — which re-renders the sidebar on every pointer move via dnd-kit's own
  // context updates — doesn't hand SortableContext a brand-new `items` array
  // each frame purely because .slice() allocates a fresh one every render.
  const visibleOwnedVaults = useMemo(
    () => (showAllOwnedVaults ? vaults : vaults.slice(0, VISIBLE_VAULT_LIMIT)),
    [vaults, showAllOwnedVaults],
  );
  const hiddenOwnedVaultCount = Math.max(0, vaults.length - VISIBLE_VAULT_LIMIT);
  const vaultIds = useMemo(() => visibleOwnedVaults.map((v) => v.id), [visibleOwnedVaults]);

  const visibleSharedVaults = useMemo(
    () => (showAllSharedVaults ? sharedVaults : sharedVaults.slice(0, VISIBLE_VAULT_LIMIT)),
    [sharedVaults, showAllSharedVaults],
  );
  const hiddenSharedVaultCount = Math.max(0, sharedVaults.length - VISIBLE_VAULT_LIMIT);
  const sharedVaultIds = useMemo(() => visibleSharedVaults.map((v) => v.id), [visibleSharedVaults]);

  const orderedFavoriteVaults = useMemo(() => orderFavorites(favoriteVaults), [orderFavorites, favoriteVaults]);
  const visibleFavoriteVaults = useMemo(
    () => (showAllFavoriteVaults ? orderedFavoriteVaults : orderedFavoriteVaults.slice(0, VISIBLE_VAULT_LIMIT)),
    [orderedFavoriteVaults, showAllFavoriteVaults],
  );
  const hiddenFavoriteVaultCount = Math.max(0, orderedFavoriteVaults.length - VISIBLE_VAULT_LIMIT);
  const favoriteVaultIds = useMemo(() => visibleFavoriteVaults.map((v) => v.id), [visibleFavoriteVaults]);

  // Favorites reordering is self-contained (its own DndContext) so it works on
  // every page the sidebar renders on, not just Dashboard/VaultDetail — unlike
  // "drag paper onto vault", it never needs to see anything outside the sidebar.
  const favoritesSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleFavoriteDragStart = useCallback((event: DragStartEvent) => {
    const vault = orderedFavoriteVaults.find((v) => v.id === String(event.active.id));
    setActiveFavoriteDrag(vault ? { type: 'vault', vault } : null);
  }, [orderedFavoriteVaults]);

  const handleFavoriteDragEnd = useCallback((event: DragEndEvent) => {
    setActiveFavoriteDrag(null);
    const action = resolveVaultDragEndAction({
      active: {
        id: String(event.active.id),
        data: event.active.data.current as { type?: 'publication' | 'vault' | 'favorite' } ?? {},
      },
      over: event.over
        ? { id: String(event.over.id), data: event.over.data.current as { type?: 'publication' | 'vault' | 'favorite' } ?? {} }
        : null,
    });
    if (action.type === 'reorder-favorites') {
      reorderFavorites(favoriteVaults, action.activeVaultId, action.overVaultId);
    }
  }, [reorderFavorites, favoriteVaults]);

  const handleFavoriteDragCancel = useCallback(() => setActiveFavoriteDrag(null), []);

  const handleVaultOpen = useCallback(
    (id: string) => {
      navigate(`/vault/${id}`);
      onMobileClose();
    },
    [navigate, onMobileClose],
  );

  const vaultKb = useKeyboardNavigation({
    context: 'vault-list',
    itemIds: vaultIds,
    onOpen: handleVaultOpen,
    activateOnMount: false,
  });

  // Global 1-9 shortcuts to jump directly to vaults
  const vaultNumberDefs = useMemo(
    () =>
      vaults.slice(0, 9).map((vault, i) => ({
        combo: String(i + 1),
        description: `Open vault ${i + 1}`,
        handler: () => {
          navigate(`/vault/${vault.id}`);
          onMobileClose();
          return true;
        },
      })),
    [vaults, navigate, onMobileClose],
  );

  useHotkeys('global', vaultNumberDefs, [vaultNumberDefs]);

  // Global "o" shortcut: open settings for the current vault
  useHotkeys(
    'global',
    [
      {
        combo: 'o',
        description: 'Open vault settings',
        handler: () => {
          if (!activeVaultId || !onEditVault) return false;
          const vault = vaults.find((v) => v.id === activeVaultId);
          if (vault) { onEditVault(vault); return true; }
          return false;
        },
      },
    ],
    [activeVaultId, vaults, onEditVault],
  );

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
          onClick={onMobileClose}
          role="button"
          aria-label="Close sidebar"
        />
      )}

      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 lg:z-0 w-72 bg-sidebar border-r-2 border-sidebar-border flex flex-col h-screen transition-transform duration-300 lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-sidebar-border">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 shrink-0 rounded-xl shadow-lg" />
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
            className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent min-w-[40px] min-h-[40px]"
            onClick={onMobileClose}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2 min-h-0">
          <Link
            to="/dashboard"
            onClick={() => {
              onSelectVault(null);
              onMobileClose();
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border-2",
              isDashboardActive && !isCodexActive && !isUsersActive
                ? "bg-gradient-to-br from-emerald-500/10 to-green-500/10 text-emerald-500 border-emerald-500/30"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 border-transparent"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              isDashboardActive && !isCodexActive && !isUsersActive 
                ? "bg-gradient-to-br from-emerald-500/30 to-green-500/30" 
                : "bg-gradient-to-br from-emerald-500/20 to-green-500/20"
            )}>
              <Zap className={cn("w-4 h-4", isDashboardActive && !isCodexActive && !isUsersActive ? "text-emerald-400" : "text-emerald-500")} />
            </div>
            <span className="font-mono">all_papers</span>
          </Link>

          <Link
            to="/codex"
            onClick={onMobileClose}
            data-onboarding-target="codex-link"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border-2",
              isCodexActive
                ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 text-amber-500 border-amber-500/30"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 border-transparent"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              isCodexActive ? "bg-gradient-to-br from-amber-500/30 to-orange-500/30" : "bg-gradient-to-br from-amber-500/20 to-orange-500/20"
            )}>
              <Scroll className={cn("w-4 h-4", isCodexActive ? "text-amber-400" : "text-amber-500")} />
            </div>
            <span className="font-mono">the_codex</span>
          </Link>

          <Link
            to="/users"
            onClick={onMobileClose}
            data-onboarding-target="researchers-link"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border-2",
              location.pathname === '/users'
                ? "bg-gradient-to-br from-rose-500/10 to-pink-500/10 text-rose-500 border-rose-500/30"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 border-transparent"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              location.pathname === '/users' 
                ? "bg-gradient-to-br from-rose-500/30 to-pink-500/30" 
                : "bg-gradient-to-br from-rose-500/20 to-pink-500/20"
            )}>
              <Users className={cn("w-4 h-4", location.pathname === '/users' ? "text-rose-400" : "text-rose-500")} />
            </div>
            <span className="font-mono">researchers</span>
          </Link>

          <Link
            to="/collections"
            onClick={onMobileClose}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border-2",
              isCollectionsActive
                ? "bg-gradient-to-br from-[hsl(var(--electric-purple))]/10 to-[hsl(var(--hot-pink))]/10 text-primary border-primary/30"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 border-transparent"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              isCollectionsActive
                ? "bg-gradient-to-br from-[hsl(var(--electric-purple))]/30 to-[hsl(var(--hot-pink))]/30"
                : "bg-gradient-to-br from-[hsl(var(--electric-purple))]/20 to-[hsl(var(--hot-pink))]/20"
            )}>
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-mono">smart_collections</span>
          </Link>

          <div className="pt-4">
            <button
              onClick={() => setIsVaultsExpanded(!isVaultsExpanded)}
              data-onboarding-target="vaults-section"
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors font-mono"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" />
                my_vaults
                <span className="hidden lg:inline-flex">
                  <KbdHint shortcut={['1', '‥', '9']} size="sm" />
                </span>
              </span>
              {isVaultsExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {isVaultsExpanded && (
              <div className="mt-2 space-y-1" role="listbox" aria-label="My vaults" data-onboarding-target="vault-list">
                <SortableContext items={vaultIds} strategy={verticalListSortingStrategy}>
                  {visibleOwnedVaults.map((vault, index) => (
                    <SortableVaultRow key={vault.id} vaultId={vault.id}>
                      {({ ref, style, isOver, isDragging, dragHandleProps }) => (
                        <div
                          ref={ref}
                          style={style}
                          {...vaultKb.itemProps(index, vault.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                            activeVaultId === vault.id
                              ? "bg-gradient-to-br from-primary/15 to-violet-500/10 text-primary border-2 border-primary/30"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground/70 border-2 border-transparent",
                            vaultKb.isFocused(index) && "ring-2 ring-[hsl(var(--cyber-blue))]/50 ring-offset-1 ring-offset-background",
                            // Only highlight as a drop target for incoming papers — during a
                            // vault reorder, dnd-kit's own shift animation already shows position,
                            // so an identical border here would just add confusing extra highlights.
                            isOver && isDraggingPublication && "border-primary bg-primary/10",
                            // Marks the row currently being grabbed, independent of the
                            // active-vault border above — otherwise only a vault you also
                            // happen to be viewing would visibly indicate it's being dragged.
                            // Matches the drag ghost's purple treatment (bg + text + border).
                            isDragging && "opacity-40 bg-gradient-to-br from-primary/15 to-violet-500/10 text-primary border-primary/40"
                          )}
                        >
                          <button
                            type="button"
                            {...dragHandleProps.attributes}
                            {...dragHandleProps.listeners}
                            className="shrink-0 h-5 w-5 -ml-1 flex items-center justify-center text-sidebar-foreground/0 group-hover:text-sidebar-foreground/40 hover:!text-sidebar-foreground focus-visible:text-sidebar-foreground/40 cursor-grab active:cursor-grabbing touch-none"
                            aria-label={`Reorder ${vault.name}`}
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              navigate(`/vault/${vault.id}`);
                              onMobileClose();
                            }}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            {index < 9 && (
                              <kbd className="hidden lg:inline-flex items-center justify-center rounded border border-border/60 bg-background/60 font-mono text-muted-foreground/50 text-[9px] min-w-[1rem] h-4 px-0.5 leading-none shadow-sm select-none shrink-0">
                                {index + 1}
                              </kbd>
                            )}
                            <div
                              className="w-3 h-3 rounded-md shrink-0 shadow-sm"
                              style={{ backgroundColor: vault.color }}
                            />
                            <span className="truncate font-medium">{vault.name}</span>
                            {vault.visibility === 'public' ? (
                              <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                            ) : vault.visibility === 'protected' ? (
                              <Shield className="w-3 h-3 text-muted-foreground shrink-0" />
                            ) : (
                              <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
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
                      )}
                    </SortableVaultRow>
                  ))}
                </SortableContext>

                {hiddenOwnedVaultCount > 0 && (
                  <button
                    onClick={() => setShowAllOwnedVaults((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-all duration-200"
                  >
                    {showAllOwnedVaults ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        show_less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        +{hiddenOwnedVaultCount} more
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    onCreateVault();
                    onMobileClose();
                  }}
                  data-onboarding-target="new-vault"
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
                  shared_with_me
                </span>
                {isSharedExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {isSharedExpanded && (
                <div className="mt-2 space-y-1">
                  <SortableContext items={sharedVaultIds} strategy={verticalListSortingStrategy}>
                    {visibleSharedVaults.map((vault) => {
                      const isDroppable = droppableVaultIds ? droppableVaultIds.has(vault.id) : false;
                      return (
                        <SortableVaultRow key={vault.id} vaultId={vault.id} dragType="shared">
                          {({ ref, style, isOver, isDragging, dragHandleProps }) => (
                            <div
                              ref={ref}
                              style={style}
                              className={cn(
                                "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                                activeVaultId === vault.id
                                  ? "bg-gradient-to-br from-blue-500/15 to-cyan-500/10 text-blue-400 border-2 border-blue-400/30"
                                  : "hover:bg-sidebar-accent/50 text-sidebar-foreground/70 border-2 border-transparent",
                                // isDroppable gate: a viewer-role shared vault stays a valid
                                // reorder target (see SortableVaultRow) but must not look like
                                // it'll accept a paper drop it can't actually receive.
                                isOver && isDraggingPublication && isDroppable && "border-primary bg-primary/10",
                                isDragging && "opacity-40 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 text-blue-400 border-blue-400/40"
                              )}
                            >
                              <button
                                type="button"
                                {...dragHandleProps.attributes}
                                {...dragHandleProps.listeners}
                                className="shrink-0 h-5 w-5 -ml-1 flex items-center justify-center text-sidebar-foreground/0 group-hover:text-sidebar-foreground/40 hover:!text-sidebar-foreground focus-visible:text-sidebar-foreground/40 cursor-grab active:cursor-grabbing touch-none"
                                aria-label={`Reorder ${vault.name}`}
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </button>
                              <Link
                                to={`/vault/${vault.id}`}
                                onClick={() => {
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
                              </Link>
                            </div>
                          )}
                        </SortableVaultRow>
                      );
                    })}
                  </SortableContext>
                  {hiddenSharedVaultCount > 0 && (
                    <button
                      onClick={() => setShowAllSharedVaults((prev) => !prev)}
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-all duration-200"
                    >
                      {showAllSharedVaults ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          show_less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          +{hiddenSharedVaultCount} more
                        </>
                      )}
                    </button>
                  )}
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
                  favorites
                </span>
                {isFavoritesExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {isFavoritesExpanded && (
                <div className="mt-2 space-y-1">
                  <DndContext
                    sensors={favoritesSensors}
                    onDragStart={handleFavoriteDragStart}
                    onDragEnd={handleFavoriteDragEnd}
                    onDragCancel={handleFavoriteDragCancel}
                  >
                    <SortableContext items={favoriteVaultIds} strategy={verticalListSortingStrategy}>
                      {visibleFavoriteVaults.map((vault) => {
                        const href = vault.public_slug
                          ? `/public/${vault.public_slug}`
                          : `/vault/${vault.id}`;
                        return (
                          <SortableVaultRow key={vault.id} vaultId={vault.id} dragType="favorite">
                            {({ ref, style, isDragging, dragHandleProps }) => (
                              <div
                                ref={ref}
                                style={style}
                                className={cn(
                                  "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group hover:bg-sidebar-accent/50 text-sidebar-foreground/70 border-2 border-transparent",
                                  isDragging && "opacity-40 bg-gradient-to-br from-primary/15 to-violet-500/10 text-primary border-primary/40"
                                )}
                              >
                                <button
                                  type="button"
                                  {...dragHandleProps.attributes}
                                  {...dragHandleProps.listeners}
                                  className="shrink-0 h-5 w-5 -ml-1 flex items-center justify-center text-sidebar-foreground/0 group-hover:text-sidebar-foreground/40 hover:!text-sidebar-foreground focus-visible:text-sidebar-foreground/40 cursor-grab active:cursor-grabbing touch-none"
                                  aria-label={`Reorder ${vault.name}`}
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </button>
                                <Link
                                  to={href}
                                  onClick={onMobileClose}
                                  className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                  <div
                                    className="w-3 h-3 rounded-md shrink-0 shadow-sm"
                                    style={{ backgroundColor: vault.color || '#6366f1' }}
                                  />
                                  <span className="truncate font-medium">{vault.name}</span>
                                  {vault.public_slug ? (
                                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                                  ) : (
                                    <Share2 className="w-3 h-3 text-muted-foreground shrink-0" />
                                  )}
                                </Link>
                              </div>
                            )}
                          </SortableVaultRow>
                        );
                      })}
                    </SortableContext>
                    <DragOverlay modifiers={[snapCenterToCursor]} style={{ width: 'fit-content' }}>
                      <VaultDragOverlayContent activeDrag={activeFavoriteDrag} />
                    </DragOverlay>
                  </DndContext>
                  {hiddenFavoriteVaultCount > 0 && (
                    <button
                      onClick={() => setShowAllFavoriteVaults((prev) => !prev)}
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-all duration-200"
                    >
                      {showAllFavoriteVaults ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          show_less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          +{hiddenFavoriteVaultCount} more
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="shrink-0 border-t-2 border-sidebar-border">
          <div className="p-4">
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sidebar-accent/50 mb-3" data-onboarding-target="user-controls">
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
              <ThemeToggle />
              <KeyboardShortcutsButton />
              {onEditProfile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-sidebar-foreground/50 hover:text-primary"
                  onClick={onEditProfile}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={openWhatsNew}
              className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent font-mono text-xs relative mb-1"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              whats_new()
              {hasUnseen && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
              )}
            </Button>
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

          <WhatsNewDialog open={whatsNewOpen} onOpenChange={onWhatsNewOpenChange} />

          {/* Footer */}
          <div className="px-4 pb-4 pt-2 border-t border-sidebar-border/50">
            <p className="text-xs text-sidebar-foreground/30 text-center font-mono">
              © 2026 refhub.io
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
