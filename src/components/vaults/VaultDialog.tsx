import { useState, useEffect } from 'react';
import { Vault, VAULT_CATEGORIES } from '@/types/database';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Users, Globe } from 'lucide-react';
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
}

export function VaultDialog({ open, onOpenChange, vault, onSave }: VaultDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(VAULT_COLORS[0]);
  const [category, setCategory] = useState<string>('');
  const [abstract, setAbstract] = useState('');
  const [visibility, setVisibility] = useState<VaultVisibility>('private');
  const [saving, setSaving] = useState(false);

  const getVisibility = (v: Vault): VaultVisibility => {
    if (v.is_public) return 'public';
    if (v.is_shared) return 'protected';
    return 'private';
  };

  useEffect(() => {
    if (vault) {
      setName(vault.name);
      setDescription(vault.description || '');
      setColor(vault.color);
      setCategory(vault.category || '');
      setAbstract(vault.abstract || '');
      setVisibility(getVisibility(vault));
    } else {
      setName('');
      setDescription('');
      setColor(VAULT_COLORS[Math.floor(Math.random() * VAULT_COLORS.length)]);
      setCategory('');
      setAbstract('');
      setVisibility('private');
    }
  }, [vault, open]);

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
        public_slug: visibility === 'public' ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const visibilityOptions = [
    { value: 'private' as const, label: 'Private', icon: Lock, description: 'Only you can access' },
    { value: 'protected' as const, label: 'Protected', icon: Users, description: 'Shared with specific people' },
    { value: 'public' as const, label: 'Public', icon: Globe, description: 'Listed in The Codex' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 bg-card/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {vault ? (
              <span>Edit <span className="text-gradient">Vault</span></span>
            ) : (
              <span>Create <span className="text-gradient">Vault</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
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
              {visibility === 'protected' && vault && ' — Configure sharing via the Share button after saving.'}
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
                  className={`w-10 h-10 rounded-xl transition-all duration-200 shadow-lg ${
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

          <div className="flex justify-end gap-3 pt-4 border-t-2 border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="glow" disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : vault ? 'Update Vault' : 'Create Vault'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
