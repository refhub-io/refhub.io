import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  FolderOpen, 
  Tags, 
  Plus, 
  LogOut, 
  ChevronDown,
  ChevronRight,
  Home,
  Settings,
  Menu,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Vault } from '@/types/database';

interface SidebarProps {
  vaults: Vault[];
  selectedVaultId: string | null;
  onSelectVault: (vaultId: string | null) => void;
  onCreateVault: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ 
  vaults, 
  selectedVaultId, 
  onSelectVault, 
  onCreateVault,
  isMobileOpen,
  onMobileClose
}: SidebarProps) {
  const [isVaultsExpanded, setIsVaultsExpanded] = useState(true);
  const { user, signOut } = useAuth();
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
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-sidebar-primary" />
            </div>
            <span className="font-display text-xl font-semibold">Citadel</span>
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
        <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
          <button
            onClick={() => {
              onSelectVault(null);
              onMobileClose();
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              selectedVaultId === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80"
            )}
          >
            <Home className="w-4 h-4" />
            All Publications
          </button>

          <div className="pt-4">
            <button
              onClick={() => setIsVaultsExpanded(!isVaultsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground/80 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                Vaults
              </span>
              {isVaultsExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>

            {isVaultsExpanded && (
              <div className="mt-1 space-y-0.5">
                {vaults.map((vault) => (
                  <button
                    key={vault.id}
                    onClick={() => {
                      onSelectVault(vault.id);
                      onMobileClose();
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      selectedVaultId === vault.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80"
                    )}
                  >
                    <div 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: vault.color }}
                    />
                    <span className="truncate">{vault.name}</span>
                  </button>
                ))}

                <button
                  onClick={() => {
                    onCreateVault();
                    onMobileClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Vault
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sm font-medium text-sidebar-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email?.split('@')[0]}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>
    </>
  );
}
