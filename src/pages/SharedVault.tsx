import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Lock,
  ShieldCheck,
  BookOpen,
  Heart,
  GitFork
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SharedVault() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const navigate = useNavigate();
  
  const [vault, setVault] = useState<Vault | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [userPermission, setUserPermission] = useState<'viewer' | 'editor' | null>(null);
  
  // Combined state update to prevent timing issues
  const updateAccessState = (updates: {
    accessDenied?: boolean;
    isOwner?: boolean;
    userPermission?: 'viewer' | 'editor' | null;
  }) => {
    if (updates.accessDenied !== undefined) setAccessDenied(updates.accessDenied);
    if (updates.isOwner !== undefined) setIsOwner(updates.isOwner);
    if (updates.userPermission !== undefined) setUserPermission(updates.userPermission);
  };
  const [forking, setForking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Compute access status for render
  const hasAccess = vault && (vault.is_public || isOwner || (user && vault.user_id === user.id));

  const handleRequestAccess = async () => {
    if (!user || !vault) return;
    
    try {
      setSubmittingRequest(true);
      
      // Check if user already has a pending request
      const { data: existingRequest } = await supabase
        .from('vault_access_requests')
        .select('id')
        .eq('vault_id', vault.id)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .single();
      
      if (existingRequest) {
        toast({
          title: 'request_already_pending',
          description: 'You already have a pending access request for this vault.',
          variant: 'destructive',
        });
        return;
      }
      
      // Create access request
      const { error } = await supabase
        .from('vault_access_requests')
        .insert({
          vault_id: vault.id,
          requester_id: user.id,
          requester_email: user.email,
          requester_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
          note: requestNote,
          status: 'pending'
        });
      
      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to submit access request. Please try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'request_submitted',
          description: 'Your access request has been submitted. The vault owner will be notified.',
        });
        setShowRequestModal(false);
        setRequestNote('');
      }
    } catch (error) {
      console.error('[SharedVault] request access error', error);
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleFavorite = async () => {
    if (!user || !vault) return;
    
    const success = await toggleFavorite(vault.id);
    if (success) {
      toast({
        title: isFavorite(vault.id) ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user || !vault) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return;
    }
    
    setForking(true);
    const newVault = await forkVault(vault);
    setForking(false);
    
    if (newVault) {
      navigate('/dashboard');
      toast({
        title: 'fork_success',
        description: 'The vault has been added to your collection.',
      });
    }
  };

  const fetchVault = useCallback(async () => {
    console.log('[SharedVault] fetchVault entry', { slug, user: !!user, isFetching });
    
    if (!slug || !user || isFetching) {
      console.log('[SharedVault] fetchVault early return', { 
        noSlug: !slug, 
        noUser: !user, 
        isFetching 
      });
      return;
    }
    
    setIsFetching(true);
    setLoading(true);
    setNotFound(false);
    setAccessDenied(false);
    // Don't reset permission here - let it persist unless we find new data
    
    try {
      console.log('[SharedVault] fetchVault called', { slug, user: !!user });
      
      const { data: vaultData, error: vaultError } = await supabase
        .from('vaults')
        .select('*')
        .eq('id', slug)
        .single();
      
      console.log('[SharedVault] Vault query result', { vaultData, vaultError });
      
      if (vaultError || !vaultData) {
        console.log('[SharedVault] Vault not found', { vaultError });
        setNotFound(true);
        return;
      }
      
      setVault(vaultData);
      const ownerUser = user && vaultData.user_id === user.id;
      const publicVault = vaultData.is_public;
      
      console.log('[SharedVault] Initial access check', { 
        isOwnerUser: ownerUser, 
        publicVault, 
        vaultUserId: vaultData.user_id, 
        currentUserId: user?.id 
      });
      
      // Check if user has access via shares or approved requests
      let hasAccess = publicVault || ownerUser;
      
      if (!ownerUser && !publicVault) {
        // Check for existing share with permission (by user_id or email)
        const { data: shareData, error: shareError } = await supabase
          .from('vault_shares')
          .select('permission')
          .eq('vault_id', vaultData.id)
          .or(`shared_with_user_id.eq.${user.id},shared_with_email.eq.${user.email}`)
          .single();
        
        console.log('[SharedVault] Share query result', { shareData, shareError });
        
        if (shareData) {
          hasAccess = true;
          const permission = shareData.permission as 'viewer' | 'editor';
          setUserPermission(permission);
          console.log('[SharedVault] User has share with permission:', permission);
          console.log('[SharedVault] Permission set to:', permission, 'Current state:', userPermission);
        } else {
          // Check for approved request
          const { data: approvedRequest } = await supabase
            .from('vault_access_requests')
            .select('id')
            .eq('vault_id', vaultData.id)
            .eq('requester_id', user.id)
            .eq('status', 'approved')
            .single();
          hasAccess = !!approvedRequest;
          console.log('[SharedVault] Approved request found:', !!approvedRequest);
        }
      } else if (publicVault) {
        // For public vaults, set default viewer permission
        setUserPermission('viewer');
        console.log('[SharedVault] Public vault, setting viewer permission');
      }
      
      // State will be updated asynchronously, so we'll check after React batch
      setTimeout(() => {
        console.log('[SharedVault] Final access decision (after batch)', { hasAccess, userPermission, isOwner });
      }, 0);
      
      if (!hasAccess) {
        console.log('[SharedVault] Access denied');
        setAccessDenied(true);
        return;
      }
      
      setIsOwner(ownerUser);
      
      if (hasAccess) {
        console.log('[SharedVault] Fetching publications');
        // Increment view count
        await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });
        
        // Fetch publications
        const { data: pubsData } = await supabase
          .from('publications')
          .select('*')
          .eq('vault_id', vaultData.id)
          .order('year', { ascending: false });
        
        if (pubsData) {
          setPublications(pubsData as Publication[]);
          console.log('[SharedVault] Publications loaded', pubsData.length);
          
          // Fetch tags
          const pubIds = pubsData.map(p => p.id);
          if (pubIds.length > 0) {
            const { data: pubTagsData } = await supabase
              .from('publication_tags')
              .select('*')
              .in('publication_id', pubIds);
            
            if (pubTagsData) {
              setPublicationTags(pubTagsData);
              
              const tagIds = [...new Set(pubTagsData.map(pt => pt.tag_id))];
              if (tagIds.length > 0) {
                const { data: tagsData } = await supabase
                  .from('tags')
                  .select('*')
                  .in('id', tagIds);
                
                if (tagsData) {
                  setTags(tagsData);
                  console.log('[SharedVault] Tags loaded', tagsData.length);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[SharedVault] fetch vault error', error);
      setNotFound(true);
    } finally {
      console.log('[SharedVault] fetchVault completed, setting loading to false');
      setLoading(false);
      setIsFetching(false);
    }
  }, [slug, user]);

  useEffect(() => {
    console.log('[SharedVault] useEffect triggered', { slug, user: !!user, loading });
    fetchVault();
  }, [slug, user]); // Removed fetchVault to prevent circular dependency

  // Debug: Log when userPermission changes
  useEffect(() => {
    console.log('[SharedVault] userPermission state changed:', userPermission);
  }, [userPermission]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// loading vault...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// vault_not_found</p>
          <p className="text-muted-foreground font-mono text-sm">// this_vault_doesnt_exist_or_was_removed</p>
          <Button 
            variant="outline" 
            className="font-mono"
            onClick={() => navigate('/dashboard')}
          >
            back_to_dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto border-2 border-primary/30">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// access_denied</p>
          <p className="text-muted-foreground font-mono text-sm">this_vault_is_private_you_need_permission</p>
          <div className="flex gap-4 justify-center">
            <Button 
              onClick={() => setShowRequestModal(true)}
              className="bg-gradient-primary font-mono text-white shadow-lg hover:shadow-xl transition-all"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              request_access
            </Button>
            <Button 
              variant="outline" 
              className="font-mono"
              onClick={() => navigate('/dashboard')}
            >
              back_to_dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        vaults={[]}
        sharedVaults={[vault].filter(Boolean)}
        selectedVaultId={vault?.id || null}
        onSelectVault={() => {}}
        onCreateVault={() => {}}
        onEditVault={isOwner ? () => navigate('/dashboard') : undefined}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        profile={profile}
        onEditProfile={() => {}}
      />

      <div className="flex-1 lg:pl-72 min-w-0">
        {/* Header with vault info and actions */}
        {vault && user && !accessDenied && (
          <div className="border-b border-border bg-card/50 backdrop-blur-xl">
            <div className="max-w-6xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {!isOwner && userPermission === 'viewer' && (
                        <Badge variant="secondary" className="font-mono text-xs">
                          VIEWER
                        </Badge>
                      )}
                      {!isOwner && userPermission === 'editor' && (
                        <Badge variant="secondary" className="font-mono text-xs">
                          EDITOR
                        </Badge>
                      )}
                      {isOwner && (
                        <Badge variant="secondary" className="font-mono text-xs">
                          OWNER
                        </Badge>
                      )}
                    </div>
                    {vault.description && (
                      <p className="text-muted-foreground font-mono text-sm">
                        // {vault.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <BookOpen className="w-4 h-4" />
                    {publications.length}
                  </span>
                  {!isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFavorite}
                      className="font-mono"
                    >
                      <Heart className={`w-4 h-4 ${isFavorite(vault.id) ? 'fill-red-500' : ''}`} />
                      <span className="ml-2">{isFavorite(vault.id) ? 'favorited' : 'favorite'}</span>
                    </Button>
                  )}
                  {!isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFork}
                      disabled={forking}
                      className="font-mono"
                    >
                      <GitFork className="w-4 h-4" />
                      <span className="ml-2">fork</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {vault && user && (
          <PublicationList
            publications={publications}
            tags={tags}
            vaults={[vault]}
            publicationTagsMap={publicationTags.reduce((acc, pt) => {
              if (!acc[pt.publication_id]) acc[pt.publication_id] = [];
              acc[pt.publication_id].push(pt.tag_id);
              return acc;
            }, {} as Record<string, string[]>)}
            relationsCountMap={{}}
            selectedVault={vault}
            onAddPublication={userPermission === 'editor' ? () => {
              // Editors can add publications
            } : () => {
              toast({
                title: 'read_only_vault',
                description: 'You have viewer permissions. Fork it to add papers.',
                variant: 'destructive',
              });
            }}
            onImportPublications={userPermission === 'editor' ? () => {
              // Editors can import publications
            } : () => {
              toast({
                title: 'read_only_vault', 
                description: 'You have viewer permissions. Fork it to import papers.',
                variant: 'destructive',
              });
            }}
            onEditPublication={userPermission === 'editor' ? (pub) => {
              // Editors can edit publications - would need to implement edit functionality
              toast({
                title: 'coming_soon',
                description: 'Edit functionality for shared vaults coming soon.',
                variant: 'default',
              });
            } : () => {
              toast({
                title: 'read_only_vault',
                description: 'You have viewer permissions. Fork it to edit papers.',
                variant: 'destructive',
              });
            }}
            onDeletePublication={userPermission === 'editor' ? () => {
              // Editors can delete publications
              toast({
                title: 'coming_soon',
                description: 'Delete functionality for shared vaults coming soon.',
                variant: 'default',
              });
            } : () => {
              toast({
                title: 'read_only_vault',
                description: 'You have viewer permissions. Fork it to delete papers.',
                variant: 'destructive',
              });
            }}
            onExportBibtex={(pubs) => {
              if (pubs.length > 0) {
                toast({ title: 'export_success ✨' });
              }
            }}
            onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
            onOpenGraph={() => {
              toast({
                title: 'read_only_vault',
                description: 'This is a shared vault. Fork it to view graph.',
                variant: 'destructive',
              });
            }}
            onEditVault={isOwner ? () => navigate('/dashboard') : undefined}
            onVaultUpdate={() => {}}
          />
        )}
      </div>

      <AlertDialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold font-mono">request_access</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              Send a request to vault owner for access
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium font-mono">your_name</label>
              <div className="p-3 border-2 border-border rounded-lg bg-muted/50 font-mono text-sm">
                {user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium font-mono">email</label>
              <div className="p-3 border-2 border-border rounded-lg bg-muted/50 font-mono text-sm">
                {user?.email || ''}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium font-mono">message</label>
              <textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="Tell vault owner why you need access..."
                className="w-full min-h-[100px] p-3 border-2 border-border rounded-lg bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={500}
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono" disabled={submittingRequest}>
              cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRequestAccess}
              disabled={submittingRequest || !requestNote.trim()}
              className="bg-gradient-primary font-mono text-white shadow-lg hover:shadow-xl transition-all"
            >
              {submittingRequest ? 'submitting...' : 'send_request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}