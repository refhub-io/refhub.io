import { useState, useCallback } from 'react';
import { Publication, Vault, PUBLICATION_TYPES } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseBibtex, fetchDOIMetadata, generateBibtexKey } from '@/lib/bibtex';
import { FileText, Link, Upload, Check, X, Library, PenLine, Loader2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { ExistingPaperSelector } from './ExistingPaperSelector';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AddImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaults: Vault[];
  allPublications: Publication[];
  currentVaultId: string | null;
  onImport?: (publications: Partial<Publication>[], targetVaultId?: string | null) => Promise<string[]>;
  onAddToVaults?: (publicationId: string, vaultIds: string[]) => Promise<void>;
  /** Callback for a single manually-created publication. Falls back to onImport([pub]) if not provided. */
  onManualCreate?: (publication: Partial<Publication>, targetVaultId?: string | null) => Promise<string | null>;
}

type FlowTab = 'library' | 'doi' | 'bibtex' | 'manual';

export function AddImportDialog({
  open,
  onOpenChange,
  vaults,
  allPublications,
  currentVaultId,
  onImport,
  onAddToVaults,
  onManualCreate,
}: AddImportDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<FlowTab>('library');

  // DOI state
  const [doiInput, setDoiInput] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);

  // BibTeX state
  const [bibtexInput, setBibtexInput] = useState('');

  // Parsed publications (shared between DOI & BibTeX)
  const [parsedPublications, setParsedPublications] = useState<Partial<Publication>[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [duplicateIndices, setDuplicateIndices] = useState<Set<number>>(new Set());

  // Manual entry state
  const [manualForm, setManualForm] = useState<Partial<Publication>>({
    title: '',
    authors: [],
    year: null,
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    doi: '',
    url: '',
    pdf_url: '',
    abstract: '',
    publication_type: 'article',
    notes: '',
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
  const [manualAuthorsInput, setManualAuthorsInput] = useState('');
  const [manualEditorInput, setManualEditorInput] = useState('');
  const [manualKeywordsInput, setManualKeywordsInput] = useState('');

  // Import options
  const [targetVaultId, setTargetVaultId] = useState<string | null>(currentVaultId);
  const [importing, setImporting] = useState(false);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const checkForDuplicate = useCallback(
    (newPub: Partial<Publication>) => {
      return allPublications.find(pub => {
        if (newPub.doi && pub.doi && newPub.doi.toLowerCase().trim() === pub.doi.toLowerCase().trim()) return true;
        if (newPub.title && pub.title) {
          const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
          if (norm(newPub.title) === norm(pub.title)) return true;
        }
        return false;
      });
    },
    [allPublications],
  );

  // ─── DOI flow ────────────────────────────────────────────────────────────────

  const handleDOILookup = async () => {
    if (!doiInput.trim()) return;
    setDoiLoading(true);
    try {
      const metadata = await fetchDOIMetadata(doiInput);
      const pub: Partial<Publication> = {
        title: metadata.title,
        authors: metadata.authors,
        year: metadata.year,
        journal: metadata.journal,
        volume: metadata.volume,
        issue: metadata.issue,
        pages: metadata.pages,
        doi: metadata.doi,
        url: metadata.url,
        abstract: metadata.abstract,
        publication_type: metadata.type || 'article',
      };
      pub.bibtex_key = generateBibtexKey(pub as Publication);
      const isDuplicate = checkForDuplicate(pub);
      const newIndex = parsedPublications.length;
      setParsedPublications(prev => [...prev, pub]);
      setSelectedIndices(prev => new Set([...prev, newIndex]));
      if (isDuplicate) {
        setDuplicateIndices(prev => new Set([...prev, newIndex]));
        toast({ title: '⚠️ possible_duplicate', description: `"${metadata.title}" may already exist`, variant: 'destructive' });
      } else {
        toast({ title: 'doi_resolved ✨', description: metadata.title });
      }
      setDoiInput('');
    } catch (error) {
      toast({ title: 'doi_lookup_failed', description: (error as Error).message || 'Could not resolve DOI', variant: 'destructive' });
    } finally {
      setDoiLoading(false);
    }
  };

  // ─── BibTeX flow ─────────────────────────────────────────────────────────────

  const handleBibtexParse = () => {
    if (!bibtexInput.trim()) return;
    try {
      const parsed = parseBibtex(bibtexInput);
      if (parsed.length === 0) {
        toast({ title: 'no_entries_found', description: 'Could not parse any BibTeX entries', variant: 'destructive' });
        return;
      }
      const startIdx = parsedPublications.length;
      setParsedPublications(prev => [...prev, ...parsed]);
      const newIndices = new Set(selectedIndices);
      const newDuplicates = new Set(duplicateIndices);
      let duplicateCount = 0;
      parsed.forEach((pub, i) => {
        const idx = startIdx + i;
        newIndices.add(idx);
        if (checkForDuplicate(pub)) { newDuplicates.add(idx); duplicateCount++; }
      });
      setSelectedIndices(newIndices);
      setDuplicateIndices(newDuplicates);
      setBibtexInput('');
      if (duplicateCount > 0) {
        toast({ title: `parsed_${parsed.length}_entries (${duplicateCount} duplicates)`, description: 'Duplicates are marked in preview' });
      } else {
        toast({ title: `parsed_${parsed.length}_entries ✨` });
      }
    } catch (error) {
      toast({ title: 'parse_error', description: (error as Error).message || 'Could not parse BibTeX', variant: 'destructive' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setBibtexInput(event.target?.result as string);
    reader.readAsText(file);
  };

  // ─── Import parsed ──────────────────────────────────────────────────────────

  const toggleSelection = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const removePublication = (index: number) => {
    setParsedPublications(prev => prev.filter((_, i) => i !== index));
    const remap = (set: Set<number>) => {
      const next = new Set<number>();
      set.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    };
    setSelectedIndices(remap);
    setDuplicateIndices(remap);
  };

  const handleImport = async () => {
    const toImport = parsedPublications
      .filter((_, i) => selectedIndices.has(i))
      .map(pub => { const { vault_id, ...clean } = pub as any; return clean; });
    if (toImport.length === 0) {
      toast({ title: 'no_papers_selected', description: 'Select at least one paper', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      if (!onImport) {
        toast({ title: 'import_unavailable', description: 'Import is not available in this context', variant: 'destructive' });
        return;
      }
      const insertedIds = await onImport(toImport, targetVaultId);
      const targetVault = vaults.find(v => v.id === targetVaultId);
      toast({ title: `imported_${insertedIds.length}_papers ✨`, description: targetVault ? `Added to ${targetVault.name}` : undefined });
      // Reset
      setParsedPublications([]);
      setSelectedIndices(new Set());
      setDoiInput('');
      setBibtexInput('');
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'import_failed', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const selectAll = () => setSelectedIndices(new Set(parsedPublications.map((_, i) => i)));
  const selectNone = () => setSelectedIndices(new Set());

  // ─── Manual entry ────────────────────────────────────────────────────────────

  const handleManualCreate = async () => {
    if (!manualForm.title?.trim()) {
      toast({ title: 'title_required', description: 'Please provide a paper title', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      const authors = manualAuthorsInput.split(',').map(a => a.trim()).filter(a => a.length > 0);
      const editor = manualEditorInput.split(',').map(e => e.trim()).filter(e => e.length > 0);
      const keywords = manualKeywordsInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
      const pub = { ...manualForm, authors, editor: editor.length > 0 ? editor : undefined, keywords: keywords.length > 0 ? keywords : undefined };
      if (onManualCreate) {
        await onManualCreate(pub, targetVaultId);
      } else if (onImport) {
        await onImport([pub], targetVaultId);
      }
      toast({ title: 'paper_created ✨', description: manualForm.title });
      setManualForm({ title: '', authors: [], year: null, journal: '', doi: '', url: '', pdf_url: '', abstract: '', publication_type: 'article', notes: '', volume: '', issue: '', pages: '', booktitle: '', chapter: '', edition: '', editor: [], howpublished: '', institution: '', number: '', organization: '', publisher: '', school: '', series: '', type: '', eid: '', isbn: '', issn: '', keywords: [] });
      setManualAuthorsInput('');
      setManualEditorInput('');
      setManualKeywordsInput('');
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'create_failed', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent forceMount className="w-full max-w-[100vw] h-full sm:h-auto sm:w-[95vw] sm:max-w-4xl sm:max-h-[90vh] p-0 border-2 bg-card/95 backdrop-blur-xl overflow-hidden flex flex-col data-[state=closed]:hidden">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
            // add_<span className="text-gradient">papers</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs sm:text-sm text-muted-foreground">
            // from_library • doi • bibtex • manual
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FlowTab)} className="p-4 sm:p-6 pt-4">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TooltipProvider delayDuration={200}>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="library" className="gap-2 text-xs sm:text-sm font-mono">
                    <Library className="w-4 h-4" />
                    <span className="hidden sm:inline">library</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Search &amp; add existing papers</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="doi" className="gap-2 text-xs sm:text-sm font-mono">
                    <Link className="w-4 h-4" />
                    <span className="hidden sm:inline">doi</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Lookup paper by DOI</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="bibtex" className="gap-2 text-xs sm:text-sm font-mono">
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">bibtex</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Paste or upload BibTeX</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="manual" className="gap-2 text-xs sm:text-sm font-mono">
                    <PenLine className="w-4 h-4" />
                    <span className="hidden sm:inline">manual</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Create entry by hand</TooltipContent></Tooltip>
              </TooltipProvider>
            </TabsList>

            {/* ─── Library tab ───────────────────────────────────── */}
            <TabsContent value="library" className="space-y-4">
              <ExistingPaperSelector
                publications={allPublications}
                vaults={vaults}
                currentVaultId={currentVaultId}
                onAddToVaults={async (pubId, vaultIds) => {
                  if (onAddToVaults) await onAddToVaults(pubId, vaultIds);
                  onOpenChange(false);
                }}
              />
            </TabsContent>

            {/* ─── DOI tab ───────────────────────────────────────── */}
            <TabsContent value="doi" className="space-y-4 min-w-0">
              <div className="space-y-2 min-w-0">
                <Label className="font-semibold font-mono">enter_doi</Label>
                <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                  <Input
                    value={doiInput}
                    onChange={(e) => setDoiInput(e.target.value)}
                    placeholder="10.1000/xyz123 or https://doi.org/..."
                    className="font-mono flex-1 text-sm w-full min-w-0"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDOILookup(); } }}
                  />
                  <Button onClick={handleDOILookup} disabled={doiLoading || !doiInput.trim()} variant="glow" className="w-full sm:w-auto font-mono">
                    {doiLoading ? <LoadingSpinner size="xs" /> : 'lookup'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">// supports doi.org URLs, DOI strings, or doi: prefix</p>
              </div>
            </TabsContent>

            {/* ─── BibTeX tab ────────────────────────────────────── */}
            <TabsContent value="bibtex" className="space-y-4 min-w-0">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-semibold font-mono">bibtex_content</Label>
                  <Button variant="outline" size="sm" className="gap-2 text-xs sm:text-sm font-mono"
                    onClick={() => document.getElementById('bib-file-input')?.click()}>
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">upload</span> .bib
                  </Button>
                  <input id="bib-file-input" type="file" accept=".bib,.txt" onChange={handleFileUpload} className="hidden" />
                </div>
                <Textarea value={bibtexInput} onChange={(e) => setBibtexInput(e.target.value)}
                  placeholder={`@article{key,\n  title = {Paper Title},\n  author = {Author Name},\n  year = {2024},\n  ...\n}`}
                  rows={6} className="font-mono text-sm w-full min-w-0" />
                <Button onClick={handleBibtexParse} disabled={!bibtexInput.trim()} variant="glow" className="w-full font-mono">
                  parse_bibtex
                </Button>
              </div>
            </TabsContent>

            {/* ─── Manual entry tab ──────────────────────────────── */}
            <TabsContent value="manual" className="space-y-4 min-w-0">
              <div className="grid gap-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">title *</Label>
                  <Input value={manualForm.title || ''} onChange={(e) => setManualForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Paper title" className="font-mono text-sm" />
                </div>
                {/* Authors */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">authors <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input value={manualAuthorsInput} onChange={(e) => setManualAuthorsInput(e.target.value)}
                    placeholder="Author 1, Author 2, ..." className="font-mono text-sm" />
                </div>
                {/* Year + Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">year</Label>
                    <Input type="number" value={manualForm.year ?? ''} onChange={(e) => setManualForm(f => ({ ...f, year: e.target.value ? parseInt(e.target.value) : null }))}
                      placeholder="2024" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">type</Label>
                    <Select value={manualForm.publication_type || 'article'} onValueChange={(v) => setManualForm(f => ({ ...f, publication_type: v }))}>
                      <SelectTrigger className="text-sm font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PUBLICATION_TYPES.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Journal / venue */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">journal / venue</Label>
                  <Input value={manualForm.journal || ''} onChange={(e) => setManualForm(f => ({ ...f, journal: e.target.value }))}
                    placeholder="Journal name" className="font-mono text-sm" />
                </div>
                {/* Volume / Issue / Pages */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">volume</Label>
                    <Input value={manualForm.volume || ''} onChange={(e) => setManualForm(f => ({ ...f, volume: e.target.value }))}
                      placeholder="12" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">issue</Label>
                    <Input value={manualForm.issue || ''} onChange={(e) => setManualForm(f => ({ ...f, issue: e.target.value }))}
                      placeholder="3" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">pages</Label>
                    <Input value={manualForm.pages || ''} onChange={(e) => setManualForm(f => ({ ...f, pages: e.target.value }))}
                      placeholder="1-10" className="font-mono text-sm" />
                  </div>
                </div>
                {/* DOI + URL */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">doi</Label>
                    <Input value={manualForm.doi || ''} onChange={(e) => setManualForm(f => ({ ...f, doi: e.target.value }))}
                      placeholder="10.xxxx/..." className="font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">url</Label>
                    <Input value={manualForm.url || ''} onChange={(e) => setManualForm(f => ({ ...f, url: e.target.value }))}
                      placeholder="https://..." className="font-mono text-sm" />
                  </div>
                </div>
                {/* PDF URL */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">pdf_url</Label>
                  <Input value={manualForm.pdf_url || ''} onChange={(e) => setManualForm(f => ({ ...f, pdf_url: e.target.value }))}
                    placeholder="link_to_pdf" className="font-mono text-sm" />
                </div>
                {/* Abstract */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">abstract</Label>
                  <Textarea value={manualForm.abstract || ''} onChange={(e) => setManualForm(f => ({ ...f, abstract: e.target.value }))}
                    placeholder="Paper abstract..." rows={3} className="font-mono text-sm" />
                </div>

                {/* ─── Publication type-dependent fields ──────────── */}

                {/* Editor (books, collections, proceedings) */}
                {['book', 'inbook', 'incollection', 'proceedings'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">editor <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                    <Input value={manualEditorInput} onChange={(e) => setManualEditorInput(e.target.value)}
                      placeholder="Editor 1, Editor 2, ..." className="font-mono text-sm" />
                  </div>
                )}

                {/* Publisher (books, proceedings, manuals) */}
                {['book', 'booklet', 'inbook', 'incollection', 'proceedings', 'manual'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">publisher</Label>
                    <Input value={manualForm.publisher || ''} onChange={(e) => setManualForm(f => ({ ...f, publisher: e.target.value }))}
                      placeholder="publisher_name" className="font-mono text-sm" />
                  </div>
                )}

                {/* Booktitle (inbook, incollection, inproceedings) */}
                {['inbook', 'incollection', 'inproceedings', 'conference'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">booktitle</Label>
                    <Input value={manualForm.booktitle || ''} onChange={(e) => setManualForm(f => ({ ...f, booktitle: e.target.value }))}
                      placeholder="title_of_book_or_proceedings" className="font-mono text-sm" />
                  </div>
                )}

                {/* Series (books, inbooks, proceedings) */}
                {['book', 'inbook', 'incollection', 'proceedings'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">series</Label>
                    <Input value={manualForm.series || ''} onChange={(e) => setManualForm(f => ({ ...f, series: e.target.value }))}
                      placeholder="series_name" className="font-mono text-sm" />
                  </div>
                )}

                {/* Edition (books, manuals) */}
                {['book', 'inbook', 'manual'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">edition</Label>
                    <Input value={manualForm.edition || ''} onChange={(e) => setManualForm(f => ({ ...f, edition: e.target.value }))}
                      placeholder="Second, Third, etc." className="font-mono text-sm" />
                  </div>
                )}

                {/* Chapter (inbook) */}
                {manualForm.publication_type === 'inbook' && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">chapter</Label>
                    <Input value={manualForm.chapter || ''} onChange={(e) => setManualForm(f => ({ ...f, chapter: e.target.value }))}
                      placeholder="3" className="font-mono text-sm" />
                  </div>
                )}

                {/* School (theses) */}
                {['mastersthesis', 'phdthesis'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">school</Label>
                    <Input value={manualForm.school || ''} onChange={(e) => setManualForm(f => ({ ...f, school: e.target.value }))}
                      placeholder="university_name" className="font-mono text-sm" />
                  </div>
                )}

                {/* Institution (techreport) */}
                {manualForm.publication_type === 'techreport' && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">institution</Label>
                    <Input value={manualForm.institution || ''} onChange={(e) => setManualForm(f => ({ ...f, institution: e.target.value }))}
                      placeholder="institution_name" className="font-mono text-sm" />
                  </div>
                )}

                {/* Organization (manuals, proceedings) */}
                {['manual', 'proceedings'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">organization</Label>
                    <Input value={manualForm.organization || ''} onChange={(e) => setManualForm(f => ({ ...f, organization: e.target.value }))}
                      placeholder="organization_name" className="font-mono text-sm" />
                  </div>
                )}

                {/* How Published (booklet, misc) */}
                {['booklet', 'misc'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">howpublished</Label>
                    <Input value={manualForm.howpublished || ''} onChange={(e) => setManualForm(f => ({ ...f, howpublished: e.target.value }))}
                      placeholder="how_it_was_published" className="font-mono text-sm" />
                  </div>
                )}

                {/* Type field (theses, techreport) */}
                {['mastersthesis', 'phdthesis', 'techreport'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">type <span className="text-muted-foreground text-xs">(e.g., PhD_dissertation)</span></Label>
                    <Input value={manualForm.type || ''} onChange={(e) => setManualForm(f => ({ ...f, type: e.target.value }))}
                      placeholder="type_description" className="font-mono text-sm" />
                  </div>
                )}

                {/* ISBN (books) */}
                {['book', 'inbook', 'incollection', 'proceedings', 'manual'].includes(manualForm.publication_type || '') && (
                  <div className="space-y-2">
                    <Label className="font-semibold font-mono">isbn</Label>
                    <Input value={manualForm.isbn || ''} onChange={(e) => setManualForm(f => ({ ...f, isbn: e.target.value }))}
                      placeholder="978-3-16-148410-0" className="font-mono text-sm" />
                  </div>
                )}

                {/* ISSN + EID (articles) */}
                {manualForm.publication_type === 'article' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-semibold font-mono">issn</Label>
                      <Input value={manualForm.issn || ''} onChange={(e) => setManualForm(f => ({ ...f, issn: e.target.value }))}
                        placeholder="1234-5678" className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold font-mono">eid</Label>
                      <Input value={manualForm.eid || ''} onChange={(e) => setManualForm(f => ({ ...f, eid: e.target.value }))}
                        placeholder="electronic_id" className="font-mono text-sm" />
                    </div>
                  </div>
                )}

                {/* Keywords */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">keywords <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input value={manualKeywordsInput} onChange={(e) => setManualKeywordsInput(e.target.value)}
                    placeholder="machine_learning, neural_networks, ..." className="font-mono text-sm" />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">notes</Label>
                  <Textarea value={manualForm.notes || ''} onChange={(e) => setManualForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Additional notes..." rows={2} className="font-mono text-sm" />
                </div>
              </div>

              {/* Vault selector for manual */}
              <div className="space-y-2">
                <Label className="font-semibold text-sm font-mono">add_to_vault</Label>
                <Select value={targetVaultId || 'none'} onValueChange={(v) => setTargetVaultId(v === 'none' ? null : v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="select_vault" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">no_vault</SelectItem>
                    {vaults.map(vault => (
                      <SelectItem key={vault.id} value={vault.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-md" style={{ backgroundColor: vault.color }} />
                          {vault.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-mono">cancel</Button>
                <Button variant="glow" onClick={handleManualCreate} disabled={importing || !manualForm.title?.trim()} className="w-full sm:w-auto font-mono">
                  {importing ? <><LoadingSpinner size="xs" className="mr-2" />creating...</> : 'create_paper'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* ─── Parsed publications list (shared DOI + BibTeX) ───── */}
          {parsedPublications.length > 0 && (activeTab === 'doi' || activeTab === 'bibtex') && (
            <div className="px-4 sm:px-6 pb-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="font-semibold text-sm font-mono">
                  parsed ({selectedIndices.size}/{parsedPublications.length})
                </Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs px-2 font-mono">all</Button>
                  <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs px-2 font-mono">none</Button>
                </div>
              </div>

              {duplicateIndices.size > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2">
                  <p className="text-xs font-mono text-orange-600 dark:text-orange-400">
                    <span className="text-orange-500 font-bold">&gt;&gt;</span> warning: {duplicateIndices.size} duplicate{duplicateIndices.size > 1 ? 's' : ''} detected
                  </p>
                </div>
              )}

              <div className="border-2 rounded-lg max-h-40 overflow-y-auto">
                <div className="p-2 space-y-2">
                  {parsedPublications.map((pub, index) => {
                    const isDuplicate = duplicateIndices.has(index);
                    return (
                      <div key={index}
                        className={`relative flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-colors cursor-pointer ${
                          isDuplicate ? 'bg-orange-500/10 border-orange-500/50'
                          : selectedIndices.has(index) ? 'bg-primary/10 border-primary/50'
                          : 'bg-muted/30 border-transparent hover:border-border'
                        }`}
                        onClick={() => toggleSelection(index)}
                      >
                        {isDuplicate && (
                          <span className="absolute -top-2 left-10 text-[12px] px-2 py-0 rounded bg-orange-500 text-white font-mono font-bold shadow-md z-10">DUPE</span>
                        )}
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          selectedIndices.has(index) ? 'bg-primary border-primary' : 'border-muted-foreground'
                        }`}>
                          {selectedIndices.has(index) && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs sm:text-sm line-clamp-2">{pub.title || 'Untitled'}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {pub.authors?.slice(0, 2).join(', ')}{pub.authors && pub.authors.length > 2 ? '...' : ''} • {pub.year || 'n.d.'}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="flex-shrink-0 h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removePublication(index); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Import options */}
              <div className="space-y-2">
                <Label className="font-semibold text-sm font-mono">import_to_vault</Label>
                <Select value={targetVaultId || 'none'} onValueChange={(v) => setTargetVaultId(v === 'none' ? null : v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="select_vault" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">no_vault</SelectItem>
                    {vaults.map(vault => (
                      <SelectItem key={vault.id} value={vault.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-md" style={{ backgroundColor: vault.color }} />
                          {vault.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Import button */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t-2 border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-mono">cancel</Button>
                <Button variant="glow" onClick={handleImport} disabled={importing || selectedIndices.size === 0} className="w-full sm:w-auto font-mono">
                  {importing ? <><LoadingSpinner size="xs" className="mr-2" />importing...</> : `import_${selectedIndices.size}_paper${selectedIndices.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
