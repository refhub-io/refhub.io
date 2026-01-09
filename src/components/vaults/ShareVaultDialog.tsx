import { useState, useEffect } from 'react';
import { Vault, VaultShare } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { 
  Users, 
  Globe, 
  Mail, 
  Trash2, 
  Copy, 
  Check,
  Link2,
  Lock,
  AtSign
} from 'lucide-react';

interface ShareUser {
  id: string;
  shared_with_email: string | null;
  shared_with_user_id: string | null;
  permission: string | null;
  display_name?: string | null;
  username?: string | null;
}

interface ShareVaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault: Vault | null;
  onUpdate: () => void;
}

export function ShareVaultDialog({ open, onOpenChange, vault, onUpdate }: ShareVaultDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shares, setShares] = useState<ShareUser[]>([]);
  const [shareInput, setShareInput] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [publicSlug, setPublicSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (vault && open) {
      setIsPublic(vault.is_public || false);
      setPublicSlug(vault.public_slug || generateSlug(vault.name));
      fetchShares();
    }
  }, [vault, open]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  };

  const fetchShares = async () => {
    if (!vault) return;
    
    const { data, error } = await supabase
      .from('vault_shares')
      .select('id, shared_with_email, shared_with_user_id, permission')
      .eq('vault_id', vault.id);

    if (data && !error) {
      // Fetch profile info for user_id shares
      const sharesWithProfiles: ShareUser[] = await Promise.all(
        data.map(async (share) => {
          if (share.shared_with_user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, username')
              .eq('user_id', share.shared_with_user_id)
              .single();
            return { ...share, ...profile };
          }
          return share;
        })
      );
      setShares(sharesWithProfiles);
    }
  };

  const handleShareWithUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault || !user || !shareInput.trim()) return;

    setLoading(true);
    try {
      const input = shareInput.trim();
      const isUsername = input.startsWith('@');
      
      let shareData: any = {
        vault_id: vault.id,
        shared_by: user.id,
        permission: 'read',
      };

      if (isUsername) {
        // Look up user by username
        const username = input.slice(1).toLowerCase();
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('username', username)
          .single();

        if (profileError || !profile) {
          throw new Error(`User @${username} not found`);
        }

        if (profile.user_id === user.id) {
          throw new Error("You can't share with yourself");
        }

        shareData.shared_with_user_id = profile.user_id;
      } else {
        // Treat as email
        shareData.shared_with_email = input.toLowerCase();
      }

      const { error } = await supabase.from('vault_shares').insert(shareData);

      if (error) throw error;

      toast({ title: 'Vault shared successfully ✨' });
      setShareInput('');
      fetchShares();
      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Error sharing vault',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    try {
      const { error } = await supabase
        .from('vault_shares')
        .delete()
        .eq('id', shareId);

      if (error) throw error;

      toast({ title: 'Share removed' });
      fetchShares();
      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Error removing share',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleTogglePublic = async (checked: boolean) => {
    if (!vault) return;

    setLoading(true);
    try {
      const updateData: any = { is_public: checked };
      if (checked && publicSlug) {
        updateData.public_slug = publicSlug;
      }

      const { error } = await supabase
        .from('vaults')
        .update(updateData)
        .eq('id', vault.id);

      if (error) throw error;

      setIsPublic(checked);
      toast({ 
        title: checked ? 'Vault is now public 🌐' : 'Vault is now private 🔒'
      });
      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Error updating vault',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSlug = async () => {
    if (!vault || !publicSlug.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('vaults')
        .update({ public_slug: publicSlug.trim() })
        .eq('id', vault.id);

      if (error) throw error;

      toast({ title: 'Public URL updated' });
      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Error updating URL',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const publicUrl = `${window.location.origin}/public/${publicSlug}`;

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied to clipboard' });
  };

  if (!vault) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-2 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div 
              className="w-4 h-4 rounded-md" 
              style={{ backgroundColor: vault.color }}
            />
            Share <span className="text-gradient">{vault.name}</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            // share with specific users or make it public
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Public Toggle Section */}
          <div className="p-4 rounded-xl border-2 border-border bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="w-5 h-5 text-neon" />
                ) : (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-semibold">Public Access</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {isPublic ? '// anyone with the link can view' : '// only shared users can access'}
                  </p>
                </div>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={handleTogglePublic}
                disabled={loading}
              />
            </div>

            {isPublic && (
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="text-xs font-mono text-muted-foreground">Public URL Slug</Label>
                <div className="flex gap-2">
                  <Input
                    value={publicSlug}
                    onChange={(e) => setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="my-research-vault"
                    className="font-mono text-sm flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleUpdateSlug}
                    disabled={loading}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border">
                  <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <code className="text-xs text-muted-foreground truncate flex-1">
                    {publicUrl}
                  </code>
                  <Button
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
          </div>

          {/* Share with Users Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <Label className="font-semibold">Share with Users</Label>
            </div>

            <form onSubmit={handleShareWithUser} className="flex gap-2">
              <div className="relative flex-1">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={shareInput}
                  onChange={(e) => setShareInput(e.target.value)}
                  placeholder="@username or email"
                  className="pl-10 font-mono text-sm"
                />
              </div>
              <Button type="submit" variant="glow" disabled={loading || !shareInput.trim()}>
                Share
              </Button>
            </form>

            {/* Shared Users List */}
            {shares.length > 0 && (
              <div className="space-y-2">
                {shares.map((share) => {
                  const displayName = share.username 
                    ? `@${share.username}` 
                    : share.shared_with_email || 'Unknown';
                  const name = share.display_name || share.shared_with_email?.split('@')[0] || 'User';
                  
                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <ProfileAvatar name={name} size={32} />
                        <div>
                          <p className="text-sm font-medium">{share.display_name || displayName}</p>
                          {share.username && (
                            <p className="text-xs text-muted-foreground font-mono">@{share.username}</p>
                          )}
                          {!share.username && share.shared_with_email && (
                            <p className="text-xs text-muted-foreground">{share.shared_with_email}</p>
                          )}
                          <Badge variant="outline" className="text-xs mt-1">
                            {share.permission}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveShare(share.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {shares.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4 font-mono">
                // no users have access yet
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
