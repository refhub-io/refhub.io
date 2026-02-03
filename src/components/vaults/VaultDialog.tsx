import { useState, useEffect, useCallback, useRef } from 'react';
import { Vault, VaultShare, VAULT_CATEGORIES } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Users, Globe, Mail, Trash2, Copy, Check, Link2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type VaultVisibility = 'private' | 'protected' | 'public';

const VAULT_COLORS = [
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

interface VaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault?: Vault | null;
  initialRequestId?: string;
  onSave: (data: Partial<Vault>) => Promise<void>;
  onUpdate?: () => void;
  onDelete?: (vault: Vault) => void;
}

export function VaultDialog({ open, onOpenChange, vault, initialRequestId, onSave, onUpdate, onDelete }: VaultDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(VAULT_COLORS[0]);
  const [category, setCategory] = useState<string>('');
  const [abstract, setAbstract] = useState('');
  const [visibility, setVisibility] = useState<VaultVisibility>('private');
  const [saving, setSaving] = useState(false);

  // Sharing state
  const [shares, setShares] = useState<VaultShare[]>([]);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [requestPermissions, setRequestPermissions] = useState<Record<string, 'viewer' | 'editor'>>({});
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [diagResult, setDiagResult] = useState<{ data?: any; error?: any; count?: number } | null>(null);
  const [sharePermission, setSharePermission] = useState<'viewer' | 'editor'>('viewer');
  const [publicSlug, setPublicSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const slugCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const initialValuesRef = useRef<{ name: string; description: string; color: string; category: string; abstract: string; visibility: VaultVisibility; publicSlug: string } | null>(null);

  // Fetch access requests for owners and enrich with display names when possible
  async function fetchAccessRequests() {
    if (!vault) return;
    // Debug: log current auth user id to help diagnose RLS/visibility issues
    // eslint-disable-next-line no-console
    console.debug('[VaultDialog] current auth user', { userId: user?.id });

    // Get the access requests
    const { data: requests, error: requestsError } = await supabase
      .from('vault_access_requests')
      .select('*')
      .eq('vault_id', vault.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (requestsError) {
      // eslint-disable-next-line no-console
      console.error('[VaultDialog] error fetching vault_access_requests', requestsError);
      return;
    }

    if (requests) {
      // Process requests to set display names
      const processed = requests.map((r) => {
        // Construct display name prioritizing: requester_name > requester_email > 'Someone'
        let displayName = 'Someone'; // Default fallback

        if (r.requester_name) {
          displayName = r.requester_name;
        } else if (r.requester_email) {
          // If no name provided, use the email
          displayName = r.requester_email;
        }

        return { ...r, display_name: displayName, requester_profile: null };
      });

      setAccessRequests(processed);

      // Initialize per-request permission selections (default viewer)
      const perms: Record<string, 'viewer' | 'editor'> = {};
      processed.forEach((r) => { perms[r.id] = 'viewer'; });
      setRequestPermissions(perms);

      // Debug: log fetched count and a summary to help diagnose missing requests
      // eslint-disable-next-line no-console
      console.debug('[VaultDialog] fetched access requests', { count: processed.length, example: processed[0] || null });

      // extra debug: raw fetch for owner diagnostics
      const raw = await supabase.from('vault_access_requests').select('*').eq('vault_id', vault.id);
      // eslint-disable-next-line no-console
      console.debug('[VaultDialog] raw vault_access_requests query', raw);
      // expose diagnostic result to UI for owner troubleshooting
      setDiagResult({ data: raw.data ?? undefined, error: raw.error ?? undefined });

      if (initialRequestId) {
        setSelectedRequestId(initialRequestId);
        setTimeout(() => {
          const el = document.getElementById(`access_req_${initialRequestId}`);
          if (el && 'scrollIntoView' in el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    }
  }

  useEffect(() => {
    if (vault && open) {
      fetchAccessRequests().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[VaultDialog] fetchAccessRequests failed', err);
      });
    }

    // Subscribe to realtime inserts for access requests so owners see them immediately
    if (!vault || !open) return;
    const channel = supabase
      .channel(`vault-access-requests-${vault.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vault_access_requests',
          filter: `vault_id=eq.${vault.id}`,
        },
        (payload) => {
          // eslint-disable-next-line no-console
          console.debug('[VaultDialog] realtime access request received', payload);
          fetchAccessRequests().catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[VaultDialog] fetchAccessRequests failed after realtime event', err);
          });
          // show a small toast to the owner when viewing the dialog
          try {
            toast({ title: 'New access request received' });
          } catch (_) {
            /* noop */
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vault, open, initialRequestId]);

  const getVisibility = (v: Vault): VaultVisibility => {
    const vaultWithVisibility = v as any;
    return vaultWithVisibility.visibility || 'private';
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  };

  const fetchShares = useCallback(async (vaultId: string) => {
    const { data, error } = await supabase
      .from('vault_shares')
      .select('*')
      .eq('vault_id', vaultId);

    console.log('[VaultDialog] fetchShares raw result:', { data, error });
    
    if (data && !error) {
      // Enrich shares with profile data for those missing shared_with_name or shared_with_email
      const enrichedShares = await Promise.all(
        data.map(async (share) => {
          // If we already have both name and email, use them
          if (share.shared_with_name && share.shared_with_email) {
            return share;
          }
          
          let profile = null;
          
          // Try to look up profile by user_id first
          if (share.shared_with_user_id) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('display_name, username, email')
              .eq('user_id', share.shared_with_user_id)
              .single();
            profile = profileData;
          }
          
          // If no profile found by user_id, try by email
          if (!profile && share.shared_with_email) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('display_name, username, email')
              .eq('email', share.shared_with_email)
              .single();
            profile = profileData;
          }
          
          if (profile) {
            const enrichedName = share.shared_with_name || profile.display_name || profile.username || profile.email;
            const enrichedEmail = share.shared_with_email || profile.email;
            console.log('[VaultDialog] Enriched share:', { share_id: share.id, enrichedName, enrichedEmail });
            return {
              ...share,
              shared_with_name: enrichedName,
              shared_with_email: enrichedEmail,
            };
          }
          
          return share;
        })
      );
      
      console.log('[VaultDialog] Final enriched shares:', enrichedShares);
      setShares(enrichedShares as VaultShare[]);
    }
  }, []);

  useEffect(() => {
    isInitialLoadRef.current = true; // Reset on dialog open
    setHasUnsavedChanges(false); // Reset unsaved changes on dialog open
    if (vault) {
      const initialName = vault.name;
      const initialDescription = vault.description || '';
      const initialColor = vault.color;
      const initialCategory = vault.category || '';
      const initialAbstract = vault.abstract || '';
      const initialVisibility = getVisibility(vault);
      const initialPublicSlug = vault.public_slug || generateSlug(vault.name);
      
      setName(initialName);
      setDescription(initialDescription);
      setColor(initialColor);
      setCategory(initialCategory);
      setAbstract(initialAbstract);
      setVisibility(initialVisibility);
      setPublicSlug(initialPublicSlug);
      fetchShares(vault.id);
      
      // Store initial values for change detection
      initialValuesRef.current = {
        name: initialName,
        description: initialDescription,
        color: initialColor,
        category: initialCategory,
        abstract: initialAbstract,
        visibility: initialVisibility,
        publicSlug: initialPublicSlug,
      };
    } else {
      const randomColor = VAULT_COLORS[Math.floor(Math.random() * VAULT_COLORS.length)];
      setName('');
      setDescription('');
      setColor(randomColor);
      setCategory('');
      setAbstract('');
      setVisibility('private');
      setPublicSlug('');
      setShares([]);
      
      // Store initial values for new vault
      initialValuesRef.current = {
        name: '',
        description: '',
        color: randomColor,
        category: '',
        abstract: '',
        visibility: 'private',
        publicSlug: '',
      };
    }
  }, [vault?.id, open, fetchShares]);

  // Track unsaved changes
  useEffect(() => {
    // Skip on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    if (!initialValuesRef.current) return;
    
    const initial = initialValuesRef.current;
    const hasChanges = 
      name !== initial.name ||
      description !== initial.description ||
      color !== initial.color ||
      category !== initial.category ||
      abstract !== initial.abstract ||
      visibility !== initial.visibility ||
      publicSlug !== initial.publicSlug;
    
    setHasUnsavedChanges(hasChanges);
  }, [name, description, color, category, abstract, visibility, publicSlug]);

  // Check slug availability (debounced)
  useEffect(() => {
    if (!publicSlug || visibility !== 'public') {
      setSlugAvailable(null);
      setCheckingSlug(false);
      return;
    }

    // Clear previous timeout
    if (slugCheckTimeoutRef.current) {
      clearTimeout(slugCheckTimeoutRef.current);
    }

    setCheckingSlug(true);

    slugCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('vaults')
          .select('id')
          .eq('public_slug', publicSlug)
          .maybeSingle();

        if (error) throw error;

        // If we found a vault with this slug, check if it's the current vault
        if (data) {
          const isCurrentVault = vault?.id === data.id;
          setSlugAvailable(isCurrentVault);
        } else {
          setSlugAvailable(true);
        }
      } catch (error) {
        console.error('[VaultDialog] Error checking slug:', error);
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 500);

    return () => {
      if (slugCheckTimeoutRef.current) {
        clearTimeout(slugCheckTimeoutRef.current);
      }
    };
  }, [publicSlug, visibility, vault?.id]);

  // Handle dialog close with unsaved changes check
  const handleDialogClose = useCallback((newOpen: boolean) => {
    if (newOpen) {
      onOpenChange(true);
      return;
    }
    
    // Dialog wants to close - check for unsaved changes
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      onOpenChange(false);
    }
  }, [hasUnsavedChanges, onOpenChange]);

  // Handle discard changes
  const handleDiscardChanges = useCallback(() => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);
    onOpenChange(false);
  }, [onOpenChange]);

  // Handle save and close
  const handleSaveAndClose = useCallback(async () => {
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        color,
        category: category || null,
        abstract: abstract || null,
        visibility,
        public_slug: visibility === 'public' ? (publicSlug || generateSlug(name)) : null,
      });
      setHasUnsavedChanges(false);
      setShowUnsavedDialog(false);
      onOpenChange(false);
    } catch (error) {
      // Keep dialog open on error
    } finally {
      setSaving(false);
    }
  }, [name, description, color, category, abstract, visibility, publicSlug, onSave, onOpenChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        color,
        category: category || null,
        abstract: abstract || null,
        visibility,
        public_slug: visibility === 'public' ? (publicSlug || generateSlug(name)) : null,
      });
      setHasUnsavedChanges(false);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleShareWithUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault || !user || !email.trim()) return;

    // Prevent self-sharing
    if (user.email?.toLowerCase() === email.trim().toLowerCase()) {
      toast({
        title: 'Cannot share with yourself',
        description: 'You already own this vault',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Look up the user's profile by email to get their user_id and display name
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, email')
        .eq('email', email.trim().toLowerCase())
        .single();

      console.log('[VaultDialog] Profile lookup for email:', email.trim().toLowerCase(), { profile, profileError });

      const shareData: any = {
        vault_id: vault.id,
        shared_with_email: email.trim().toLowerCase(),
        shared_by: user.id,
        role: sharePermission,
      };

      // If we found a profile, add the user_id and display name
      if (profile) {
        shareData.shared_with_user_id = profile.user_id;
        shareData.shared_with_name = profile.display_name || profile.username || profile.email;
        console.log('[VaultDialog] Found profile, setting shared_with_name to:', shareData.shared_with_name);
      } else {
        console.log('[VaultDialog] No profile found for email, share will not have user_id or name');
      }

      console.log('[VaultDialog] Inserting share data:', shareData);
      const { error } = await supabase.from('vault_shares').insert(shareData);

      if (error) throw error;

      toast({ title: 'user_added ✨' });
      setEmail('');
      setSharePermission('viewer');
      if (vault) fetchShares(vault.id);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'error_sharing_vault',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    try {
      const { error } = await supabase
        .from('vault_shares')
        .delete()
        .eq('id', shareId);

      if (error) throw error;

      toast({ title: 'user_removed' });
      if (vault) fetchShares(vault.id);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'error_removing_user',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdatePermission = async (shareId: string, newPermission: 'viewer' | 'editor' | 'owner') => {
    try {
      const { error } = await supabase
        .from('vault_shares')
        .update({ role: newPermission })
        .eq('id', shareId);

      if (error) throw error;

      toast({ title: 'permission_updated' });
      if (vault) fetchShares(vault.id);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'error_updating_permission',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleApproveRequest = async (req: any, permission: 'viewer' | 'editor' = 'viewer') => {
    if (!vault || !user) return;
    try {
      const insertObj: any = { vault_id: vault.id, shared_by: user.id, role: permission };

      if (req.requester_id) {
        // requester_id is auth.users.id; we can use it directly
        insertObj.shared_with_user_id = req.requester_id;
        
        // Look up the profile to get the display name
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, username, email')
          .eq('user_id', req.requester_id)
          .single();
        
        if (profile) {
          insertObj.shared_with_name = profile.display_name || profile.username || profile.email;
          insertObj.shared_with_email = profile.email;
        }
      } else if (req.requester_email) {
        insertObj.shared_with_email = req.requester_email;
      }

      const { error: shareError } = await supabase.from('vault_shares').insert(insertObj);
      if (shareError) throw shareError;

      const { error: updateError } = await supabase.from('vault_access_requests').update({ status: 'approved' }).eq('id', req.id);
      if (updateError) throw updateError;

      toast({ title: 'Request approved' });
      fetchAccessRequests();
      if (vault) fetchShares(vault.id);
      onUpdate?.();
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const handleRejectRequest = async (req: any) => {
    if (!vault) return;
    try {
      const { error } = await supabase.from('vault_access_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (error) throw error;
      toast({ title: 'Request rejected' });
      fetchAccessRequests();
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const publicUrl = `${window.location.origin}/public/${publicSlug}`;

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'link_copied' });
  };

  const visibilityOptions = [
    { value: 'private' as const, label: 'private', icon: Lock, description: 'only_you_can_access' },
    { value: 'protected' as const, label: 'protected', icon: Users, description: 'shared_with_specific_people' },
    { value: 'public' as const, label: 'public', icon: Globe, description: 'listed_in_the_codex' },
  ];

  return (
    <>
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onDiscard={handleDiscardChanges}
        onCancel={() => setShowUnsavedDialog(false)}
        onSave={handleSaveAndClose}
        saving={saving}
        title="Unsaved Changes"
        description="You have unsaved changes to this vault. Would you like to save them before closing?"
      />
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="w-full h-full sm:h-auto sm:w-[95vw] sm:max-w-2xl border-2 bg-card/95 backdrop-blur-xl sm:max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-bold font-mono">
            {vault ? (
              <span>vault_<span className="text-gradient">settings</span></span>
            ) : (
              <span>create_<span className="text-gradient">vault</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 px-6 pb-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-semibold font-mono">name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_research_project"
              required
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className="font-semibold font-mono">category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="select_category" />
              </SelectTrigger>
              <SelectContent>
                {VAULT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="font-semibold font-mono">description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="brief_tagline_for_vault"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="abstract" className="font-semibold font-mono">abstract</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="describe_contents_and_purpose..."
              rows={3}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground font-mono">
              // shown_on_the_codex_when_published
            </p>
          </div>

          <div className="space-y-3">
            <Label className="font-semibold font-mono">color</Label>
            <div className="flex flex-wrap gap-3">
              {VAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg transition-all duration-200 shadow-md ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-white scale-110' : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 20px ${c}50` : undefined
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="font-semibold font-mono">visibility</Label>
            <div className="grid grid-cols-3 gap-2">
              {visibilityOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVisibility(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200",
                      visibility === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold font-mono">{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {visibilityOptions.find(o => o.value === visibility)?.description}
            </p>
          </div>

          {/* Public URL Section */}
          {visibility === 'public' && (
            <div className="space-y-3 p-4 rounded-xl border-2 border-neon/30 bg-neon/5">
              <Label className="text-xs font-mono text-muted-foreground">public_url_slug</Label>
              <div className="relative">
                <Input
                  value={publicSlug}
                  onChange={(e) => {
                    setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    setSlugAvailable(null); // Reset while typing
                  }}
                  placeholder="my-research-vault"
                  className={`font-mono text-sm pr-10 ${
                    slugAvailable === false ? 'border-destructive focus-visible:ring-destructive' : 
                    slugAvailable === true ? 'border-neon focus-visible:ring-neon' : ''
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingSlug ? (
                    <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  ) : slugAvailable === true ? (
                    <Check className="w-4 h-4 text-neon" />
                  ) : slugAvailable === false ? (
                    <X className="w-4 h-4 text-destructive" />
                  ) : null}
                </div>
              </div>
              {slugAvailable === false && (
                <p className="text-xs text-destructive font-mono">
                  // slug_already_taken - please choose another
                </p>
              )}
              {slugAvailable === true && publicSlug && (
                <p className="text-xs text-neon font-mono">
                  // slug_available ✨
                </p>
              )}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border">
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <code className="text-xs text-muted-foreground truncate flex-1">
                  {publicUrl}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={copyPublicUrl}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-neon" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Protected Sharing Section */}
          {visibility === 'protected' && vault && (
            <div className="space-y-4 p-4 rounded-xl border-2 border-blue-400/30 bg-blue-400/5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <Label className="font-semibold font-mono">share_with_users</Label>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="pl-10 font-mono text-sm"
                    />
                  </div>
                  <Select value={sharePermission} onValueChange={(value: 'viewer' | 'editor') => setSharePermission(value)}>
                    <SelectTrigger className="w-[130px] font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer" className="font-mono text-sm">
                        👁️ viewer
                      </SelectItem>
                      <SelectItem value="editor" className="font-mono text-sm">
                        ✏️ editor
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleShareWithUser}
                    disabled={saving || !email.trim()}
                    className="font-mono"
                  >
                    add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  // {sharePermission === 'viewer' ? 'can_view_publications' : 'can_view_and_edit_publications'}
                </p>
              </div>

              {shares.length > 0 && (
                <div className="space-y-2">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-gradient-primary flex items-center justify-center text-sm font-bold text-white shrink-0">
                          {(share.shared_with_name || share.shared_with_email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-mono font-medium truncate">
                            {share.shared_with_name || 'Unknown User'}
                          </span>
                          {share.shared_with_email && (
                            <span className="text-xs text-muted-foreground font-mono truncate">
                              {share.shared_with_email}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground/60 font-mono">
                            added {new Date(share.created_at).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={(share as any).role || (share as any).permission || 'viewer'}
                          onValueChange={(value) => handleUpdatePermission(share.id, value as 'viewer' | 'editor')}
                        >
                          <SelectTrigger className="w-[110px] h-7 font-mono text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer" className="font-mono text-xs">
                              👁️ viewer
                            </SelectItem>
                            <SelectItem value="editor" className="font-mono text-xs">
                              ✏️ editor
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveShare(share.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}



                </div>
              )}

              {/* Access requests block for owners (moved inside protected sharing section) */}
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold font-mono">access_requests</Label>
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => fetchAccessRequests()} className="font-mono mr-2">refresh</Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {accessRequests.length === 0 ? (
                    <div className="text-sm text-muted-foreground">no_requests</div>
                  ) : (
                    accessRequests.map((r) => (
                      <div
                        id={`access_req_${r.id}`}
                        key={r.id}
                        className={`flex items-center justify-between gap-4 p-2 rounded-lg border ${selectedRequestId === r.id ? 'ring-2 ring-primary ring-offset-2' : 'bg-background/50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                            <Mail className="w-4 h-4" />
                          </div>
                          <div className="text-sm">
                            <div className="font-semibold">{r.display_name}</div>
                            <div className="text-xs text-muted-foreground">{r.requester_email || r.requester_profile?.email || r.requester_profile?.username || ''}</div>
                            <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                            {r.note && <div className="text-xs mt-1">{r.note}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={requestPermissions[r.id] || 'viewer'}
                            onValueChange={(val) => setRequestPermissions((prev) => ({ ...prev, [r.id]: val as 'viewer' | 'editor' }))}
                          >
                            <SelectTrigger className="w-[110px] h-7 font-mono text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer" className="font-mono text-xs">👁️ read (viewer)</SelectItem>
                              <SelectItem value="editor" className="font-mono text-xs">✏️ write (editor)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" onClick={() => handleApproveRequest(r, requestPermissions[r.id] || 'viewer')}><Check /></Button>
                          <Button size="sm" variant="destructive" onClick={() => handleRejectRequest(r)}><Trash2 /></Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {shares.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-2 font-mono">
                  // no users have access yet
                </p>
              )}
            </div>


          )}

          {visibility === 'protected' && !vault && (
            <p className="text-xs text-muted-foreground text-center p-3 rounded-lg bg-muted/30">
              Save the vault first, then add users to share with.
            </p>
          )}

          <div className="flex flex-col sm:flex-row justify-between gap-3 pt-6 mt-6 border-t-2 border-border">
            {vault && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDelete(vault)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto font-mono"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                delete_vault
              </Button>
            ) : (
              <div className="hidden sm:block" />
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} className="w-full sm:w-auto font-mono">
                cancel
              </Button>
              <Button type="submit" variant="glow" disabled={saving || !name.trim()} className="w-full sm:w-auto font-mono">
                {saving ? 'saving...' : vault ? 'save_changes' : 'create_vault'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}