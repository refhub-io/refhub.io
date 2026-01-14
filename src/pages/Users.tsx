import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, Profile } from '@/hooks/useProfile';
import { Vault } from '@/types/database';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Search, 
  BookOpen, 
  Sparkles, 
  Users as UsersIcon,
  Globe,
  Github,
  Linkedin
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserWithStats extends Profile {
  vault_count: number;
  public_vault_count: number;
  publication_count: number;
}

export default function Users() {
  const { user, loading: authLoading } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const fetchVaults = useCallback(async () => {
    if (!user) return;
    try {
      const [ownedVaultsRes, sharedVaultsRes] = await Promise.all([
        supabase.from('vaults').select('*').eq('user_id', user.id).order('name'),
        supabase
          .from('vault_shares')
          .select('vault_id')
          .or(`shared_with_email.eq."${user.email}",shared_with_user_id.eq.${user.id}`),
      ]);

      if (ownedVaultsRes.data) setVaults(ownedVaultsRes.data as Vault[]);

      // Fetch shared vault details
      if (sharedVaultsRes.data && sharedVaultsRes.data.length > 0) {
        const sharedVaultIds = sharedVaultsRes.data.map(s => s.vault_id);
        const { data: sharedVaultsData } = await supabase
          .from('vaults')
          .select('*')
          .in('id', sharedVaultIds);
        if (sharedVaultsData) setSharedVaults(sharedVaultsData as Vault[]);
      }
    } catch (error) {
      console.error('Error fetching vaults:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchUsers();
      fetchVaults();
    }
  }, [user, fetchVaults]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      if (!profilesData) {
        setUsers([]);
        return;
      }

      // Fetch stats for each user
      const usersWithStats = await Promise.all(
        profilesData.map(async (profile) => {
          const [vaultsRes, pubsRes] = await Promise.all([
            supabase
              .from('vaults')
              .select('id, is_public', { count: 'exact' })
              .eq('user_id', profile.user_id),
            supabase
              .from('publications')
              .select('id', { count: 'exact' })
              .eq('user_id', profile.user_id),
          ]);

          const vaultCount = vaultsRes.count || 0;
          const publicVaultCount = vaultsRes.data?.filter(v => v.is_public).length || 0;
          const publicationCount = pubsRes.count || 0;

          return {
            ...profile,
            vault_count: vaultCount,
            public_vault_count: publicVaultCount,
            publication_count: publicationCount,
          } as UserWithStats;
        })
      );

      setUsers(usersWithStats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.display_name?.toLowerCase().includes(query) ||
      u.username?.toLowerCase().includes(query) ||
      u.bio?.toLowerCase().includes(query)
    );
  });

  const getInitials = (user: UserWithStats) => {
    if (user.display_name) {
      return user.display_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.username) {
      return user.username.slice(0, 2).toUpperCase();
    }
    return '?';
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple animate-glow-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {user && (
        <Sidebar
          vaults={vaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={(vaultId) => {
            if (vaultId) {
              navigate('/dashboard');
            }
          }}
          onCreateVault={() => navigate('/dashboard')}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          profile={profile}
          onEditProfile={() => setIsProfileDialogOpen(true)}
        />
      )}

      <div className={`flex-1 ${user ? 'lg:pl-72' : ''}`}>
        <div className="min-h-screen flex flex-col">
          {/* Mobile menu button */}
          {user && !isMobileSidebarOpen && (
            <MobileMenuButton 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="fixed top-4 left-4 z-50"
            />
          )}

          {/* Header */}
          <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-4 lg:px-8 py-4 shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate font-mono leading-none">
                  // <span className="text-gradient">researchers</span>
                </h1>
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate leading-none">
                  {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 px-4 lg:px-8 py-8">
            {/* Search */}
            <div className="max-w-4xl mx-auto mb-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="search_researchers..."
                  className="pl-10 font-mono"
                />
              </div>
            </div>

            {/* Users Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg animate-pulse">
                    <UsersIcon className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-muted-foreground font-mono text-sm">// loading_researchers...</p>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16">
                <UsersIcon className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground font-mono text-lg mb-2">
                  {searchQuery ? '// no_researchers_match_search' : '// no_researchers_yet'}
                </p>
              </div>
            ) : (
              <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredUsers.map((researcher) => (
                  <Card
                    key={researcher.id}
                    className="group hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                  >
                    <CardContent className="p-6">
                      {/* Header */}
                      <div className="flex items-start gap-4 mb-4">
                        <Avatar className="w-16 h-16 border-2 border-border ring-2 ring-background group-hover:ring-primary/20 transition-all">
                          {researcher.avatar_url ? (
                            <img src={researcher.avatar_url} alt={researcher.display_name || researcher.username || 'User'} className="object-cover" />
                          ) : (
                            <AvatarFallback className="text-lg font-mono bg-gradient-to-br from-primary/20 to-primary/10">
                              {getInitials(researcher)}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg truncate mb-1">
                            {researcher.display_name || researcher.username || 'Anonymous'}
                          </h3>
                          {researcher.username && (
                            <p className="text-sm text-muted-foreground font-mono truncate">
                              @{researcher.username}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bio */}
                      {researcher.bio && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                          {researcher.bio}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 mb-4 pt-4 border-t border-border/50">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">
                            {researcher.publication_count}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">papers</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">
                            {researcher.vault_count}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">vaults</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">
                            {researcher.public_vault_count}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">public</div>
                        </div>
                      </div>

                      {/* Social Links */}
                      <div className="flex items-center gap-2">
                        {researcher.github_url && (
                          <a
                            href={researcher.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="GitHub"
                          >
                            <Github className="w-4 h-4" />
                          </a>
                        )}
                        {researcher.linkedin_url && (
                          <a
                            href={researcher.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="LinkedIn"
                          >
                            <Linkedin className="w-4 h-4" />
                          </a>
                        )}
                        {researcher.bluesky_url && (
                          <a
                            href={researcher.bluesky_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="Bluesky"
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Profile Dialog */}
      {user && (
        <ProfileDialog
          open={isProfileDialogOpen}
          onOpenChange={setIsProfileDialogOpen}
          profile={profile}
          onSave={refetchProfile}
        />
      )}
    </div>
  );
}
