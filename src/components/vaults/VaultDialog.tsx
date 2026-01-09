import { useState, useEffect } from 'react';
import { Vault, VaultShare, VAULT_CATEGORIES } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
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
import { Lock, Users, Globe, Mail, Trash2, Copy, Check, Link2 } from 'lucide-react';
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
  onSave: (data: Partial<Vault>) => Promise<void>;
  onUpdate?: () => void;
}

export function VaultDialog({ open, onOpenChange, vault, onSave, onUpdate }: VaultDialogProps) {
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
  const [email, setEmail] = useState('');
  const [publicSlug, setPublicSlug] = useState('');
  const [copied, setCopied] = useState(false);

  const getVisibility = (v: Vault): VaultVisibility => {
    if (v.is_public) return 'public';
    if (v.is_shared) return 'protected';
    return 'private';
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  };

  useEffect(() => {
    if (vault) {
      setName(vault.name);
      setDescription(vault.description || '');
      setColor(vault.color);
      setCategory(vault.category || '');
      setAbstract(vault.abstract || '');
      setVisibility(getVisibility(vault));
      setPublicSlug(vault.public_slug || generateSlug(vault.name));
      fetchShares();
    } else {
      setName('');
      setDescription('');
      setColor(VAULT_COLORS[Math.floor(Math.random() * VAULT_COLORS.length)]);
      setCategory('');
      setAbstract('');
      setVisibility('private');
      setPublicSlug('');
      setShares([]);
    }
  }, [vault, open]);

  const fetchShares = async () => {
    if (!vault) return;
    
    const { data, error } = await supabase
      .from('vault_shares')
      .select('*')
      .eq('vault_id', vault.id);

    if (data && !error) {
      setShares(data as VaultShare[]);
    }
  };

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
        is_public: visibility === 'public',
        is_shared: visibility === 'protected',
        public_slug: visibility === 'public' ? (publicSlug || generateSlug(name)) : null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleShareWithUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault || !user || !email.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('vault_shares').insert({
        vault_id: vault.id,
        shared_with_email: email.trim().toLowerCase(),
        shared_by: user.id,
        permission: 'read',
      });

      if (error) throw error;

      toast({ title: 'User added ✨' });
      setEmail('');
      fetchShares();
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: 'Error sharing vault',
        description: error.message,
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

      toast({ title: 'User removed' });
      fetchShares();
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: 'Error removing user',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const publicUrl = `${window.location.origin}/public/${publicSlug}`;

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied to clipboard' });
  };

  const visibilityOptions = [
    { value: 'private' as const, label: 'Private', icon: Lock, description: 'Only you can access' },
    { value: 'protected' as const, label: 'Protected', icon: Users, description: 'Shared with specific people' },
    { value: 'public' as const, label: 'Public', icon: Globe, description: 'Listed in The Codex' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg border-2 bg-card/95 backdrop-blur-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {vault ? (
              <span>Vault <span className="text-gradient">Settings</span></span>
            ) : (
              <span>Create <span className="text-gradient">Vault</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 pt-4 px-1">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-semibold">Name *</Label>
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
            <Label htmlFor="category" className="font-semibold">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
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
            <Label htmlFor="description" className="font-semibold">Short Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief tagline for your vault"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="abstract" className="font-semibold">Abstract</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Describe the contents and purpose of this collection..."
              rows={3}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Shown on The Codex marketplace when published
            </p>
          </div>

          <div className="space-y-3">
            <Label className="font-semibold">Color</Label>
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
            <Label className="font-semibold">Visibility</Label>
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
                    <span className="text-xs font-semibold">{option.label}</span>
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
              <Label className="text-xs font-mono text-muted-foreground">Public URL Slug</Label>
              <Input
                value={publicSlug}
                onChange={(e) => setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-research-vault"
                className="font-mono text-sm"
              />
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
                <Label className="font-semibold">Share with Users</Label>
              </div>

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
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleShareWithUser}
                  disabled={saving || !email.trim()}
                >
                  Add
                </Button>
              </div>

              {shares.length > 0 && (
                <div className="space-y-2">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-primary flex items-center justify-center text-xs font-bold text-white">
                          {share.shared_with_email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-mono">{share.shared_with_email}</span>
                        <Badge variant="outline" className="text-xs">
                          {share.permission}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveShare(share.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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

          {visibility === 'protected' && !vault && (
            <p className="text-xs text-muted-foreground text-center p-3 rounded-lg bg-muted/30">
              Save the vault first, then add users to share with.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 pb-2 border-t-2 border-border sticky bottom-0 bg-card">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="glow" disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : vault ? 'Save Changes' : 'Create Vault'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}