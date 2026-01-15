import { useState, useEffect, useRef } from 'react';
import { Publication, Vault, Tag, PUBLICATION_TYPES } from '@/types/database';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  onSave: (data: Partial<Publication>, tagIds: string[], isAutoSave?: boolean) => Promise<void>;
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
  const [notesTab, setNotesTab] = useState<'write' | 'preview'>('write');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const publicationRef = useRef(publication);
  const openRef = useRef(open);
  const formDataRef = useRef(formData);
  const authorsInputRef = useRef(authorsInput);
  const selectedTagsRef = useRef(selectedTags);
  const lastPublicationIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only reset form data if dialog is opening or switching to a different publication
    const publicationId = publication?.id || null;
    const isOpeningDialog = open && !publicationRef.current;
    const isSwitchingPublication = publicationId !== lastPublicationIdRef.current;
    
    if (!isOpeningDialog && !isSwitchingPublication) {
      return; // Don't reset form if just updating the same publication
    }
    
    isInitialLoadRef.current = true; // Reset on dialog open
    lastPublicationIdRef.current = publicationId;
    
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

  // Reset auto-save flag when dialog opens
  useEffect(() => {
    publicationRef.current = publication;
    openRef.current = open;
    if (open && publication) {
      isInitialLoadRef.current = true;
    }
  }, [open, publication]);

  // Update refs when form data changes
  useEffect(() => {
    formDataRef.current = formData;
    authorsInputRef.current = authorsInput;
    selectedTagsRef.current = selectedTags;
  }, [formData, authorsInput, selectedTags]);

  // Auto-save for edit mode only (debounced) - only triggers on formData changes
  useEffect(() => {
    if (!publicationRef.current || !openRef.current) return; // Only auto-save when editing an existing publication
    
    // Skip auto-save on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      // Get latest values from refs
      const currentFormData = formDataRef.current;
      const currentAuthorsInput = authorsInputRef.current;
      const currentSelectedTags = selectedTagsRef.current;
      
      const authors = currentAuthorsInput
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      
      if (currentFormData.title && authors.length > 0) {
        setSaving(true);
        try {
          await onSave({ ...currentFormData, authors }, currentSelectedTags, true); // true = isAutoSave
        } catch (error) {
          console.error('Auto-save failed:', error);
        } finally {
          setSaving(false);
        }
      }
    }, 3000); // 3 second debounce

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, authorsInput, selectedTags]);

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
      <DialogContent className="w-screen max-w-none box-border h-screen sm:w-[95vw] sm:max-w-3xl sm:h-auto sm:max-h-[90vh] m-0 p-0 border-0 sm:border-2 bg-card/95 backdrop-blur-xl overflow-x-hidden overflow-y-auto flex flex-col">
        <DialogHeader className="px-2 py-3 sm:p-6 pb-2 sm:pb-0">
          <DialogTitle className="text-lg sm:text-2xl font-bold font-mono pr-2 sm:pr-0">
            {publication ? (
              <span>edit_<span className="text-gradient">paper</span></span>
            ) : (
              <span>add_<span className="text-gradient">paper</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto w-full min-w-0">
          <form onSubmit={handleSubmit} className="px-2 py-3 sm:p-6 sm:pt-4 space-y-3 sm:space-y-5 w-full min-w-full box-border overflow-x-hidden">
            {/* Title */}
            <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
              <Label htmlFor="title" className="font-semibold font-mono text-sm block">title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="publication_title"
                required
                className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
              />
            </div>

            {/* Authors */}
            <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
              <Label htmlFor="authors" className="font-semibold font-mono text-sm block">authors <span className="text-muted-foreground font-mono text-xs">(comma-separated)</span></Label>
              <Input
                id="authors"
                value={authorsInput}
                onChange={(e) => setAuthorsInput(e.target.value)}
                placeholder="john_doe, jane_smith"
                className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
              />
            </div>

            {/* Year and Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 w-full box-border overflow-hidden">
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="year" className="font-semibold font-mono text-sm block">year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  placeholder="2024"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="type" className="font-semibold font-mono">type</Label>
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
            <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
              <Label htmlFor="journal" className="font-semibold font-mono text-sm block">journal_/_conference</Label>
              <Input
                id="journal"
                value={formData.journal}
                onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                placeholder="nature, science, neurips..."
                className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 w-full box-border overflow-hidden">
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="volume" className="font-semibold text-sm font-mono block">volume</Label>
                <Input
                  id="volume"
                  value={formData.volume}
                  onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                  placeholder="12"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="issue" className="font-semibold text-sm font-mono block">issue</Label>
                <Input
                  id="issue"
                  value={formData.issue}
                  onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                  placeholder="3"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="pages" className="font-semibold text-sm font-mono block">pages</Label>
                <Input
                  id="pages"
                  value={formData.pages}
                  onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
                  placeholder="1-10"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
            </div>

            {/* DOI and URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 w-full box-border overflow-hidden">
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="doi" className="font-semibold font-mono text-sm block">doi</Label>
                <Input
                  id="doi"
                  value={formData.doi}
                  onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                  placeholder="10.1000/xyz123"
                  className="font-mono text-xs sm:text-sm w-full break-all h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="url" className="font-semibold font-mono text-sm block">url</Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                  className="font-mono text-xs sm:text-sm w-full break-all h-9 sm:h-10 box-border"
                />
              </div>
            </div>

            {/* PDF URL */}
            <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
              <Label htmlFor="pdf_url" className="font-semibold font-mono text-sm block">pdf_url</Label>
              <Input
                id="pdf_url"
                value={formData.pdf_url}
                onChange={(e) => setFormData({ ...formData, pdf_url: e.target.value })}
                placeholder="link_to_pdf"
                className="font-mono text-xs sm:text-sm w-full break-all h-9 sm:h-10 box-border"
              />
            </div>

            {/* Vault */}
            <div className="space-y-2 min-w-0">
              <Label htmlFor="vault" className="font-semibold font-mono">vault</Label>
              <Select
                value={formData.vault_id || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, vault_id: value === 'none' ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="select_vault" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">no_vault</SelectItem>
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
            <div className="space-y-2 min-w-0">
              <Label htmlFor="abstract" className="font-semibold font-mono">abstract</Label>
              <Textarea
                id="abstract"
                value={formData.abstract}
                onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
                placeholder="publication_abstract..."
                rows={4}
                className="font-mono text-xs sm:text-sm w-full min-w-0 break-words"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2 min-w-0">
              <Label htmlFor="notes" className="font-semibold font-mono">notes <span className="text-muted-foreground font-mono text-xs">(markdown_supported)</span></Label>
              <Tabs value={notesTab} onValueChange={(v) => setNotesTab(v as 'write' | 'preview')} className="w-full min-w-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="write" className="font-mono text-xs">write</TabsTrigger>
                  <TabsTrigger value="preview" className="font-mono text-xs">preview</TabsTrigger>
                </TabsList>
                <TabsContent value="write" className="mt-2 min-w-0">
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="// your_personal_notes...\n\n**Bold text**, *italic*, `code`, [links](url)\n\n- bullet points\n- supported"
                    rows={6}
                    className="font-mono text-xs sm:text-sm w-full min-w-0 break-words"
                  />
                </TabsContent>
                <TabsContent value="preview" className="mt-2 min-w-0">
                  <div className="min-h-[150px] max-h-[300px] p-4 rounded-md border border-input bg-muted/30 overflow-auto">
                    {formData.notes ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {formData.notes}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm font-mono">// no_notes_yet</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* BibTeX Key */}
            <div className="space-y-2 min-w-0">
              <Label htmlFor="bibtex_key" className="font-semibold font-mono">bibtex_key <span className="text-muted-foreground font-mono text-xs">(auto-generated_if_empty)</span></Label>
              <Input
                id="bibtex_key"
                value={formData.bibtex_key}
                onChange={(e) => setFormData({ ...formData, bibtex_key: e.target.value })}
                placeholder="author2024title"
                className="font-mono w-full min-w-0 text-sm break-words"
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
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-border w-full box-border">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10">
                cancel
              </Button>
              <Button type="submit" variant="glow" disabled={saving} className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10">
                {saving ? 'saving...' : publication ? 'update_paper' : 'add_paper'}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
