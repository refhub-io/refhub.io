import { useState, useCallback, useRef } from 'react';
import { Publication, Vault, PUBLICATION_TYPES } from '@/types/database';
import { cn } from '@/lib/utils';
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
import { parseBibtex, fetchDOIMetadata, generateBibtexKey } from '@/lib/bibtex';
import { orderImportPreviewIndices } from '@/lib/importOrdering';
import { DUPE_PRESETS, scorePair } from '@/lib/dupeDetection';
import { FileText, Link, Upload, Check, X, Library, PenLine } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { ExistingPaperSelector } from './ExistingPaperSelector';
import { BrowserExtensionInstallCard } from './BrowserExtensionInstallCard';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { showError } from '@/lib/toast';
import { supabase } from '@/integrations/supabase/client';
import { formatVaultPublication } from '@/lib/formatVaultPublication';
import { findRelationshipSuggestions, type RelationshipSuggestion } from '@/lib/relationshipSuggestions';
import { RelationshipSuggestionsList, suggestionKey } from './RelationshipSuggestionsList';

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
  updatePdfAsset?: (vaultPublicationId: string, url: string | null) => Promise<void>;
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
  updatePdfAsset,
}: AddImportDialogProps) {
  const { toast } = useToast();
  const doiLookupRef = useRef<HTMLDivElement>(null);
  const bibtexParseRef = useRef<HTMLDivElement>(null);
  const importActionGroupRef = useRef<HTMLDivElement>(null);
  const manualActionGroupRef = useRef<HTMLDivElement>(null);
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
  const [manualDrivePdf, setManualDrivePdf] = useState('');

  // Import options
  const [targetVaultId, setTargetVaultId] = useState<string | null>(currentVaultId);
  const [importing, setImporting] = useState(false);

  const { user } = useAuth();

  // Entry point 2: after importing exactly one DOI-bearing paper into a
  // vault (never for a genuine multi-paper batch — that's the bulk-import
  // case entry point 2 is explicitly excluded from, to avoid overloading
  // the provider), check it against that vault's publications before
  // closing. This dialog's DialogContent uses forceMount (stays mounted
  // across opens, only hidden via CSS), so this state must be reset
  // explicitly at the start of each import — never left to a remount.
  const [relCheckVaultName, setRelCheckVaultName] = useState<string | null>(null);
  const [relCheckSuggestions, setRelCheckSuggestions] = useState<RelationshipSuggestion[]>([]);
  const [relCheckLoading, setRelCheckLoading] = useState(false);
  const [relCheckApprovingKey, setRelCheckApprovingKey] = useState<string | null>(null);

  const resetRelationshipCheck = () => {
    setRelCheckVaultName(null);
    setRelCheckSuggestions([]);
    setRelCheckLoading(false);
    setRelCheckApprovingKey(null);
  };

  const handleApproveRelCheckSuggestion = async (suggestion: RelationshipSuggestion) => {
    if (!user) return;
    setRelCheckApprovingKey(suggestionKey(suggestion));
    try {
      const { error } = await supabase.from('publication_relations').insert({
        publication_id: suggestion.sourcePublicationId,
        related_publication_id: suggestion.targetPublicationId,
        relation_type: 'cites',
        created_by: user.id,
      });
      if (error) {
        if (error.code === '23505') {
          showError('Already linked', 'These papers are already linked.');
        } else if (error.code === '42501' || error.message?.includes('row-level security')) {
          showError('Permission denied', "You don't have permission to link papers in this vault.");
        } else {
          showError('Could not save relationship', error.message);
        }
        return;
      }
      setRelCheckSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== suggestionKey(suggestion)));
    } finally {
      setRelCheckApprovingKey(null);
    }
  };

  const handleDismissRelCheckSuggestion = (suggestion: RelationshipSuggestion) => {
    setRelCheckSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== suggestionKey(suggestion)));
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  // Uses the strict preset (title-heavy, 0.9 threshold): the balanced preset factors in
  // authors+year+venue, so any title similarity ≥0.5 alone crosses its 0.75 threshold,
  // false-flagging distinct series papers from the same group/venue/year as duplicates.
  const checkForDuplicate = useCallback(
    (newPub: Partial<Publication>) => {
      const preset = DUPE_PRESETS.strict;
      return allPublications.find((pub) => scorePair(newPub, pub, preset).score >= preset.threshold);
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
        toast({ title: 'Possible duplicate found', description: `"${metadata.title}" looks like a paper already in your library. Review the highlighted preview item before importing.`, feedbackSeverity: 'warning', source: doiLookupRef });
      } else {
        toast({ title: 'DOI resolved ✨', description: metadata.title, source: doiLookupRef });
      }
      setDoiInput('');
    } catch (error) {
      toast({ title: 'DOI lookup failed', description: (error as Error).message || 'RefHub could not resolve that DOI. Check the DOI string or paste a doi.org URL and try again.', variant: 'destructive', feedbackSeverity: 'error', source: doiLookupRef });
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
        toast({ title: 'No BibTeX entries found', description: 'RefHub could not find any complete BibTeX records in the pasted text. Check the format and try again.', variant: 'destructive', feedbackSeverity: 'error', source: bibtexParseRef });
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
        toast({ title: `Parsed ${parsed.length} entries`, description: `${duplicateCount} possible duplicate${duplicateCount === 1 ? '' : 's'} marked in the preview. Review them before importing.`, feedbackSeverity: 'warning', source: bibtexParseRef });
      } else {
        toast({ title: `Parsed ${parsed.length} entries ✨`, source: bibtexParseRef });
      }
    } catch (error) {
      toast({ title: 'BibTeX parse failed', description: (error as Error).message || 'RefHub could not parse the BibTeX content. Check for missing braces, commas, or entry types.', variant: 'destructive', feedbackSeverity: 'error', source: bibtexParseRef });
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
      .map(pub => { const { vault_id: _vaultId, ...clean } = pub as Partial<Publication> & { vault_id?: string }; return clean; });
    if (toImport.length === 0) {
      toast({ title: 'No papers selected', description: 'Select at least one parsed paper from the preview before importing.', variant: 'destructive', feedbackSeverity: 'error', source: importActionGroupRef });
      return;
    }
    resetRelationshipCheck();
    setImporting(true);
    try {
      if (!onImport) {
        toast({ title: 'Import is unavailable here', description: 'This dialog was opened without an import handler. Close it and try importing from a vault or the dashboard.', variant: 'destructive', feedbackSeverity: 'error', source: importActionGroupRef });
        return;
      }
      const insertedIds = await onImport(toImport, targetVaultId);
      const targetVault = vaults.find(v => v.id === targetVaultId);
      toast({ title: `Imported ${insertedIds.length} paper${insertedIds.length === 1 ? '' : 's'} ✨`, description: targetVault ? `Added to ${targetVault.name}` : undefined, source: importActionGroupRef });
      // Reset
      setParsedPublications([]);
      setSelectedIndices(new Set());
      setDoiInput('');
      setBibtexInput('');

      // Entry point 2 — deliberately scoped to a single imported paper, never
      // a genuine batch: checking N papers against the vault (and each other)
      // is exactly the overload risk this feature was told to stay away from
      // for bulk import.
      const singleDoi = toImport.length === 1 ? toImport[0].doi?.trim() : null;
      const canonicalPublicationId = insertedIds[0];
      if (toImport.length !== 1 || !targetVaultId || !singleDoi || !canonicalPublicationId) {
        onOpenChange(false);
        return;
      }

      setRelCheckVaultName(targetVault?.name ?? 'this vault');
      setRelCheckLoading(true);
      try {
        // handleBulkImport (both the vault and dashboard implementations)
        // returns publications.id, not the vault_publications.id the copy
        // actually got via the copy_publication_to_vault RPC (whose own
        // return value is discarded) — resolve the real copy id first, same
        // as the Library tab's onAddToVaults path.
        const { data: newCopy } = await supabase
          .from('vault_publications')
          .select('id')
          .eq('vault_id', targetVaultId)
          .eq('original_publication_id', canonicalPublicationId)
          .maybeSingle();

        if (!newCopy) {
          setRelCheckSuggestions([]);
          return;
        }

        const { data: vaultPubsData } = await supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', targetVaultId);
        const vaultPublications = (vaultPubsData || []).map(formatVaultPublication);

        const found = await findRelationshipSuggestions(
          { id: newCopy.id, doi: singleDoi, title: toImport[0].title ?? '' },
          vaultPublications,
          [],
        );
        setRelCheckSuggestions(found);
      } catch (error) {
        setRelCheckSuggestions([]);
        showError('Could not check relationships', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setRelCheckLoading(false);
      }
    } catch (error) {
      toast({ title: 'Import failed', description: (error as Error).message || 'RefHub could not import the selected papers. Nothing was removed from the preview.', variant: 'destructive', feedbackSeverity: 'error', source: importActionGroupRef });
    } finally {
      setImporting(false);
    }
  };

  const selectAll = () => setSelectedIndices(new Set(parsedPublications.map((_, i) => i)));
  const selectNone = () => setSelectedIndices(new Set());

  const orderedPreviewIndices = orderImportPreviewIndices(
    parsedPublications.length,
    duplicateIndices,
  );

  // ─── Manual entry ────────────────────────────────────────────────────────────

  const handleManualCreate = async () => {
    if (!manualForm.title?.trim()) {
      toast({ title: 'Paper title required', description: 'Add a title before creating a manual paper entry.', variant: 'destructive', feedbackSeverity: 'error', source: manualActionGroupRef });
      return;
    }
    setImporting(true);
    try {
      const authors = manualAuthorsInput.split(',').map(a => a.trim()).filter(a => a.length > 0);
      const editor = manualEditorInput.split(',').map(e => e.trim()).filter(e => e.length > 0);
      const keywords = manualKeywordsInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
      const pub = { ...manualForm, authors, editor: editor.length > 0 ? editor : undefined, keywords: keywords.length > 0 ? keywords : undefined };
      let newId: string | null = null;
      if (onManualCreate) {
        newId = await onManualCreate(pub, targetVaultId);
      } else if (onImport) {
        const ids = await onImport([pub], targetVaultId);
        newId = ids?.[0] ?? null;
      }

      if (newId && manualDrivePdf.trim() && updatePdfAsset) {
        await updatePdfAsset(newId, manualDrivePdf.trim());
      }

      toast({ title: 'Paper created ✨', description: manualForm.title, source: manualActionGroupRef });
      setManualForm({ title: '', authors: [], year: null, journal: '', doi: '', url: '', pdf_url: '', abstract: '', publication_type: 'article', notes: '', volume: '', issue: '', pages: '', booktitle: '', chapter: '', edition: '', editor: [], howpublished: '', institution: '', number: '', organization: '', publisher: '', school: '', series: '', type: '', eid: '', isbn: '', issn: '', keywords: [] });
      setManualAuthorsInput('');
      setManualEditorInput('');
      setManualKeywordsInput('');
      setManualDrivePdf('');
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Could not create paper', description: (error as Error).message || 'RefHub could not save the manual paper entry. Your form values are still here.', variant: 'destructive', feedbackSeverity: 'error', source: manualActionGroupRef });
    } finally {
      setImporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset on every close path (X, Escape, outside click, "done") —
        // not just "done" — since this dialog stays mounted (forceMount)
        // across opens and would otherwise show the same paper's stale
        // review screen the next time it's opened, whatever tab is active.
        if (!next) resetRelationshipCheck();
        onOpenChange(next);
      }}
    >
      <DialogContent forceMount className="dialog-mobile max-w-[100vw] p-0 border-2 bg-card/95 backdrop-blur-xl overflow-hidden flex flex-col gap-0 min-h-0 sm:rounded-2xl sm:h-auto sm:w-[95vw] sm:max-w-4xl sm:max-h-[90vh] data-[state=closed]:hidden">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
            // add_<span className="text-gradient">papers</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs sm:text-sm text-muted-foreground">
            // from_library • doi • bibtex • manual
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {relCheckVaultName ? (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold font-mono">check_relationships</Label>
                <p className="text-xs text-muted-foreground font-mono">
                  // checking "{relCheckVaultName}" for citation relationships
                </p>
              </div>

              {relCheckLoading ? (
                <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground font-mono">
                  <LoadingSpinner size="xs" />
                  checking_relationships...
                </div>
              ) : relCheckSuggestions.length > 0 ? (
                <RelationshipSuggestionsList
                  suggestions={relCheckSuggestions}
                  approvingKey={relCheckApprovingKey}
                  onApprove={handleApproveRelCheckSuggestion}
                  onDismiss={handleDismissRelCheckSuggestion}
                />
              ) : (
                <p className="text-xs text-muted-foreground font-mono py-4">
                  // no citation relationships found
                </p>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="glow"
                  onClick={() => {
                    resetRelationshipCheck();
                    onOpenChange(false);
                  }}
                  disabled={relCheckLoading}
                >
                  done
                </Button>
              </div>
            </div>
          ) : (
          <>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FlowTab)} className="p-4 sm:p-6 pt-4 overflow-x-hidden">
            <div className="mb-4">
              <BrowserExtensionInstallCard />
            </div>
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TooltipProvider delayDuration={200}>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="library" className={cn("gap-2 text-xs sm:text-sm font-mono", activeTab === 'library' && "bg-primary text-primary-foreground shadow-md")}>
                    <Library className="w-4 h-4" />
                    <span className="hidden sm:inline">library</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Search &amp; add existing papers</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="doi" className={cn("gap-2 text-xs sm:text-sm font-mono", activeTab === 'doi' && "bg-primary text-primary-foreground shadow-md")}>
                    <Link className="w-4 h-4" />
                    <span className="hidden sm:inline">doi</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Lookup paper by DOI</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="bibtex" className={cn("gap-2 text-xs sm:text-sm font-mono", activeTab === 'bibtex' && "bg-primary text-primary-foreground shadow-md")}>
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">bibtex</span>
                  </TabsTrigger>
                </TooltipTrigger><TooltipContent>Paste or upload BibTeX</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <TabsTrigger value="manual" className={cn("gap-2 text-xs sm:text-sm font-mono", activeTab === 'manual' && "bg-primary text-primary-foreground shadow-md")}>
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
                }}
                onDone={() => onOpenChange(false)}
                open={open}
              />
            </TabsContent>

            {/* ─── DOI tab ───────────────────────────────────────── */}
            <TabsContent value="doi" className="space-y-4 min-w-0">
              <div className="space-y-2 min-w-0">
                <Label className="font-semibold font-mono">enter_doi</Label>
                <div ref={doiLookupRef} className="flex w-full flex-col gap-2">
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
                <div ref={bibtexParseRef} className="flex w-full flex-col gap-2">
                  <Button onClick={handleBibtexParse} disabled={!bibtexInput.trim()} variant="glow" className="w-full font-mono">
                    parse_bibtex
                  </Button>
                </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {/* Publisher PDF */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">publisher_pdf</Label>
                  <Input
                    value={manualForm.pdf_url || ''}
                    onChange={(e) => setManualForm(f => ({ ...f, pdf_url: e.target.value }))}
                    placeholder="link_to_pdf"
                    className="font-mono text-sm"
                  />
                </div>
                {/* Drive PDF */}
                <div className="space-y-2">
                  <Label className="font-semibold font-mono">drive_pdf</Label>
                  <Input
                    value={manualDrivePdf}
                    onChange={(e) => setManualDrivePdf(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    className="font-mono text-sm"
                  />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div ref={manualActionGroupRef} className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-mono">cancel</Button>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  <Button variant="glow" onClick={handleManualCreate} disabled={importing || !manualForm.title?.trim()} className="w-full sm:w-auto font-mono">
                    {importing ? <><LoadingSpinner size="xs" className="mr-2" />creating...</> : 'create_paper'}
                  </Button>
                </div>
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
                  {orderedPreviewIndices.map((index) => {
                    const pub = parsedPublications[index];
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
              <div ref={importActionGroupRef} className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t-2 border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-mono">cancel</Button>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  <Button variant="glow" onClick={handleImport} disabled={importing || selectedIndices.size === 0} className="w-full sm:w-auto font-mono">
                    {importing ? <><LoadingSpinner size="xs" className="mr-2" />importing...</> : `import_${selectedIndices.size}_paper${selectedIndices.size !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
