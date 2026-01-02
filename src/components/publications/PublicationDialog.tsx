import { useState, useEffect } from 'react';
import { Publication, Vault, Tag, PUBLICATION_TYPES } from '@/types/database';
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
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PublicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication?: Publication | null;
  vaults: Vault[];
  tags: Tag[];
  publicationTags: string[];
  onSave: (data: Partial<Publication>, tagIds: string[]) => Promise<void>;
  onCreateTag: (name: string) => Promise<Tag | null>;
}

export function PublicationDialog({
  open,
  onOpenChange,
  publication,
  vaults,
  tags,
  publicationTags,
  onSave,
  onCreateTag,
}: PublicationDialogProps) {
  const [formData, setFormData] = useState<Partial<Publication>>({
    title: '',
    authors: [],
    year: undefined,
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    doi: '',
    url: '',
    abstract: '',
    pdf_url: '',
    bibtex_key: '',
    publication_type: 'article',
    notes: '',
    vault_id: null,
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [authorsInput, setAuthorsInput] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (publication) {
      setFormData({
        title: publication.title,
        authors: publication.authors,
        year: publication.year,
        journal: publication.journal || '',
        volume: publication.volume || '',
        issue: publication.issue || '',
        pages: publication.pages || '',
        doi: publication.doi || '',
        url: publication.url || '',
        abstract: publication.abstract || '',
        pdf_url: publication.pdf_url || '',
        bibtex_key: publication.bibtex_key || '',
        publication_type: publication.publication_type || 'article',
        notes: publication.notes || '',
        vault_id: publication.vault_id,
      });
      setAuthorsInput(publication.authors.join(', '));
      setSelectedTags(publicationTags);
    } else {
      setFormData({
        title: '',
        authors: [],
        year: undefined,
        journal: '',
        volume: '',
        issue: '',
        pages: '',
        doi: '',
        url: '',
        abstract: '',
        pdf_url: '',
        bibtex_key: '',
        publication_type: 'article',
        notes: '',
        vault_id: null,
      });
      setAuthorsInput('');
      setSelectedTags([]);
    }
  }, [publication, publicationTags, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const authors = authorsInput
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    try {
      await onSave({ ...formData, authors }, selectedTags);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const tag = await onCreateTag(newTagName.trim());
    if (tag) {
      setSelectedTags([...selectedTags, tag.id]);
      setNewTagName('');
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(
      selectedTags.includes(tagId)
        ? selectedTags.filter((id) => id !== tagId)
        : [...selectedTags, tagId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display text-2xl">
            {publication ? 'Edit Publication' : 'Add Publication'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)]">
          <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Publication title"
                required
              />
            </div>

            {/* Authors */}
            <div className="space-y-2">
              <Label htmlFor="authors">Authors (comma-separated)</Label>
              <Input
                id="authors"
                value={authorsInput}
                onChange={(e) => setAuthorsInput(e.target.value)}
                placeholder="John Doe, Jane Smith"
              />
            </div>

            {/* Year and Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  placeholder="2024"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.publication_type}
                  onValueChange={(value) => setFormData({ ...formData, publication_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PUBLICATION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Journal Info */}
            <div className="space-y-2">
              <Label htmlFor="journal">Journal / Conference</Label>
              <Input
                id="journal"
                value={formData.journal}
                onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                placeholder="Nature, Science, etc."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume">Volume</Label>
                <Input
                  id="volume"
                  value={formData.volume}
                  onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                  placeholder="12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue">Issue</Label>
                <Input
                  id="issue"
                  value={formData.issue}
                  onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                  placeholder="3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pages">Pages</Label>
                <Input
                  id="pages"
                  value={formData.pages}
                  onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
                  placeholder="1-10"
                />
              </div>
            </div>

            {/* DOI and URL */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doi">DOI</Label>
                <Input
                  id="doi"
                  value={formData.doi}
                  onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                  placeholder="10.1000/xyz123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* PDF URL */}
            <div className="space-y-2">
              <Label htmlFor="pdf_url">PDF URL</Label>
              <Input
                id="pdf_url"
                value={formData.pdf_url}
                onChange={(e) => setFormData({ ...formData, pdf_url: e.target.value })}
                placeholder="Link to PDF file"
              />
            </div>

            {/* Vault */}
            <div className="space-y-2">
              <Label htmlFor="vault">Vault</Label>
              <Select
                value={formData.vault_id || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, vault_id: value === 'none' ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a vault" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vault</SelectItem>
                  {vaults.map((vault) => (
                    <SelectItem key={vault.id} value={vault.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: vault.color }}
                        />
                        {vault.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? 'default' : 'outline'}
                    className="cursor-pointer transition-colors"
                    style={
                      selectedTags.includes(tag.id)
                        ? { backgroundColor: tag.color, borderColor: tag.color }
                        : { borderColor: tag.color, color: tag.color }
                    }
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                    {selectedTags.includes(tag.id) && (
                      <X className="w-3 h-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New tag name"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleCreateTag}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Abstract */}
            <div className="space-y-2">
              <Label htmlFor="abstract">Abstract</Label>
              <Textarea
                id="abstract"
                value={formData.abstract}
                onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
                placeholder="Publication abstract..."
                rows={4}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Your personal notes..."
                rows={3}
              />
            </div>

            {/* BibTeX Key */}
            <div className="space-y-2">
              <Label htmlFor="bibtex_key">BibTeX Key (optional)</Label>
              <Input
                id="bibtex_key"
                value={formData.bibtex_key}
                onChange={(e) => setFormData({ ...formData, bibtex_key: e.target.value })}
                placeholder="Auto-generated if empty"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : publication ? 'Update' : 'Add Publication'}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
