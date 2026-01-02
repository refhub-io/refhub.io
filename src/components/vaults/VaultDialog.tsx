import { useState, useEffect } from 'react';
import { Vault } from '@/types/database';
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vault) {
      setName(vault.name);
      setDescription(vault.description || '');
      setColor(vault.color);
    } else {
      setName('');
      setDescription('');
      setColor(VAULT_COLORS[Math.floor(Math.random() * VAULT_COLORS.length)]);
    }
  }, [vault, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, description, color });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {vault ? (
              <span>Edit <span className="text-gradient">Vault</span></span>
            ) : (
              <span>Create <span className="text-gradient">Vault</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
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
            <Label htmlFor="description" className="font-semibold">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="// what is this vault for?"
              rows={3}
              className="font-mono text-sm"
            />
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
