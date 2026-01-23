import { useState, useEffect, useRef, useCallback } from 'react';
import { Publication, Vault, Tag, PUBLICATION_TYPES } from '@/types/database';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
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
    // Additional BibTeX fields
    booktitle: '',
    chapter: '',
    edition: '',
    editor: [],
    howpublished: '',
    institution: '',
    number: '',
    organization: '',
    publisher: '',
    school: '',
    series: '',
    type: '',
    eid: '',
    isbn: '',
    issn: '',
    keywords: [],
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [authorsInput, setAuthorsInput] = useState('');
  const [editorInput, setEditorInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [notesTab, setNotesTab] = useState<'write' | 'preview'>('write');
  const [duplicateWarning, setDuplicateWarning] = useState<Publication | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const duplicateCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const publicationRef = useRef(publication);
  const openRef = useRef(open);
  const formDataRef = useRef(formData);
  const authorsInputRef = useRef(authorsInput);
  const selectedTagsRef = useRef(selectedTags);
  const lastPublicationIdRef = useRef<string | null>(null);

  // Duplicate checker helper wrapped in useCallback
  const checkForDuplicate = useCallback((checkData: Partial<Publication>) => {
    // Don't check against the publication being edited
    const editingId = publication?.id;
    
    return allPublications.find(pub => {
      if (editingId && pub.id === editingId) return false;
      
      // Check DOI match (if DOI exists on both)
      if (checkData.doi && pub.doi && checkData.doi.toLowerCase().trim() === pub.doi.toLowerCase().trim()) {
        return true;
      }
      
      // Check title match (normalize for comparison)
      if (checkData.title && pub.title) {
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalizeTitle(checkData.title) === normalizeTitle(pub.title)) {
          return true;
        }
      }
      
      return false;
    });
  }, [publication, allPublications]);

  useEffect(() => {
    // Only reset form data if dialog is opening with a different publication or opening fresh
    const publicationId = publication?.id || null;
    const wasClosedBefore = !openRef.current;
    const isNowOpening = open && wasClosedBefore;
    const isSwitchingPublication = publicationId !== lastPublicationIdRef.current;
    
    // Update the open ref
    openRef.current = open;
    
    // Only reset if opening fresh or switching publications, not on close or while staying open
    if (!isNowOpening && !isSwitchingPublication) {
      return;
    }
    
    isInitialLoadRef.current = true;
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
        // Additional BibTeX fields
        booktitle: publication.booktitle || '',
        chapter: publication.chapter || '',
        edition: publication.edition || '',
        editor: publication.editor || [],
        howpublished: publication.howpublished || '',
        institution: publication.institution || '',
        number: publication.number || '',
        organization: publication.organization || '',
        publisher: publication.publisher || '',
        school: publication.school || '',
        series: publication.series || '',
        type: publication.type || '',
        eid: publication.eid || '',
        isbn: publication.isbn || '',
        issn: publication.issn || '',
        keywords: publication.keywords || [],
      });
      setAuthorsInput(publication.authors.join(', '));
      setEditorInput((publication.editor || []).join(', '));
      setKeywordsInput((publication.keywords || []).join(', '));
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
        // Additional BibTeX fields
        booktitle: '',
        chapter: '',
        edition: '',
        editor: [],
        howpublished: '',
        institution: '',
        number: '',
        organization: '',
        publisher: '',
        school: '',
        series: '',
        type: '',
        eid: '',
        isbn: '',
        issn: '',
        keywords: [],
      });
      setAuthorsInput('');
      setEditorInput('');
      setKeywordsInput('');
      setSelectedTags([]);
    }
  }, [publication, publicationTags, open]);

  // Debounced duplicate check
  useEffect(() => {
    // Only check for duplicates when adding new paper (not editing)
    if (publication) {
      setDuplicateWarning(null);
      return;
    }

    // Clear any existing timeout
    if (duplicateCheckTimeoutRef.current) {
      clearTimeout(duplicateCheckTimeoutRef.current);
    }

    // Only check if there's meaningful data to check
    if (!formData.title && !formData.doi) {
      setDuplicateWarning(null);
      return;
    }

    // Debounce the check by 500ms
    duplicateCheckTimeoutRef.current = setTimeout(() => {
      const duplicate = checkForDuplicate(formData);
      setDuplicateWarning(duplicate || null);
    }, 500);

    return () => {
      if (duplicateCheckTimeoutRef.current) {
        clearTimeout(duplicateCheckTimeoutRef.current);
      }
    };
  }, [formData.title, formData.doi, formData, publication, allPublications, checkForDuplicate]);

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

  const editorInputRef = useRef(editorInput);
  const keywordsInputRef = useRef(keywordsInput);

  useEffect(() => {
    editorInputRef.current = editorInput;
    keywordsInputRef.current = keywordsInput;
  }, [editorInput, keywordsInput]);

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
      const currentEditorInput = editorInputRef.current;
      const currentKeywordsInput = keywordsInputRef.current;
      
      const authors = currentAuthorsInput
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      const editor = currentEditorInput
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const keywords = currentKeywordsInput
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      
      if (currentFormData.title && authors.length > 0) {
        setSaving(true);
        try {
          await onSave({ ...currentFormData, authors, editor, keywords }, currentSelectedTags, true); // true = isAutoSave
        } catch (error) {
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

    const editor = editorInput
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const keywords = keywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    try {
      await onSave({ ...formData, authors, editor, keywords }, selectedTags);
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

        {duplicateWarning && (
          <div className="mx-2 sm:mx-6 mb-2 bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2">
            <p className="text-xs font-mono text-orange-600 dark:text-orange-400">
              <span className="text-orange-500 font-bold">&gt;&gt;</span> warning: possible duplicate detected
            </p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              Similar to: "{duplicateWarning.title}"
            </p>
          </div>
        )}

        <ScrollArea className="flex-1 overflow-auto w-full min-w-0">
          <form onSubmit={handleSubmit} className="px-2 py-3 sm:p-6 sm:pt-4 space-y-3 sm:space-y-5 w-full min-w-full box-border overflow-x-hidden">
            {/* Title */}
            <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
              <div className="flex items-center gap-2">
                <Label htmlFor="title" className="font-semibold font-mono text-sm block">title<span className="text-red-500 ml-1">*</span></Label>
                {duplicateWarning && (
                  <span className="text-[11px] px-2 py-1 rounded bg-orange-500 text-white font-mono font-bold shadow-md">DUPE</span>
                )}
              </div>
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
              <Label htmlFor="authors" className="font-semibold font-mono text-sm block">authors<span className="text-red-500 ml-1">*</span> <span className="text-muted-foreground font-mono text-xs">(comma-separated)</span></Label>
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
                <Label htmlFor="year" className="font-semibold font-mono text-sm block">year<span className="text-red-500 ml-1">*</span></Label>
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

            {/* Additional BibTeX Fields - shown conditionally based on publication type */}
            
            {/* Editor (for books, collections, proceedings) */}
            {['book', 'inbook', 'incollection', 'proceedings'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="editor" className="font-semibold font-mono text-sm block">editor <span className="text-muted-foreground font-mono text-xs">(comma-separated)</span></Label>
                <Input
                  id="editor"
                  value={editorInput}
                  onChange={(e) => setEditorInput(e.target.value)}
                  placeholder="editor_name_1, editor_name_2"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Publisher (for books, proceedings, manuals) */}
            {['book', 'booklet', 'inbook', 'incollection', 'proceedings', 'manual'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="publisher" className="font-semibold font-mono text-sm block">publisher</Label>
                <Input
                  id="publisher"
                  value={formData.publisher}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                  placeholder="publisher_name"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Booktitle (for inbook, incollection, inproceedings) */}
            {['inbook', 'incollection', 'inproceedings', 'conference'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="booktitle" className="font-semibold font-mono text-sm block">booktitle</Label>
                <Input
                  id="booktitle"
                  value={formData.booktitle}
                  onChange={(e) => setFormData({ ...formData, booktitle: e.target.value })}
                  placeholder="title_of_book_or_proceedings"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Series (for books, inbooks, proceedings) */}
            {['book', 'inbook', 'incollection', 'proceedings'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="series" className="font-semibold font-mono text-sm block">series</Label>
                <Input
                  id="series"
                  value={formData.series}
                  onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                  placeholder="series_name"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Edition (for books) */}
            {['book', 'inbook', 'manual'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="edition" className="font-semibold font-mono text-sm block">edition</Label>
                <Input
                  id="edition"
                  value={formData.edition}
                  onChange={(e) => setFormData({ ...formData, edition: e.target.value })}
                  placeholder="Second, Third, etc."
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Chapter (for inbook) */}
            {formData.publication_type === 'inbook' && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="chapter" className="font-semibold font-mono text-sm block">chapter</Label>
                <Input
                  id="chapter"
                  value={formData.chapter}
                  onChange={(e) => setFormData({ ...formData, chapter: e.target.value })}
                  placeholder="3"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* School (for theses) */}
            {['mastersthesis', 'phdthesis'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="school" className="font-semibold font-mono text-sm block">school</Label>
                <Input
                  id="school"
                  value={formData.school}
                  onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                  placeholder="university_name"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Institution (for techreport) */}
            {formData.publication_type === 'techreport' && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="institution" className="font-semibold font-mono text-sm block">institution</Label>
                <Input
                  id="institution"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  placeholder="institution_name"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Organization (for manuals, proceedings) */}
            {['manual', 'proceedings'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="organization" className="font-semibold font-mono text-sm block">organization</Label>
                <Input
                  id="organization"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  placeholder="organization_name"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* How Published (for booklet, misc) */}
            {['booklet', 'misc'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="howpublished" className="font-semibold font-mono text-sm block">howpublished</Label>
                <Input
                  id="howpublished"
                  value={formData.howpublished}
                  onChange={(e) => setFormData({ ...formData, howpublished: e.target.value })}
                  placeholder="how_it_was_published"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* Type field (for theses, techreport) */}
            {['mastersthesis', 'phdthesis', 'techreport'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="type_field" className="font-semibold font-mono text-sm block">type <span className="text-muted-foreground font-mono text-xs">(e.g., PhD_dissertation, Research_Note)</span></Label>
                <Input
                  id="type_field"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="type_description"
                  className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* ISBN for books */}
            {['book', 'inbook', 'incollection', 'proceedings', 'manual'].includes(formData.publication_type || '') && (
              <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
                <Label htmlFor="isbn" className="font-semibold text-sm font-mono block">isbn</Label>
                <Input
                  id="isbn"
                  value={formData.isbn}
                  onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                  placeholder="978-3-16-148410-0"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
            )}

            {/* ISSN and EID for articles */}
            {formData.publication_type === 'article' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 w-full box-border overflow-hidden">
                <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                  <Label htmlFor="issn" className="font-semibold text-sm font-mono block">issn</Label>
                  <Input
                    id="issn"
                    value={formData.issn}
                    onChange={(e) => setFormData({ ...formData, issn: e.target.value })}
                    placeholder="1234-5678"
                    className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                  <Label htmlFor="eid" className="font-semibold text-sm font-mono block">eid</Label>
                  <Input
                    id="eid"
                    value={formData.eid}
                    onChange={(e) => setFormData({ ...formData, eid: e.target.value })}
                    placeholder="electronic_id"
                    className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                  />
                </div>
              </div>
            )}

            {/* Keywords */}
            <div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
              <Label htmlFor="keywords" className="font-semibold font-mono text-sm block">keywords <span className="text-muted-foreground font-mono text-xs">(comma-separated)</span></Label>
              <Input
                id="keywords"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="machine_learning, neural_networks, deep_learning"
                className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
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
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-ul:list-disc prose-ol:list-decimal prose-li:ml-4 prose-ul:space-y-1 prose-ol:space-y-1 prose-headings:font-bold prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-pre:bg-muted prose-pre:p-3 prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-table:border prose-th:border prose-td:border prose-th:p-2 prose-td:p-2">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          rehypePlugins={[rehypeRaw, rehypeSanitize]}
                          components={{
                            ul: ({ node, ...props }) => <ul className="list-disc pl-6 space-y-1 my-2" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal pl-6 space-y-1 my-2" {...props} />,
                            li: ({ node, ...props }) => <li className="ml-0" {...props} />,
                            h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,
                            code: ({ node, inline, ...props }: { node: unknown; inline?: boolean; [key: string]: unknown }) => 
                              inline ? <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props} /> : <code {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-primary pl-4 italic my-2" {...props} />,
                          }}
                        >
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
