import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';
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
import { KbdHint } from '@/components/ui/KbdHint';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import { useHotkeys } from '@/hooks/useKeyboardNavigation';
import { Lock, Users, Globe, Mail, Trash2, Copy, Check, Link2, X, Save, Plus, Bell, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createVaultPublicSlugCandidate, normalizeVaultPublicSlug } from '@/lib/vaultSlug';

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

interface AccessRequest {
  id: string;
  vault_id: string;
  requester_id: string | null;
  requester_email: string | null;
  requester_name: string | null;
  requested_role?: 'viewer' | 'editor' | null;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  created_at: string;
  display_name: string;
  requester_profile: null;
}

interface UserSuggestion {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
}

const sanitizeProfileSearch = (value: string) =>
  value
    .trim()
    .replace(/[%_,()]/g, '')
    .replace(/\s+/g, ' ');

interface VaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault?: Vault | null;
  initialRequestId?: string;
  onSave?: (data: Partial<Vault>) => Promise<Vault | void>;
  onUpdate?: () => void;
  onDelete?: (vault: Vault) => void;
}

export function VaultDialog({ open, onOpenChange, vault, initialRequestId, onSave, onUpdate, onDelete }: VaultDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const kbCtx = useKeyboardContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(VAULT_COLORS[0]);
  const [category, setCategory] = useState<string>('');
  const [abstract, setAbstract] = useState('');
  const [visibility, setVisibility] = useState<VaultVisibility>('private');
  const [saving, setSaving] = useState(false);

  // Sharing state
  const [shares, setShares] = useState<VaultShare[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [requestPermissions, setRequestPermissions] = useState<Record<string, 'viewer' | 'editor'>>({});
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserSuggestion | null>(null);
  const [shareUserError, setShareUserError] = useState('');
  const [sharePermission, setSharePermission] = useState<'viewer' | 'editor'>('viewer');
  const [publicSlug, setPublicSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isForkedVault, setIsForkedVault] = useState(false);
  const slugCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const accessRequestsSectionRef = useRef<HTMLDivElement | null>(null);
  const initialValuesRef = useRef<{ name: string; description: string; color: string; category: string; abstract: string; visibility: VaultVisibility; publicSlug: string } | null>(null);

  const syncSavedValues = useCallback(() => {
    initialValuesRef.current = {
      name,
      description,
      color,
      category,
      abstract,
      visibility: isForkedVault ? 'public' : visibility,
      publicSlug: (isForkedVault || visibility === 'public') ? (publicSlug || createVaultPublicSlugCandidate(name)) : '',
    };
    setHasUnsavedChanges(false);
  }, [name, description, color, category, abstract, visibility, publicSlug, isForkedVault]);

  useEffect(() => {
    if (open) {
      kbCtx.saveFocus();
      kbCtx.pushContext('dialog');
    } else {
      kbCtx.popContext();
      kbCtx.restoreFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch access requests for owners and enrich with display names when possible
  async function fetchAccessRequests() {
    if (!vault) return;

    // Get the access requests
    const { data: requests, error: requestsError } = await supabase
      .from('vault_access_requests')
      .select('*')
      .eq('vault_id', vault.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (requestsError) {
      logger.error('VaultDialog', 'Error fetching vault_access_requests:', requestsError);
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

      // Initialize per-request permission selections from the requested role when present.
      const perms: Record<string, 'viewer' | 'editor'> = {};
      processed.forEach((r) => { perms[r.id] = r.requested_role === 'editor' ? 'editor' : 'viewer'; });
      setRequestPermissions(perms);

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
        logger.error('VaultDialog', 'fetchAccessRequests failed:', err);
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
        (_payload) => {
          fetchAccessRequests().catch((err) => {
            logger.error('VaultDialog', 'fetchAccessRequests failed after realtime event:', err);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, open, initialRequestId]);

  const getVisibility = (v: Vault): VaultVisibility => {
    return v.visibility || 'private';
  };

  const ensureUniquePublicSlug = useCallback(async (desiredSlug: string) => {
    const baseSlug = normalizeVaultPublicSlug(desiredSlug) || createVaultPublicSlugCandidate(name);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
      const candidate = `${baseSlug.slice(0, 50 - suffix.length)}${suffix}`;

      const { data, error } = await supabase
        .from('vaults')
        .select('id')
        .eq('public_slug', candidate)
        .maybeSingle();

      if (error) throw error;
      if (!data || data.id === vault?.id) return candidate;
    }

    return `${baseSlug.slice(0, 41)}-${Date.now().toString(36)}`;
  }, [name, vault?.id]);

  const buildSavePayload = useCallback(async (): Promise<Partial<Vault>> => {
    const shouldHavePublicSlug = isForkedVault || visibility === 'public';
    const resolvedPublicSlug = shouldHavePublicSlug
      ? await ensureUniquePublicSlug(publicSlug || name)
      : null;

    if (shouldHavePublicSlug && resolvedPublicSlug !== publicSlug) {
      setPublicSlug(resolvedPublicSlug);
    }

    return {
      name,
      description: description || null,
      color,
      category: category || null,
      abstract: abstract || null,
      visibility: isForkedVault ? 'public' : visibility,
      public_slug: resolvedPublicSlug,
    };
  }, [abstract, category, color, description, ensureUniquePublicSlug, isForkedVault, name, publicSlug, visibility]);

  const fetchShares = useCallback(async (vaultId: string) => {
    const { data, error } = await supabase
      .from('vault_shares')
      .select('*')
      .eq('vault_id', vaultId);

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
            return {
              ...share,
              shared_with_name: share.shared_with_name || profile.display_name || profile.username || profile.email,
              shared_with_email: share.shared_with_email || profile.email,
            };
          }

          return share;
        })
      );

      setShares(enrichedShares as VaultShare[]);
    }
  }, []);

  const handleSelectUserSuggestion = useCallback((profile: UserSuggestion) => {
    setSelectedProfile(profile);
    setEmail(profile.email || '');
    setShareUserError('');
    setSuggestionsOpen(false);
  }, []);

  const handleShareEmailChange = useCallback((value: string) => {
    setEmail(value);
    setSelectedProfile(null);
    setShareUserError('');
  }, []);

  useEffect(() => {
    if (!open || (visibility !== 'protected' && visibility !== 'public') || !vault || email.trim().length < 2) {
      setUserSuggestions([]);
      setLoadingSuggestions(false);
      setSuggestionsOpen(false);
      return;
    }

    let cancelled = false;
    const search = sanitizeProfileSearch(email);

    if (search.length < 2) {
      setUserSuggestions([]);
      setLoadingSuggestions(false);
      setSuggestionsOpen(false);
      return;
    }

    setLoadingSuggestions(true);
    setSuggestionsOpen(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const existingUserIds = shares
          .map((share) => share.shared_with_user_id)
          .filter(Boolean);
        const existingEmails = shares
          .map((share) => share.shared_with_email?.toLowerCase())
          .filter(Boolean);

        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, display_name, username, email')
          .or(`email.ilike.%${search}%,display_name.ilike.%${search}%,username.ilike.%${search}%`)
          .order('display_name', { ascending: true })
          .order('username', { ascending: true })
          .order('email', { ascending: true })
          .limit(8);

        if (error) throw error;
        if (cancelled) return;

        const filtered = (data || []).filter((profile) => {
          const profileEmail = profile.email?.toLowerCase();
          return profile.user_id !== user?.id &&
            !existingUserIds.includes(profile.user_id) &&
            (!profileEmail || !existingEmails.includes(profileEmail));
        });

        setUserSuggestions(filtered as UserSuggestion[]);
      } catch (error) {
        logger.error('VaultDialog', 'Error fetching user suggestions:', error);
        if (!cancelled) {
          setUserSuggestions([]);
        }
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [email, open, shares, user?.id, vault, visibility]);

  useEffect(() => {
    if (!open) {
      setUserSuggestions([]);
      setSuggestionsOpen(false);
      setSelectedProfile(null);
    }
  }, [open]);

  useEffect(() => {
    if (selectedProfile && email !== (selectedProfile.email || '')) {
      setSelectedProfile(null);
    }
  }, [email, selectedProfile]);

  useEffect(() => {
    isInitialLoadRef.current = true; // Reset on dialog open
    setHasUnsavedChanges(false); // Reset unsaved changes on dialog open
    setIsForkedVault(false);
    if (vault) {
      const initialName = vault.name;
      const initialDescription = vault.description || '';
      const initialColor = vault.color;
      const initialCategory = vault.category || '';
      const initialAbstract = vault.abstract || '';
      const initialVisibility = getVisibility(vault);
      const initialPublicSlug = vault.public_slug || createVaultPublicSlugCandidate(vault.name);
      
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault?.id, open, fetchShares]);

  useEffect(() => {
    if (!vault || !open) {
      setIsForkedVault(false);
      return;
    }

    let cancelled = false;

    supabase
      .from('vault_forks')
      .select('id')
      .eq('forked_vault_id', vault.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setIsForkedVault(Boolean(data));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [vault, open]);

  useEffect(() => {
    if (isForkedVault && visibility !== 'public') {
      setVisibility('public');
    }
  }, [isForkedVault, visibility]);

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
        logger.error('VaultDialog', 'Error checking slug:', error);
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
    if (!name.trim() || !onSave) return;
    
    setSaving(true);
    try {
      await onSave(await buildSavePayload());
      syncSavedValues();
      setShowUnsavedDialog(false);
      onOpenChange(false);
    } catch (error) {
      // Keep dialog open on error
    } finally {
      setSaving(false);
    }
  }, [buildSavePayload, name, onSave, onOpenChange, syncSavedValues]);

  const handleSubmit = useCallback(async () => {
    if (!open || saving || !name.trim() || !onSave) return;

    setSaving(true);
    try {
      await onSave(await buildSavePayload());
      syncSavedValues();

      if (!vault) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }, [buildSavePayload, open, saving, name, onSave, syncSavedValues, vault, onOpenChange]);

  useHotkeys(
    'dialog',
    [
      {
        combo: 'Ctrl+s',
        description: 'Save changes',
        handler: (e) => {
          if (!open || !vault || saving || !name.trim()) return false;
          e.preventDefault();
          void handleSubmit();
          return true;
        },
        allowInInput: true,
      },
    ],
    [open, vault, saving, name, handleSubmit],
  );

  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    void handleSubmit();
  }, [handleSubmit]);

  const handleShareWithUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault || !user || !email.trim()) return;

    // Prevent self-sharing
    if (user.email?.toLowerCase() === email.trim().toLowerCase()) {
      toast({
        title: 'Cannot share with yourself',
        description: 'You already own this vault',
        variant: 'destructive', feedbackSeverity: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      // Use the selected autocomplete profile when available; otherwise require an exact
      // platform-user match by email or username before inserting a share.
      let profile = selectedProfile;
      const query = email.trim().toLowerCase();
      if (!profile) {
        const { data: emailMatch, error: emailLookupError } = await supabase
          .from('profiles')
          .select('user_id, display_name, username, email')
          .eq('email', query)
          .maybeSingle();

        if (emailLookupError) throw emailLookupError;

        if (emailMatch) {
          profile = emailMatch as UserSuggestion;
        } else {
          const { data: usernameMatch, error: usernameLookupError } = await supabase
            .from('profiles')
            .select('user_id, display_name, username, email')
            .eq('username', query)
            .maybeSingle();

          if (usernameLookupError) throw usernameLookupError;
          profile = usernameMatch as UserSuggestion | null;
        }
      }

      if (!profile?.user_id) {
        setShareUserError('// error no user found');
        return;
      }

      const shareData: {
        vault_id: string;
        shared_with_email: string;
        shared_by: string;
        role: 'viewer' | 'editor';
        shared_with_user_id: string;
        shared_with_name?: string | null;
      } = {
        vault_id: vault.id,
        shared_with_email: (profile.email || query).toLowerCase(),
        shared_by: user.id,
        role: sharePermission,
        shared_with_user_id: profile.user_id,
        shared_with_name: profile.display_name || profile.username || profile.email,
      };

      const { error } = await supabase.from('vault_shares').insert(shareData);

      if (error) throw error;

      toast({ title: 'user_added ✨' });
      setEmail('');
      setSelectedProfile(null);
      setShareUserError('');
      setUserSuggestions([]);
      setSuggestionsOpen(false);
      setSharePermission('viewer');
      if (vault) fetchShares(vault.id);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'error_sharing_vault',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
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
        variant: 'destructive', feedbackSeverity: 'error',
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
        variant: 'destructive', feedbackSeverity: 'error',
      });
    }
  };

  const handleApproveRequest = async (req: AccessRequest, permission: 'viewer' | 'editor' = 'viewer') => {
    if (!vault || !user) return;
    try {
      const insertObj: {
        vault_id: string;
        shared_by: string;
        role: 'viewer' | 'editor';
        shared_with_user_id?: string;
        shared_with_name?: string | null;
        shared_with_email?: string;
      } = { vault_id: vault.id, shared_by: user.id, role: permission };

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
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
    }
  };

  const handleRejectRequest = async (req: AccessRequest) => {
    if (!vault) return;
    try {
      const { error } = await supabase.from('vault_access_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (error) throw error;
      toast({ title: 'Request rejected' });
      fetchAccessRequests();
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
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
        <DialogContent className="dialog-mobile max-w-[100vw] sm:rounded-2xl sm:h-auto sm:w-[95vw] sm:max-w-2xl border-2 bg-card/95 backdrop-blur-xl sm:max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
              {vault ? (
                <span>// vault_<span className="text-gradient">settings</span></span>
              ) : (
                <span>// create_<span className="text-gradient">vault</span></span>
              )}
            </DialogTitle>
            {accessRequests.length > 0 && (
              <button
                type="button"
                onClick={() => accessRequestsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-400 text-xs font-mono hover:bg-purple-500/25 transition-colors shrink-0"
              >
                <Bell className="w-3 h-3" />
                {accessRequests.length} pending
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto space-y-5 px-6 pb-6">
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
              className="font-mono text-sm"
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
                const isDisabled = isForkedVault && option.value !== 'public';
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => !isDisabled && setVisibility(option.value)}
                    disabled={isDisabled}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200",
                      visibility === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
                      isDisabled && "cursor-not-allowed opacity-40 hover:border-border hover:text-muted-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold font-mono">{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {isForkedVault
                ? 'forked_vaults_are_always_public'
                : visibilityOptions.find(o => o.value === visibility)?.description}
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
                    setPublicSlug(normalizeVaultPublicSlug(e.target.value));
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

          {/* Sharing Section — protected and public vaults */}
          {(visibility === 'protected' || visibility === 'public') && vault && (
            <div className="space-y-4 p-4 rounded-xl border-2 border-blue-400/30 bg-blue-400/5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <Label className="font-semibold font-mono">share_with_users</Label>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      value={email}
                      onChange={(e) => handleShareEmailChange(e.target.value)}
                      onFocus={() => {
                        if (email.trim().length >= 2) setSuggestionsOpen(true);
                      }}
                      onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                      placeholder="name, username, or email"
                      className="pl-10 font-mono text-sm"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    {suggestionsOpen && (loadingSuggestions || userSuggestions.length > 0) && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                        {loadingSuggestions ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground font-mono">loading_users…</div>
                        ) : (
                          <div className="space-y-1">
                            <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground font-mono">matching_users</div>
                            {userSuggestions.map((profile) => (
                              <button
                                key={profile.user_id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleSelectUserSuggestion(profile)}
                                className="flex w-full flex-col rounded-sm px-2 py-2 text-left font-mono text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                              >
                                <span className="truncate">
                                  {profile.display_name || profile.username || profile.email}
                                </span>
                                {profile.email && (
                                  <span className="text-xs text-muted-foreground truncate">
                                    {profile.email}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
                    disabled={saving || !email.trim() || loadingSuggestions}
                    className="font-mono"
                  >
                    add
                  </Button>
                </div>
                {shareUserError ? (
                  <p className="text-xs text-destructive font-mono">{shareUserError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground font-mono">
                    // choose an existing RefHub user; {sharePermission === 'viewer' ? 'can_view_publications' : 'can_view_and_edit_publications'}
                  </p>
                )}
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
                          value={share.role || 'viewer'}
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

              {shares.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-2 font-mono">
                  // no users have access yet
                </p>
              )}
            </div>
          )}

          {/* Access requests — visible for both protected and public vaults */}
          {(visibility === 'protected' || visibility === 'public') && vault && (
            <div ref={accessRequestsSectionRef} className="space-y-2 p-4 rounded-xl border-2 border-purple-400/30 bg-purple-400/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-purple-400" />
                  <Label className="font-semibold font-mono text-purple-300">access_requests</Label>
                  {accessRequests.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-mono">{accessRequests.length}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => fetchAccessRequests()} className="font-mono text-purple-400 hover:text-purple-300">refresh</Button>
              </div>

              <div className="flex flex-col gap-2">
                {accessRequests.length === 0 ? (
                  <div className="text-sm text-muted-foreground font-mono">no_requests</div>
                ) : (
                  accessRequests.map((r) => (
                    <div
                      id={`access_req_${r.id}`}
                      key={r.id}
                      className={`flex items-center justify-between gap-4 p-2 rounded-lg border ${selectedRequestId === r.id ? 'border-purple-400/50 bg-purple-500/10' : 'bg-background/50 border-border'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div className="text-sm">
                          <div className="font-semibold">{r.display_name}</div>
                          <div className="text-xs text-muted-foreground">{r.requester_email || r.requester_profile?.email || r.requester_profile?.username || ''}</div>
                          <div className="text-xs text-muted-foreground font-mono">requested: {r.requested_role === 'editor' ? 'write (editor)' : 'read (viewer)'}</div>
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
          )}

          {(visibility === 'protected' || visibility === 'public') && !vault && (
            <p className="text-xs text-muted-foreground text-center p-3 rounded-lg bg-muted/30">
              Save the vault first, then add users to share with.
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-border w-full box-border">
            {vault && onDelete && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDelete(vault)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10"
              >
                <Trash2 className="w-3 h-3 mr-1.5" />
                delete_vault
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10">
              <X className="w-3 h-3 mr-1.5" />
              cancel
            </Button>
            <Button
              type="submit"
              variant="glow"
              disabled={saving || !name.trim() || !onSave}
              className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10"
            >
              {saving ? (
                'saving...'
              ) : vault ? (
                <><Save className="w-3 h-3 mr-1.5" />save_changes</>
              ) : (
                <><Plus className="w-3 h-3 mr-1.5" />create_vault</>
              )}
              {vault && (
                <KbdHint shortcut="Ctrl+S" className="ml-1.5 hidden sm:inline-flex [&_kbd]:bg-white/20 [&_kbd]:border-white/30 [&_kbd]:text-primary-foreground [&_kbd]:shadow-none" size="sm" />
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
