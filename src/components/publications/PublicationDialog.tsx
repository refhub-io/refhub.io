import { useState, useEffect, useRef, useCallback } from 'react';
import { Publication, Vault, Tag, PUBLICATION_TYPES } from '@/types/database';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Maximize, Minimize } from 'lucide-react';
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
  publicationVaults?: string[]; // IDs of vaults this publication is already in
  currentVaultId?: string; // Current vault ID to pre-select when adding new paper
  onSave: (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave?: boolean) => Promise<void>;
  onCreateTag: (name: string, parentId?: string) => Promise<Tag | null>;
  onAddToVaults?: (publicationId: string, vaultIds: string[]) => Promise<void>;
}

export function PublicationDialog({
  open,
  onOpenChange,
  publication,
  vaults,
  tags,
  publicationTags,
  allPublications,
  publicationVaults,
  currentVaultId,
  onSave,
  onCreateTag,
  onAddToVaults,
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
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>(currentVaultId ? [currentVaultId] : []);
  const [authorsInput, setAuthorsInput] = useState('');
  const [editorInput, setEditorInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [notesTab, setNotesTab] = useState<'write' | 'preview'>('write');
  const [notesFullscreen, setNotesFullscreen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Publication | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
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

    // Reset selectedVaultIds when opening for add mode
    if (isNowOpening && !publication && currentVaultId) {
      setSelectedVaultIds([currentVaultId]);
    }

    // Only reset if opening fresh or switching publications, not on close or while staying open
    if (!isNowOpening && !isSwitchingPublication) {
      return;
    }

    isInitialLoadRef.current = true;
    lastPublicationIdRef.current = publicationId;
    
    // Reset modified fields tracking when opening dialog or switching publications
    // This allows realtime sync to work properly for the new publication
    setModifiedFields(new Set());

    if (publication) {
      setFormData({
        id: publication.id, // Include id for realtime sync tracking
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

  // Track which fields have been modified by the user
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());

  // Sync with external publication changes when dialog is open, but only for fields not modified by user
  // This enables realtime updates to notes/markdown preview when another client makes changes
  useEffect(() => {
    if (open && publication && lastPublicationIdRef.current === publication.id) {
      setFormData(prev => {
        const updatedData = { ...prev };

        // Only update fields that haven't been modified by the user
        if (!modifiedFields.has('title')) updatedData.title = publication.title;
        if (!modifiedFields.has('authors')) updatedData.authors = publication.authors;
        if (!modifiedFields.has('year')) updatedData.year = publication.year;
        if (!modifiedFields.has('journal')) updatedData.journal = publication.journal || '';
        if (!modifiedFields.has('volume')) updatedData.volume = publication.volume || '';
        if (!modifiedFields.has('issue')) updatedData.issue = publication.issue || '';
        if (!modifiedFields.has('pages')) updatedData.pages = publication.pages || '';
        if (!modifiedFields.has('doi')) updatedData.doi = publication.doi || '';
        if (!modifiedFields.has('url')) updatedData.url = publication.url || '';
        if (!modifiedFields.has('abstract')) updatedData.abstract = publication.abstract || '';
        if (!modifiedFields.has('pdf_url')) updatedData.pdf_url = publication.pdf_url || '';
        if (!modifiedFields.has('bibtex_key')) updatedData.bibtex_key = publication.bibtex_key || '';
        if (!modifiedFields.has('publication_type')) updatedData.publication_type = publication.publication_type || 'article';
        if (!modifiedFields.has('notes')) updatedData.notes = publication.notes || ''; // This is the key field for markdown preview
        if (!modifiedFields.has('booktitle')) updatedData.booktitle = publication.booktitle || '';
        if (!modifiedFields.has('chapter')) updatedData.chapter = publication.chapter || '';
        if (!modifiedFields.has('edition')) updatedData.edition = publication.edition || '';
        if (!modifiedFields.has('editor')) updatedData.editor = publication.editor || [];
        if (!modifiedFields.has('howpublished')) updatedData.howpublished = publication.howpublished || '';
        if (!modifiedFields.has('institution')) updatedData.institution = publication.institution || '';
        if (!modifiedFields.has('number')) updatedData.number = publication.number || '';
        if (!modifiedFields.has('organization')) updatedData.organization = publication.organization || '';
        if (!modifiedFields.has('publisher')) updatedData.publisher = publication.publisher || '';
        if (!modifiedFields.has('school')) updatedData.school = publication.school || '';
        if (!modifiedFields.has('series')) updatedData.series = publication.series || '';
        if (!modifiedFields.has('type')) updatedData.type = publication.type || '';
        if (!modifiedFields.has('eid')) updatedData.eid = publication.eid || '';
        if (!modifiedFields.has('isbn')) updatedData.isbn = publication.isbn || '';
        if (!modifiedFields.has('issn')) updatedData.issn = publication.issn || '';
        if (!modifiedFields.has('keywords')) updatedData.keywords = publication.keywords || [];

        return updatedData;
      });
    }
  }, [publication, open, modifiedFields]);

  // Handler to track when a field is modified by the user
  const trackFieldModification = (fieldName: string) => {
    setModifiedFields(prev => new Set(prev).add(fieldName));
  };

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

  // Reset state when dialog opens
  useEffect(() => {
    publicationRef.current = publication;
    openRef.current = open;
    if (open) {
      isInitialLoadRef.current = true;
      setPendingClose(false);
    }
  }, [open, publication]);

  // Update refs when form data changes
  useEffect(() => {
    formDataRef.current = formData;
    authorsInputRef.current = authorsInput;
    selectedTagsRef.current = selectedTags;
  }, [formData, authorsInput, selectedTags]);

  // Compute isDirty based on modifiedFields - only true if user has actually modified something
  const isDirty = modifiedFields.size > 0;

  // Handle beforeunload when dialog is open and dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (open && modifiedFields.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [open, modifiedFields.size]);

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
      // Pass vaultIds only for new publications (when publication is null)
      await onSave({ ...formData, authors, editor, keywords }, selectedTags, publication ? undefined : selectedVaultIds);
      setModifiedFields(new Set()); // Clear dirty state
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  // Handle dialog close with unsaved changes check
  // Dialog calls onOpenChange(false) when user clicks X or outside
  const handleDialogClose = useCallback((requestedOpen: boolean) => {
    // If fullscreen is active, ignore close requests from the Dialog
    // (The Dialog's open prop changing to false triggers this, but we don't want to actually close)
    if (notesFullscreen && !requestedOpen) {
      return;
    }
    
    if (requestedOpen) {
      // Dialog is opening, just pass through
      onOpenChange(true);
      return;
    }
    
    // Dialog wants to close
    if (modifiedFields.size > 0) {
      setPendingClose(true);
      setShowUnsavedDialog(true);
    } else {
      onOpenChange(false);
    }
  }, [modifiedFields.size, onOpenChange, notesFullscreen]);

  // Handle discard changes
  const handleDiscardChanges = useCallback(() => {
    setShowUnsavedDialog(false);
    setModifiedFields(new Set());
    setPendingClose(false);
    onOpenChange(false);
  }, [onOpenChange]);

  // Handle save and close
  const handleSaveAndClose = useCallback(async () => {
    setSaving(true);
    try {
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

      await onSave({ ...formData, authors, editor, keywords }, selectedTags, publication ? undefined : selectedVaultIds);
      setModifiedFields(new Set()); // Clear dirty state
      setShowUnsavedDialog(false);
      setPendingClose(false);
      onOpenChange(false);
    } catch (error) {
      // Keep dialog open on error
    } finally {
      setSaving(false);
    }
  }, [authorsInput, editorInput, keywordsInput, formData, selectedTags, selectedVaultIds, publication, onSave, onOpenChange]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(
      selectedTags.includes(tagId)
        ? selectedTags.filter((id) => id !== tagId)
        : [...selectedTags, tagId]
    );
  };

  return (
    <>
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onDiscard={handleDiscardChanges}
        onCancel={() => {
          setShowUnsavedDialog(false);
          setPendingClose(false);
        }}
        onSave={handleSaveAndClose}
        saving={saving}
        title="Unsaved Changes"
        description="You have unsaved changes to this paper. Would you like to save them before closing?"
      />
      
      {/* Fullscreen Notes Editor - rendered instead of dialog when active */}
      {notesFullscreen && open && (
        <div className="fixed inset-0 bg-background z-50">
          <div className="h-full flex flex-col relative">
            {/* Header */}
            <div className="border-b border-border bg-card/50 backdrop-blur-xl shrink-0">
              <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <h2 className="text-base sm:text-lg font-bold font-mono truncate">notes_editor</h2>
                  <span className="text-xs text-muted-foreground font-mono hidden sm:inline">(markdown_supported)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotesFullscreen(false)}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 font-mono shrink-0"
                >
                  <Minimize className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">exit_fullscreen</span>
                </button>
              </div>
            </div>

            {/* Tabs and Content */}
            <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
              <div className="border-b border-border px-4 sm:px-6 pt-3 sm:pt-4 pb-3 shrink-0">
                <div className="grid w-full grid-cols-2 gap-1 bg-muted p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setNotesTab('write')}
                    className={`px-4 py-2 text-sm font-mono rounded-md transition-colors ${
                      notesTab === 'write' 
                        ? 'bg-background text-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    write
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotesTab('preview')}
                    className={`px-4 py-2 text-sm font-mono rounded-md transition-colors ${
                      notesTab === 'preview' 
                        ? 'bg-background text-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    preview
                  </button>
                </div>
              </div>
              
              {notesTab === 'write' && (
                <div className="flex-1 px-4 sm:px-6 py-3 sm:py-4 overflow-hidden min-h-0">
                  <textarea
                    id="fullscreen-notes-textarea"
                    value={formData.notes}
                    onChange={(e) => {
                      setFormData({ ...formData, notes: e.target.value });
                      trackFieldModification('notes');
                    }}
                    autoFocus
                    autoCapitalize="sentences"
                    autoComplete="off"
                    autoCorrect="on"
                    spellCheck={true}
                    enterKeyHint="enter"
                    placeholder={`// your_personal_notes...

**Bold text**, *italic*, \`code\`, [links](url)

- bullet points
- supported`}
                    className="font-mono text-base w-full h-full resize-none bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
              
              {notesTab === 'preview' && (
                <div className="flex-1 px-4 sm:px-6 py-3 sm:py-4 overflow-auto min-h-0">
                  {formData.notes ? (
                    <div className="prose prose-sm dark:prose-invert max-w-4xl mx-auto break-words">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      >
                        {formData.notes}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center font-mono mt-12">// no_notes_yet</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Main Dialog - hidden when fullscreen is active */}
      <Dialog open={open && !notesFullscreen} onOpenChange={handleDialogClose}>
        <DialogContent 
          className="w-screen max-w-none box-border h-screen sm:w-[95vw] sm:max-w-3xl sm:h-auto sm:max-h-[90vh] m-0 p-0 border-0 sm:border-2 bg-card/95 backdrop-blur-xl overflow-x-hidden overflow-y-auto flex flex-col"
        >
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
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value });
                  trackFieldModification('title');
                }}
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
                onChange={(e) => {
                  setAuthorsInput(e.target.value);
                  trackFieldModification('authors');
                }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined });
                    trackFieldModification('year');
                  }}
                  placeholder="2024"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="type" className="font-semibold font-mono">type</Label>
                <Select
                  value={formData.publication_type}
                  onValueChange={(value) => {
                    setFormData({ ...formData, publication_type: value });
                    trackFieldModification('publication_type');
                  }}
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
                onChange={(e) => {
                  setFormData({ ...formData, journal: e.target.value });
                  trackFieldModification('journal');
                }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, volume: e.target.value });
                    trackFieldModification('volume');
                  }}
                  placeholder="12"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="issue" className="font-semibold text-sm font-mono block">issue</Label>
                <Input
                  id="issue"
                  value={formData.issue}
                  onChange={(e) => {
                    setFormData({ ...formData, issue: e.target.value });
                    trackFieldModification('issue');
                  }}
                  placeholder="3"
                  className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="pages" className="font-semibold text-sm font-mono block">pages</Label>
                <Input
                  id="pages"
                  value={formData.pages}
                  onChange={(e) => {
                    setFormData({ ...formData, pages: e.target.value });
                    trackFieldModification('pages');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, doi: e.target.value });
                    trackFieldModification('doi');
                  }}
                  placeholder="10.1000/xyz123"
                  className="font-mono text-xs sm:text-sm w-full break-all h-9 sm:h-10 box-border"
                />
              </div>
              <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                <Label htmlFor="url" className="font-semibold font-mono text-sm block">url</Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) => {
                    setFormData({ ...formData, url: e.target.value });
                    trackFieldModification('url');
                  }}
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
                onChange={(e) => {
                  setFormData({ ...formData, pdf_url: e.target.value });
                  trackFieldModification('pdf_url');
                }}
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
                  onChange={(e) => {
                    setEditorInput(e.target.value);
                    trackFieldModification('editor');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, publisher: e.target.value });
                    trackFieldModification('publisher');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, booktitle: e.target.value });
                    trackFieldModification('booktitle');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, series: e.target.value });
                    trackFieldModification('series');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, edition: e.target.value });
                    trackFieldModification('edition');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, chapter: e.target.value });
                    trackFieldModification('chapter');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, school: e.target.value });
                    trackFieldModification('school');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, institution: e.target.value });
                    trackFieldModification('institution');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, organization: e.target.value });
                    trackFieldModification('organization');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, howpublished: e.target.value });
                    trackFieldModification('howpublished');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, type: e.target.value });
                    trackFieldModification('type');
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, isbn: e.target.value });
                    trackFieldModification('isbn');
                  }}
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
                    onChange={(e) => {
                    setFormData({ ...formData, issn: e.target.value });
                    trackFieldModification('issn');
                  }}
                    placeholder="1234-5678"
                    className="font-mono w-full text-xs sm:text-sm h-9 sm:h-10 box-border"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                  <Label htmlFor="eid" className="font-semibold text-sm font-mono block">eid</Label>
                  <Input
                    id="eid"
                    value={formData.eid}
                    onChange={(e) => {
                    setFormData({ ...formData, eid: e.target.value });
                    trackFieldModification('eid');
                  }}
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
                onChange={(e) => {
                  setKeywordsInput(e.target.value);
                  trackFieldModification('keywords');
                }}
                placeholder="machine_learning, neural_networks, deep_learning"
                className="font-mono w-full text-xs sm:text-sm break-words h-9 sm:h-10 box-border"
              />
            </div>

            {/* Vaults - Show which vaults this publication is in and allow adding to more */}
            <div className="space-y-2 min-w-0">
              <Label className="font-semibold font-mono">vaults</Label>

              {/* Display vaults this publication is already in */}
              {publication && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-mono">currently_in_vaults:</p>
                  <div className="flex flex-wrap gap-2">
                    {vaults
                      .filter(vault => publicationVaults?.includes(vault.id))
                      .map(vault => (
                        <div
                          key={vault.id}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border bg-secondary"
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: vault.color }}
                          />
                          {vault.name}
                        </div>
                      ))
                    }
                    {vaults.filter(vault => publicationVaults?.includes(vault.id)).length === 0 && (
                      <p className="text-sm text-muted-foreground font-mono">not_in_any_vault</p>
                    )}
                  </div>
                </div>
              )}

              {/* Multi-select vaults when adding new paper */}
              {!publication && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-mono">add_to_vaults:</p>
                  <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                    {vaults.map(vault => (
                      <label
                        key={vault.id}
                        className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedVaultIds.includes(vault.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedVaultIds([...selectedVaultIds, vault.id]);
                            } else {
                              setSelectedVaultIds(selectedVaultIds.filter(id => id !== vault.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className="w-3 h-3 rounded-md"
                            style={{ backgroundColor: vault.color }}
                          />
                          <span className="text-sm font-mono">{vault.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedVaultIds.length > 0 && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {selectedVaultIds.length} vault{selectedVaultIds.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {/* Add to vaults selector for existing publications */}
              {onAddToVaults && publication && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm text-muted-foreground font-mono">add_to_vault:</p>
                  <Select
                    onValueChange={async (vaultId) => {
                      if (vaultId !== 'none' && publication?.id && onAddToVaults) {
                        try {
                          await onAddToVaults(publication.id, [vaultId]);
                          // Show success message
                        } catch (error) {
                          console.error('Error adding to vault:', error);
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="select_vault_to_add" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">select_vault</SelectItem>
                      {vaults.map((vault) => (
                        <SelectItem
                          key={vault.id}
                          value={vault.id}
                          disabled={publicationVaults?.includes(vault.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-md"
                              style={{ backgroundColor: vault.color }}
                            />
                            {vault.name}
                            {publicationVaults?.includes(vault.id) && (
                              <span className="ml-1 text-xs text-muted-foreground">(already in)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                onChange={(e) => {
                  setFormData({ ...formData, abstract: e.target.value });
                  trackFieldModification('abstract');
                }}
                placeholder="publication_abstract..."
                rows={4}
                className="font-mono text-xs sm:text-sm w-full min-w-0 break-words"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <Label htmlFor="notes" className="font-semibold font-mono">notes <span className="text-muted-foreground font-mono text-xs">(markdown_supported)</span></Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Mark notes as modified to prevent realtime sync from overwriting
                    trackFieldModification('notes');
                    setNotesFullscreen(true);
                  }}
                  className="h-7 font-mono text-xs"
                >
                  <Maximize className="w-3 h-3 mr-1" />
                  fullscreen
                </Button>
              </div>
              <Tabs value={notesTab} onValueChange={(v) => setNotesTab(v as 'write' | 'preview')} className="w-full min-w-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="write" className="font-mono text-xs">write</TabsTrigger>
                  <TabsTrigger value="preview" className="font-mono text-xs">preview</TabsTrigger>
                </TabsList>
                <TabsContent value="write" className="mt-2 min-w-0">
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => {
                      setFormData({ ...formData, notes: e.target.value });
                      trackFieldModification('notes');
                    }}
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
                onChange={(e) => {
                  setFormData({ ...formData, bibtex_key: e.target.value });
                  trackFieldModification('bibtex_key');
                }}
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
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10">
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
    </>
  );
}
