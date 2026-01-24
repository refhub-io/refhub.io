import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { publicationToBibtex, exportMultipleToBibtex, downloadBibtex } from '@/lib/bibtex';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HierarchicalTagBadge } from '@/components/tags/HierarchicalTagBadge';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Search, 
  Download, 
  ExternalLink, 
  FileText,
  BookOpen,
  Calendar,
  Users,
  ArrowLeft,
  Globe,
  Lock,
  Heart,
  GitFork
} from 'lucide-react';

export default function PublicVault() {
  const { slug } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const navigate = useNavigate();
  const [vault, setVault] = useState<Vault | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [forking, setForking] = useState(false);
  // For protected vault request access
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requestNote, setRequestNote] = useState('');
  // Whether the UI should offer a request access form (only for protected vaults)
  const [canRequestAccess, setCanRequestAccess] = useState(false);

  // Client-side request cooldown (ms) to avoid rapid spamming from same browser
  const REQUEST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  const isOnCooldown = (vaultId: string) => {
    try {
      const key = `access_request_ts_${vaultId}`;
      const ts = localStorage.getItem(key);
      if (!ts) return false;
      return Date.now() - Number(ts) < REQUEST_COOLDOWN_MS;
    } catch (_) {
      return false;
    }
  };
  const setCooldown = (vaultId: string) => {
    try { localStorage.setItem(`access_request_ts_${vaultId}`, String(Date.now())); } catch (_) {/* noop */}
  };

  // Check database for existing pending request by requester_id or requester_email
  const checkExistingPending = async (vaultId: string, requesterId?: string | null, requesterEmailArg?: string | null) => {
    try {
      if (requesterId) {
        const { data: byId } = await supabase
          .from('vault_access_requests')
          .select('id')
          .eq('vault_id', vaultId)
          .eq('requester_id', requesterId)
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();
        if (byId) return true;
      }
      if (requesterEmailArg) {
        const { data: byEmail } = await supabase
          .from('vault_access_requests')
          .select('id')
          .eq('vault_id', vaultId)
          .eq('requester_email', requesterEmailArg)
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();
        if (byEmail) return true;
      }
      return false;
    } catch (error) {
      // If a DB error occurs, be conservative and don't allow duplicate insert (to avoid accidental spamming)
      // eslint-disable-next-line no-console
      console.error('[PublicVault] checkExistingPending failed', error);
      return true;
    }
  };

  // Whether the current user/email already has a pending request (used to show inline warning)
  const [existingPending, setExistingPending] = useState(false);

  // On load, if we have a signed-in user, check for existing pending request and show inline warning
  useEffect(() => {
    (async () => {
      const id = slug ?? vault?.id;
      if (!id) return;
      if (!user) {
        setExistingPending(false);
        return;
      }
      try {
        const { data: profile } = await supabase.from('profiles').select('id,email').eq('user_id', user.id).single();
        const requesterId = profile?.id ?? user.id;
        const requesterEmail = profile?.email ?? user.email;
        const exists = await checkExistingPending(id, requesterId, requesterEmail);
        setExistingPending(Boolean(exists));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PublicVault] initial existing pending check failed', err);
      }
    })();
  }, [slug, vault, user]);

  // Centralized anonymous submit handler used for UUID and protected views
  const handleAnonymousSubmit = async (vaultId: string) => {
    if (!requesterEmail) {
      toast({ title: 'please_provide_email', description: 'Email required when not signed in.', variant: 'destructive' });
      return;
    }

    setRequesting(true);
    try {
      const already = await checkExistingPending(vaultId, null, requesterEmail);
      if (already) {
        setRequesting(false);
        setRequestSent(true);
        toast({ title: 'request_already_pending' });
        return;
      }
      if (isOnCooldown(vaultId)) {
        setRequesting(false);
        toast({ title: 'request_already_sent_recently' });
        return;
      }

      const { error } = await supabase.schema('public').from('vault_access_requests').insert({
        vault_id: vaultId,
        requester_name: requesterName || null,
        requester_email: requesterEmail || null,
        note: requestNote || null,
      });

      setRequesting(false);
      if (!error) {
        setRequestSent(true);
        setCooldown(vaultId);
        toast({ title: 'Access request sent!' });
      } else {
        if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
          toast({ title: 'request_already_pending' });
        } else {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
      }
    } catch (err: any) {
      setRequesting(false);
      toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  // Fetch the vault by slug
  const fetchPublicVault = useCallback(async () => {
    setLoading(true);
    try {
      // Track whether an id-based lookup found a share for the current user (used for permission checks)
      let vaultByIdHasShare = false;
      // Try to fetch by public_slug first (skip when slug looks like a UUID)
      // Only treat a slug as a public URL if the vault is explicitly public
      let vaultData = null;
      let vaultError = null;
      if (!slug || !/^[0-9a-fA-F-]{32,36}$/.test(slug)) {
        const res = await supabase
          .from('vaults')
          .select('*')
          .eq('public_slug', slug)
          .eq('is_public', true)
          .single();
        vaultData = res.data;
        vaultError = res.error;
      }

      // If not found, try by id (UUID)
      if (vaultError || !vaultData) {
        const { data: vaultById, error: vaultByIdError } = await supabase
          .from('vaults')
          .select('*')
          .eq('id', slug)
          .single();
        // Check for RLS access denied error
        if (vaultByIdError) {
          if (
            vaultByIdError.code === '42501' ||
            vaultByIdError.message?.toLowerCase().includes('permission denied') ||
            vaultByIdError.message?.toLowerCase().includes('access denied')
          ) {
            setAccessDenied(true);
            return;
          }
        }
        if (!vaultById) {
          setNotFound(true);
          return;
        }

        // If the vault is not public, handle protected vs private rules
        if (!vaultById.is_public) {
          // Private vaults (not shared) should not allow requests or visibility by ID
          if (!vaultById.is_shared) {
            setAccessDenied(true);
            setCanRequestAccess(false);
            return;
          }

          // Protected vaults (shared) may allow requests from non-owners/non-shared viewers
          if (!user) {
            setAccessDenied(true);
            setCanRequestAccess(true);
            return;
          }

          if (vaultById.user_id !== user.id) {
            // Check vault_shares for an explicit share
            const { data: share, error: shareError } = await supabase
              .from('vault_shares')
              .select('id')
              .eq('vault_id', vaultById.id)
              .or(`shared_with_email.eq."${user.email}",shared_with_user_id.eq.${user.id}`)
              .maybeSingle();

            if (shareError) {
              // Log error to help diagnose HTTP 400 responses (invalid input / auth / RLS issues)
              // eslint-disable-next-line no-console
              console.debug('[PublicVault] vault_shares lookup error', shareError);
              setAccessDenied(true);
              return;
            }
            if (!share) {
              setAccessDenied(true);
              setCanRequestAccess(true);
              return;
            }

            // Mark that an explicit share exists so we fetch publications below
            vaultByIdHasShare = true;
          }
        }

        vaultData = vaultById;
      }

      setVault(vaultData as Vault);
      // Check if current user is the owner
      if (user && vaultData.user_id === user.id) {
        setIsOwner(true);
      }

      // Only fetch publications if public, owner, or an explicit share was found during ID lookup
      if (vaultData.is_public || (user && vaultData.user_id === user.id) || vaultByIdHasShare) {

        // Increment view count
        await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });

        // Fetch publications in this vault
        const { data: pubsData } = await supabase
          .from('publications')
          .select('*')
          .eq('vault_id', vaultData.id)
          .order('year', { ascending: false });

        if (pubsData) {
          setPublications(pubsData as Publication[]);
          // Fetch tags for these publications
          const pubIds = pubsData.map(p => p.id);
          if (pubIds.length > 0) {
            const { data: pubTagsData } = await supabase
              .from('publication_tags')
              .select('*')
              .in('publication_id', pubIds);

            if (pubTagsData) {
              setPublicationTags(pubTagsData as PublicationTag[]);

              const tagIds = [...new Set(pubTagsData.map(pt => pt.tag_id))];
              if (tagIds.length > 0) {
                const { data: tagsData } = await supabase
                  .from('tags')
                  .select('*')
                  .in('id', tagIds);

                if (tagsData) {
                  setTags(tagsData as Tag[]);
                }
              }
            }
          }
        }
      }
    }
    catch (error) {
      // Try to detect RLS access denied error
      if (
        error?.code === '42501' ||
        error?.message?.toLowerCase().includes('permission denied') ||
        error?.message?.toLowerCase().includes('access denied')
      ) {
        setAccessDenied(true);
      } else {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, user]);

  // Ensure fetchPublicVault is called on mount and when slug/user changes
  useEffect(() => {
    fetchPublicVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPublicVault]);



  const publicationTagsMap: Record<string, string[]> = {};
  publicationTags.forEach((pt) => {
    if (!publicationTagsMap[pt.publication_id]) {
      publicationTagsMap[pt.publication_id] = [];
    }
    publicationTagsMap[pt.publication_id].push(pt.tag_id);
  });

  // Filtered publications for search
  const filteredPublications = publications.filter((pub) => {
    const query = searchQuery.toLowerCase();
    return (
      pub.title.toLowerCase().includes(query) ||
      pub.authors?.some(a => a.toLowerCase().includes(query)) ||
      pub.journal?.toLowerCase().includes(query)
    );
  });

  const getTagsForPublication = (pubId: string): Tag[] => {
    const tagIds = publicationTagsMap[pubId] || [];
    return tags.filter(t => tagIds.includes(t.id));
  };

  const handleExportAll = async () => {
    if (filteredPublications.length === 0 || !vault) return;
    
    // Increment download count
    await supabase.rpc('increment_vault_downloads', { vault_uuid: vault.id });
    
    const content = exportMultipleToBibtex(filteredPublications);
    downloadBibtex(content, `${vault.name || 'references'}.bib`);
    toast({ title: `exported_${filteredPublications.length}_references 📄` });
  };

  const handleExportSingle = (pub: Publication) => {
    const content = publicationToBibtex(pub);
    downloadBibtex(content, `${pub.bibtex_key || 'reference'}.bib`);
    toast({ title: 'reference_exported 📄' });
  };

  const handleFavorite = async () => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to favorite this vault.',
        variant: 'destructive',
      });
      return;
    }
    if (!vault) return;
    
    const success = await toggleFavorite(vault.id);
    if (success) {
      toast({
        title: isFavorite(vault.id) ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return;
    }
    if (!vault) return;
    
    setForking(true);
    const newVault = await forkVault(vault);
    setForking(false);
    
    if (newVault) {
      navigate('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple animate-glow-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// loading vault...</p>
        </div>
      </div>
    );
  }

  // If the id looks like a UUID, we may show a request form — but only when the vault is protected
  const isUuid = slug && /^[0-9a-fA-F-]{32,36}$/.test(slug);

  if (isUuid && canRequestAccess) {
    const handleRequestAccess = async () => {
      if (!user) {
        toast({
          title: 'sign_in_required',
          description: 'Please sign in to request access.',
          variant: 'destructive',
        });
        return;
      }
      // If the user already has a pending request, show inline warning and block
      if (existingPending) {
        setRequestSent(true);
        return;
      }

      setRequesting(true);
      try {
        // Try to find the user's profile row so we can store profile.id as requester_id
        const { data: profile } = await supabase.from('profiles').select('id,display_name,email,username').eq('user_id', user.id).single();
        const payload: any = { vault_id: slug };
        if (profile?.id) payload.requester_id = profile.id; else payload.requester_id = user.id;
        if (profile?.email) payload.requester_email = profile.email; else payload.requester_email = user.email;
        if (profile?.display_name) payload.requester_name = profile.display_name;

        // Prevent duplicates & spam: check for existing pending request and a short client cooldown
        const already = await checkExistingPending(slug!, payload.requester_id, payload.requester_email);
        if (already) {
          setRequesting(false);
          setExistingPending(true);
          setRequestSent(true);
          return;
        }
        if (isOnCooldown(slug!)) {
          setRequesting(false);
          setCooldown(slug!);
          return;
        }

        const { error } = await supabase
          .schema('public')
          .from('vault_access_requests')
          .insert(payload);

        setRequesting(false);
        if (!error) {
          setRequestSent(true);
          setExistingPending(true);
          setCooldown(slug!);
        } else {
          // Handle uniqueness violation from DB (defensive)
          if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
            setExistingPending(true);
          } else {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
          }
        }
      } catch (err: any) {
        setRequesting(false);
        toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
      }
    };
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Globe className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">protected_vault</h1>
            <p className="text-muted-foreground font-mono text-sm">
              // this_vault_is_protected_and_not_public
            </p>
            <p className="text-muted-foreground font-mono text-sm mt-2">
              If you believe you should have access, please contact the vault owner.
            </p>
          </div>
          {!requestSent ? (
            <div className="space-y-3">
              {!user ? (
                <form onSubmit={async (e) => { e.preventDefault(); await handleAnonymousSubmit(slug!); }}>
                  <div className="space-y-2">
                    <Label className="font-mono">your_name</Label>
                    <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Your name (optional)" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono">your_email</Label>
                    <Input value={requesterEmail} onBlur={async () => {
                      if (!slug || !requesterEmail) return;
                      const exists = await checkExistingPending(slug, null, requesterEmail);
                      setExistingPending(Boolean(exists));
                    }} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="Your email (required)" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono">message</Label>
                    <Textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} placeholder="Optional note to the owner" rows={3} />
                  </div>

                  {/* Inline warning for people who already have a pending request */}
                  {existingPending && (
                    <div className="mb-2">
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2 text-sm text-orange-700 font-mono flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 text-orange-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        <div>You already have a pending access request for this vault.</div>
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="font-mono" variant="glow" disabled={requesting || existingPending}>
                    {requesting ? 'Requesting...' : 'Request Access'}
                  </Button>
                </form>
              ) : (
                <div>
                  {existingPending && (
                    <div className="mb-2">
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2 text-sm text-orange-700 font-mono flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 text-orange-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        <div>You already have a pending access request for this vault.</div>
                      </div>
                    </div>
                  )}
                  <Button onClick={handleRequestAccess} className="font-mono" variant="glow" disabled={requesting || existingPending}>
                    {requesting ? 'Requesting...' : 'Request Access'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-green-600 font-mono">Request sent! Await owner approval.</div>
          )}
          <Link to="/">
            <Button variant="outline" className="font-mono mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              back_to_home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // If slug is not UUID and vault wasn't found, show a friendly not found screen
  if (notFound && !isUuid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Globe className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
            <p className="text-muted-foreground font-mono text-sm">// no_public_vault_matches_this_slug</p>
          </div>
          <Link to="/">
            <Button variant="outline" className="font-mono mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              back_to_home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // If slug is UUID but we couldn't find a vault with that id, show not found (no request form)
  if (isUuid && notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Globe className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
            <p className="text-muted-foreground font-mono text-sm">// no_vault_exists_with_that_id</p>
          </div>
          <Link to="/">
            <Button variant="outline" className="font-mono mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              back_to_home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show protected vault message if vault exists, but is not public and user is not owner
  if (vault && !vault.is_public && !isOwner) {
    // Private vaults (not shared) should show access denied and not an access request form
    if (!vault.is_shared) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-6 p-8">
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2 font-mono">access_denied</h1>
              <p className="text-muted-foreground font-mono text-sm">// this_vault_is_private</p>
            </div>
            <Link to="/">
              <Button variant="outline" className="font-mono mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                back_to_home
              </Button>
            </Link>
          </div>
        </div>
      );
    }

    // Protected vaults (shared): allow requesting access from non-owner, non-shared users
    const handleRequestAccess = async () => {
      if (!user) {
        toast({
          title: 'sign_in_required',
          description: 'Please sign in to request access.',
          variant: 'destructive',
        });
        return;
      }
      setRequesting(true);
      try {
        const { data: profile } = await supabase.from('profiles').select('id,display_name,email,username').eq('user_id', user.id).single();
        const payload: any = { vault_id: vault.id };
        if (profile?.id) payload.requester_id = profile.id; else payload.requester_id = user.id;
        if (profile?.email) payload.requester_email = profile.email; else payload.requester_email = user.email;
        if (profile?.display_name) payload.requester_name = profile.display_name;

        const { error } = await supabase
          .schema('public')
          .from('vault_access_requests')
          .insert(payload);

        setRequesting(false);
        if (!error) {
          setRequestSent(true);
          toast({ title: 'Access request sent!' });
        } else {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
      } catch (err: any) {
        setRequesting(false);
        toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
      }

      return;
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Globe className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">protected_vault</h1>
            <p className="text-muted-foreground font-mono text-sm">// this_vault_is_protected_and_not_public</p>
            <p className="text-muted-foreground font-mono text-sm mt-2">If you believe you should have access, please contact the vault owner.</p>
          </div>

          {!requestSent ? (
            <div className="space-y-3">
              {!user ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await handleAnonymousSubmit(vault.id);
                  }}
                >
                  <div className="space-y-2">
                    <Label className="font-mono">your_name</Label>
                    <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Your name (optional)" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono">your_email</Label>
                    <Input value={requesterEmail} onBlur={async () => {
                      if (!vault || !requesterEmail) return;
                      const exists = await checkExistingPending(vault.id, null, requesterEmail);
                      setExistingPending(Boolean(exists));
                    }} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="Your email (required)" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono">message</Label>
                    <Textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} placeholder="Optional note to the owner" rows={3} />
                  </div>

                  {/* Inline warning for people who already have a pending request */}
                  {existingPending && (
                    <div className="mb-2">
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2 text-sm text-orange-700 font-mono flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 text-orange-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        <div>You already have a pending access request for this vault.</div>
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="font-mono" variant="glow" disabled={requesting || existingPending}>
                    {requesting ? 'Requesting...' : 'Request Access'}
                  </Button>
                </form>
              ) : (
                <div>
                  {existingPending && (
                    <div className="mb-2">
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2 text-sm text-orange-700 font-mono flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 text-orange-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        <div>You already have a pending access request for this vault.</div>
                      </div>
                    </div>
                  )}
                  <Button onClick={async () => {
                    if (existingPending) return; await handleRequestAccess();
                  }} className="font-mono" variant="glow" disabled={requesting || existingPending}>
                    {requesting ? 'Requesting...' : 'Request Access'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-green-600 font-mono">Request sent! Await owner approval.</div>
          )}

          <Link to="/">
            <Button variant="outline" className="font-mono mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              back_to_home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">
              <span className="text-gradient">refhub</span>
              <span className="text-foreground/60">.io</span>
            </span>
          </Link>
          <Badge variant="neon" className="gap-1 font-mono">
            <Globe className="w-3 h-3" />
            public_vault
          </Badge>
        </div>
      </header>

      {/* Vault Header */}
      <div className="border-b-2 border-border bg-gradient-to-b from-card/80 to-background">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div 
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl shrink-0 shadow-lg"
              style={{ backgroundColor: vault?.color }}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">{vault?.name}</h1>
              {vault?.description && (
                <p className="text-muted-foreground font-mono text-sm mb-4">
                  // {vault.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  {publications.length} papers
                </span>
              </div>
            </div>
            
            {/* Fork/Favorite buttons - visible to all users */}
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFavorite}
                disabled={isOwner}
                className={`font-mono ${vault && isFavorite(vault.id) ? 'text-rose-500 border-rose-500/30' : ''}`}
                title={isOwner ? 'you_own_this_vault' : undefined}
              >
                <Heart className={`w-4 h-4 sm:mr-1.5 ${vault && isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                <span className="hidden sm:inline">{vault && isFavorite(vault.id) ? 'favorited' : 'favorite'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFork}
                disabled={forking || isOwner}
                title={isOwner ? 'you_own_this_vault' : undefined}
                className="font-mono"
              >
                <GitFork className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{forking ? 'forking...' : 'fork'}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search and Export */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="search_papers..."
              className="pl-10 font-mono"
            />
          </div>
          <Button 
            variant="outline" 
            onClick={handleExportAll}
            disabled={filteredPublications.length === 0}
            className="font-mono"
          >
            <Download className="w-4 h-4 mr-2" />
            export_all_bibtex
          </Button>
        </div>

        {/* Publications Grid */}
        {filteredPublications.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground font-mono">
              {searchQuery ? '// no papers match your search' : '// no papers in this vault yet'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredPublications.map((pub) => {
              const pubTags = getTagsForPublication(pub.id);
              return (
                <article
                  key={pub.id}
                  className="p-6 rounded-2xl border-2 border-border bg-card/50 hover:border-primary/30 transition-all duration-200 group"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                        {pub.title}
                      </h2>
                      
                      {pub.authors && pub.authors.length > 0 && (
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          {pub.authors.join(', ')}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                        {pub.journal && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            {pub.journal}
                          </span>
                        )}
                        {pub.year && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {pub.year}
                          </span>
                        )}
                        {pub.volume && <span>Vol. {pub.volume}</span>}
                        {pub.issue && <span>Issue {pub.issue}</span>}
                      </div>

                      {pubTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {pubTags.map((tag) => (
                            <HierarchicalTagBadge
                              key={tag.id}
                              tag={tag}
                              allTags={tags}
                              size="sm"
                              showHierarchy
                            />
                          ))}
                        </div>
                      )}

                      {pub.abstract && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {pub.abstract}
                        </p>
                      )}
                    </div>

                    <div className="flex lg:flex-col gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportSingle(pub)}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        BibTeX
                      </Button>
                      {pub.doi && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`https://doi.org/${encodeURIComponent(pub.doi)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            DOI
                          </a>
                        </Button>
                      )}
                      {pub.url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={pub.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Link
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border mt-16 py-8 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          Powered by <Link to="/" className="text-primary hover:underline">refhub.io</Link>
        </p>
      </footer>
    </div>
  );
}
