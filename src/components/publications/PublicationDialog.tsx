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
import { ScrollArea } from '@/components/ui/scroll-area';
import { RelatedPapersSection } from './RelatedPapersSection';
import { HierarchicalTagSelector } from '@/components/tags/HierarchicalTagSelector';
import { usePublicationRelations } from '@/hooks/usePublicationRelations';
import { useAuth } from '@/hooks/useAuth';

interface PublicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication?: Publication | null;
  vaults: Vault[];
  tags: Tag[];
  publicationTags: string[];
  allPublications: Publication[];
  onSave: (data: Partial<Publication>, tagIds: string[]) => Promise<void>;
  onCreateTag: (name: string, parentId?: string) => Promise<Tag | null>;
}

export function PublicationDialog({
  open,
  onOpenChange,
  publication,
  vaults,
  tags,
  publicationTags,
  allPublications,
  onSave,
  onCreateTag,
}: PublicationDialogProps) {
  const { user } = useAuth();
  const {
    relations,
    loading: relationsLoading,
    addRelation,
    removeRelation,
  } = usePublicationRelations(publication?.id || null, user?.id || null);
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

  const toggleTag = (tagId: string) => {
    setSelectedTags(
      selectedTags.includes(tagId)
        ? selectedTags.filter((id) => id !== tagId)
        : [...selectedTags, tagId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full sm:h-auto sm:w-[95vw] sm:max-w-3xl sm:max-h-[90vh] p-0 border-2 bg-card/95 backdrop-blur-xl overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold">
            {publication ? (
              <span>Edit <span className="text-gradient">Paper</span></span>
            ) : (
              <span>Add <span className="text-gradient">Paper</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 pt-4 space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="font-semibold">Title *</Label>
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
              <Label htmlFor="authors" className="font-semibold">Authors <span className="text-muted-foreground font-mono text-xs">(comma-separated)</span></Label>
              <Input
                id="authors"
                value={authorsInput}
                onChange={(e) => setAuthorsInput(e.target.value)}
                placeholder="John Doe, Jane Smith"
                className="font-mono"
              />
            </div>

            {/* Year and Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year" className="font-semibold">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  placeholder="2024"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type" className="font-semibold">Type</Label>
                <Select
                  value={formData.publication_type}
                  onValueChange={(value) => setFormData({ ...formData, publication_type: value })}
                >
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PUBLICATION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="font-mono">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Journal Info */}
            <div className="space-y-2">
              <Label htmlFor="journal" className="font-semibold">Journal / Conference</Label>
              <Input
                id="journal"
                value={formData.journal}
                onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                placeholder="Nature, Science, NeurIPS..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume" className="font-semibold text-sm">Volume</Label>
                <Input
                  id="volume"
                  value={formData.volume}
                  onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                  placeholder="12"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue" className="font-semibold text-sm">Issue</Label>
                <Input
                  id="issue"
                  value={formData.issue}
                  onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                  placeholder="3"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pages" className="font-semibold text-sm">Pages</Label>
                <Input
                  id="pages"
                  value={formData.pages}
                  onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
                  placeholder="1-10"
                  className="font-mono"
                />
              </div>
            </div>

            {/* DOI and URL */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doi" className="font-semibold">DOI</Label>
                <Input
                  id="doi"
                  value={formData.doi}
                  onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                  placeholder="10.1000/xyz123"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url" className="font-semibold">URL</Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* PDF URL */}
            <div className="space-y-2">
              <Label htmlFor="pdf_url" className="font-semibold">PDF URL</Label>
              <Input
                id="pdf_url"
                value={formData.pdf_url}
                onChange={(e) => setFormData({ ...formData, pdf_url: e.target.value })}
                placeholder="Link to PDF file"
                className="font-mono text-sm"
              />
            </div>

            {/* Vault */}
            <div className="space-y-2">
              <Label htmlFor="vault" className="font-semibold">Vault</Label>
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
                          className="w-3 h-3 rounded-md"
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
            <HierarchicalTagSelector
              tags={tags}
              selectedTagIds={selectedTags}
              onToggleTag={toggleTag}
              onCreateTag={onCreateTag}
            />

            {/* Abstract */}
            <div className="space-y-2">
              <Label htmlFor="abstract" className="font-semibold">Abstract</Label>
              <Textarea
                id="abstract"
                value={formData.abstract}
                onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
                placeholder="Publication abstract..."
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="font-semibold">Notes <span className="text-muted-foreground font-mono text-xs">(markdown supported)</span></Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="// your personal notes..."
                rows={3}
                className="font-mono text-sm"
              />
            </div>

            {/* BibTeX Key */}
            <div className="space-y-2">
              <Label htmlFor="bibtex_key" className="font-semibold">BibTeX Key <span className="text-muted-foreground font-mono text-xs">(auto-generated if empty)</span></Label>
              <Input
                id="bibtex_key"
                value={formData.bibtex_key}
                onChange={(e) => setFormData({ ...formData, bibtex_key: e.target.value })}
                placeholder="author2024title"
                className="font-mono"
              />
            </div>

            {/* Related Papers - only show when editing an existing publication */}
            {publication && (
              <RelatedPapersSection
                relations={relations}
                allPublications={allPublications}
                currentPublicationId={publication.id}
                loading={relationsLoading}
                onAddRelation={addRelation}
                onRemoveRelation={removeRelation}
              />
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t-2 border-border">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="glow" disabled={saving}>
                {saving ? 'Saving...' : publication ? 'Update Paper' : 'Add Paper'}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
