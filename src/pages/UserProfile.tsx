import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Profile, Vault } from '@/types/database';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader } from '@/components/ui/loader';
import { logger } from '@/lib/logger';
import { Github, Linkedin, ArrowLeft, BookOpen, Vault as VaultIcon, ExternalLink, Globe } from 'lucide-react';

type VaultWithCount = Vault & { vault_publications: { id: string }[]; is_fork?: boolean };

function getInitials(p: Profile): string {
  if (p.display_name) {
    return p.display_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return (p.username ?? '?').slice(0, 2).toUpperCase();
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const { user, loading: authLoading } = useAuth();
  const { profile: currentProfile, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();

  const [researcherProfile, setResearcherProfile] = useState<Profile | null>(null);
  const [publicVaults, setPublicVaults] = useState<VaultWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sidebarVaults, setSidebarVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [user, authLoading, navigate]);

  const fetchSidebarVaults = useCallback(async () => {
    if (!user) return;
    try {
      const [ownedRes, sharedRes] = await Promise.all([
        supabase.from('vaults').select('*').eq('user_id', user.id).order('name'),
        supabase.from('vault_shares').select('vault_id')
          .or(`shared_with_email.eq.${user.email},shared_with_user_id.eq.${user.id}`),
      ]);
      if (ownedRes.data) setSidebarVaults(ownedRes.data as Vault[]);
      if (sharedRes.data?.length) {
        const ids = sharedRes.data.map((s) => s.vault_id);
        const { data } = await supabase.from('vaults').select('*').in('id', ids);
        if (data) setSharedVaults(data as Vault[]);
      }
    } catch (err) {
      logger.error('UserProfile', 'Error fetching sidebar vaults:', err);
    }
  }, [user]);

  const fetchProfileData = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .eq('is_setup', true)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setResearcherProfile(profileData as Profile);

      const { data: vaultsData, error: vaultsError } = await supabase
        .from('vaults')
        .select('*, vault_publications(id)')
        .eq('user_id', profileData.user_id)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      if (vaultsError) throw vaultsError;

      const fetchedVaults = (vaultsData ?? []) as VaultWithCount[];
      const vaultIds = fetchedVaults.map((vault) => vault.id);
      const { data: forkedVaultRows, error: forkedVaultsError } = vaultIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from('vault_forks')
            .select('forked_vault_id')
            .in('forked_vault_id', vaultIds);

      if (forkedVaultsError) throw forkedVaultsError;

      const forkedVaultIds = new Set((forkedVaultRows ?? []).map((row) => row.forked_vault_id));
      setPublicVaults(
        fetchedVaults.map((vault) => ({
          ...vault,
          is_fork: forkedVaultIds.has(vault.id),
        })),
      );
    } catch (err) {
      logger.error('UserProfile', 'Error fetching profile data:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (user) {
      fetchProfileData();
      fetchSidebarVaults();
    }
  }, [user, fetchProfileData, fetchSidebarVaults]);

  const totalPapers = publicVaults.reduce((sum, v) => sum + v.vault_publications.length, 0);

  const joinedYear = researcherProfile?.created_at
    ? new Date(researcherProfile.created_at).getFullYear()
    : null;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="loading_profile" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {user && (
        <Sidebar
          vaults={sidebarVaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={(vaultId) => { if (vaultId) navigate('/dashboard'); }}
          onCreateVault={() => navigate('/dashboard')}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          profile={currentProfile}
          onEditProfile={() => setIsProfileDialogOpen(true)}
        />
      )}

      <div className={`flex-1 ${user ? 'lg:pl-72' : ''}`}>
        <div className="min-h-screen flex flex-col">

          {/* ── Header ─────────────────────────────────────────── */}
          <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-4 lg:px-8 py-4 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <MobileMenuButton
                onClick={() => setIsMobileSidebarOpen(true)}
                className="shrink-0"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/users')}
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3 h-3 mr-1" />
                researchers
              </Button>
              {researcherProfile && (
                <>
                  <span className="text-muted-foreground/40 font-mono text-xs">/</span>
                  <span className="font-mono text-xs text-muted-foreground truncate">
                    @{researcherProfile.username}
                  </span>
                </>
              )}
            </div>
          </header>

          {/* ── Main ───────────────────────────────────────────── */}
          <main className="flex-1 px-4 lg:px-8 py-8">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader message="// loading_profile..." />
              </div>
            ) : notFound ? (
              <div className="text-center py-24">
                <p className="text-muted-foreground font-mono text-lg mb-4">
                  // researcher_not_found
                </p>
                <Button variant="outline" onClick={() => navigate('/users')} className="font-mono">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  back_to_researchers
                </Button>
              </div>
            ) : researcherProfile && (
              <div className="max-w-4xl mx-auto space-y-8">

                {/* ── Profile card ───────────────────────────── */}
                <div className="rounded-2xl border-2 border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                  {/* Gradient top bar */}
                  <div className="h-1.5 bg-gradient-primary w-full" />

                  <div className="p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row items-start gap-6">
                      {/* Avatar */}
                      <Avatar className="w-20 h-20 border-2 border-border ring-4 ring-background shrink-0">
                        {researcherProfile.avatar_url ? (
                          <img
                            src={researcherProfile.avatar_url}
                            alt={researcherProfile.display_name ?? researcherProfile.username ?? 'User'}
                            className="object-cover"
                          />
                        ) : (
                          <AvatarFallback className="text-2xl font-mono bg-gradient-to-br from-primary/20 to-primary/10">
                            {getInitials(researcherProfile)}
                          </AvatarFallback>
                        )}
                      </Avatar>

                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h1 className="text-2xl font-bold truncate">
                            {researcherProfile.display_name ?? researcherProfile.username ?? 'Anonymous'}
                          </h1>
                          {joinedYear && (
                            <span className="text-xs text-muted-foreground font-mono">
                              // since_{joinedYear}
                            </span>
                          )}
                        </div>
                        {researcherProfile.username && (
                          <p className="text-sm text-muted-foreground font-mono mb-3">
                            @{researcherProfile.username}
                          </p>
                        )}
                        {researcherProfile.bio && (
                          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                            {researcherProfile.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stats + social */}
                    <div className="flex flex-wrap items-center gap-6 mt-6 pt-6 border-t border-border/50">
                      <div className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
                        <BookOpen className="w-4 h-4 text-primary" />
                        <span className="font-bold text-foreground">{totalPapers}</span>
                        papers_public
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
                        <VaultIcon className="w-4 h-4 text-primary" />
                        <span className="font-bold text-foreground">{publicVaults.length}</span>
                        public_vaults
                      </div>

                      {/* Social links */}
                      <div className="flex items-center gap-1 ml-auto">
                        {researcherProfile.github_url && (
                          <a
                            href={researcherProfile.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="GitHub"
                          >
                            <Github className="w-4 h-4" />
                          </a>
                        )}
                        {researcherProfile.linkedin_url && (
                          <a
                            href={researcherProfile.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="LinkedIn"
                          >
                            <Linkedin className="w-4 h-4" />
                          </a>
                        )}
                        {researcherProfile.bluesky_url && (
                          <a
                            href={researcherProfile.bluesky_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="Bluesky"
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Public vaults ──────────────────────────── */}
                <section>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-primary font-mono flex items-center gap-2 mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-primary" />
                    // public_vaults ({publicVaults.length})
                  </h2>

                  {publicVaults.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-card/40 py-12 text-center">
                      <p className="text-muted-foreground font-mono text-sm">
                        // no_public_vaults_yet
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {publicVaults.map((vault) => (
                        <div
                          key={vault.id}
                          className={`group rounded-xl border-2 bg-card/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 overflow-hidden ${vault.is_fork ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-border'}`}
                        >
                          {/* Color accent bar */}
                          <div
                            className="h-1"
                            style={{ backgroundColor: vault.color ?? 'hsl(260, 80%, 60%)' }}
                          />

                          <div className="p-5">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h3 className="font-bold font-mono truncate group-hover:text-primary transition-colors">
                                {vault.name}
                              </h3>
                              <div className="flex flex-wrap justify-end gap-2 shrink-0">
                                {vault.is_fork && (
                                  <Badge variant="outline" className="font-mono text-[10px] border-amber-500/30 text-amber-600">
                                    forked
                                  </Badge>
                                )}
                                {vault.category && (
                                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                                    {vault.category}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {(vault.description ?? vault.abstract) && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                                {vault.description ?? vault.abstract}
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-border/50">
                              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                                <BookOpen className="w-3.5 h-3.5" />
                                {vault.vault_publications.length}_papers
                              </span>

                              {vault.public_slug ? (
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="sm"
                                  className="font-mono text-xs h-7 px-2"
                                >
                                  <Link to={`/public/${vault.public_slug}`}>
                                    open_vault
                                    <ExternalLink className="w-3 h-3 ml-1" />
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      {user && (
        <ProfileDialog
          open={isProfileDialogOpen}
          onOpenChange={setIsProfileDialogOpen}
          onSave={refetchProfile}
        />
      )}
    </div>
  );
}
