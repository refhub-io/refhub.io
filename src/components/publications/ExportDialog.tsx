import { useRef, useState, useMemo, useEffect } from 'react';
import { Publication, Tag, PublicationTag } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Copy, Check, BookOpen, Table } from 'lucide-react';
import { exportMultipleToBibtexWithFields, publicationToBibtex, downloadBibtex, BibtexField } from '@/lib/bibtex';
import { formatAPA, formatMultipleAPA, formatCSV, getCsvRows, buildTagKeywords, downloadTextFile, CsvField, ALL_CSV_FIELDS } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import { KbdHint } from '@/components/ui/KbdHint';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  vaultName?: string;
  tags?: Tag[];
  publicationTags?: PublicationTag[];
}

const BIBTEX_FIELDS: { key: BibtexField; label: string; description: string }[] = [
  { key: 'title', label: 'title', description: 'publication title' },
  { key: 'author', label: 'authors', description: 'author names' },
  { key: 'year', label: 'year', description: 'publication year' },
  { key: 'journal', label: 'journal', description: 'journal or conference' },
  { key: 'volume', label: 'volume', description: 'volume number' },
  { key: 'number', label: 'issue', description: 'issue or number' },
  { key: 'pages', label: 'pages', description: 'page range' },
  { key: 'doi', label: 'doi', description: 'digital object identifier' },
  { key: 'url', label: 'url', description: 'web address' },
  { key: 'abstract', label: 'abstract', description: 'paper abstract' },
];

const DEFAULT_SELECTED: BibtexField[] = ['title', 'author', 'year', 'journal', 'doi'];

const CSV_PREVIEW_ROW_LIMIT = 5;

const CSV_FIELDS: { key: CsvField; label: string; description: string }[] = [
  { key: 'title', label: 'title', description: 'publication title' },
  { key: 'authors', label: 'authors', description: 'author names' },
  { key: 'year', label: 'year', description: 'publication year' },
  { key: 'venue', label: 'venue', description: 'journal or conference' },
  { key: 'doi', label: 'doi', description: 'digital object identifier' },
  { key: 'url', label: 'url', description: 'web address' },
  { key: 'abstract', label: 'abstract', description: 'paper abstract' },
  { key: 'tags', label: 'tags', description: 'hierarchical tag path' },
  { key: 'notes', label: 'notes', description: 'your notes' },
];

type ExportFormat = 'bibtex' | 'apa' | 'csv';

/**
 * UTF-8 byte order mark. Excel on Windows ignores the MIME charset of a
 * downloaded .csv and falls back to the system codepage, mangling diacritics
 * (Müller, Zaïdi, Łukasiewicz). Prepending the BOM forces UTF-8 detection.
 * Intentionally applied only to the download path — `formatCSV` stays BOM-free
 * so the <pre> preview and copy-to-clipboard output are not polluted.
 */
const CSV_BOM = '\uFEFF';

export function ExportDialog({
  open,
  onOpenChange,
  publications,
  vaultName,
  tags,
  publicationTags,
}: ExportDialogProps) {
  const { toast } = useToast();
  const footerActionGroupRef = useRef<HTMLDivElement>(null);
  const [selectedFields, setSelectedFields] = useState<BibtexField[]>(DEFAULT_SELECTED);
  const [selectedCsvFields, setSelectedCsvFields] = useState<CsvField[]>(ALL_CSV_FIELDS);
  const [format, setFormat] = useState<ExportFormat>('bibtex');
  const [includeHierarchicalTags, setIncludeHierarchicalTags] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [copied, setCopied] = useState(false);

  // Push/pop keyboard context when export dialog opens/closes
  const kbCtx = useKeyboardContext();
  useEffect(() => {
    if (open) {
      kbCtx.saveFocus();
      kbCtx.pushContext('export');
    } else {
      kbCtx.popContext();
      kbCtx.restoreFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleField = (field: BibtexField) => {
    setSelectedFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const selectAll = () => {
    setSelectedFields(BIBTEX_FIELDS.map(f => f.key));
  };

  const selectNone = () => {
    setSelectedFields([]);
  };

  const toggleCsvField = (field: CsvField) => {
    setSelectedCsvFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const selectAllCsv = () => {
    setSelectedCsvFields(CSV_FIELDS.map(f => f.key));
  };

  const selectNoneCsv = () => {
    setSelectedCsvFields([]);
  };

  // Pre-indexed publicationTags -> tagIds, built once rather than re-filtering
  // the full array per publication (was O(publications × publicationTags)).
  const tagIdsByPublicationId = useMemo(() => {
    if (!publicationTags) return undefined;
    const map = new Map<string, string[]>();
    const addTo = (key: string | null | undefined, tagId: string) => {
      if (!key) return;
      const list = map.get(key);
      if (list) list.push(tagId);
      else map.set(key, [tagId]);
    };
    for (const pt of publicationTags) {
      addTo(pt.publication_id, pt.tag_id);
      addTo(pt.vault_publication_id, pt.tag_id);
    }
    return map;
  }, [publicationTags]);

  // Build BibTeX content with optional tags and notes
  const buildBibtexContent = (): string => {
    return publications.map(pub => {
      let entry = publicationToBibtex(pub, selectedFields);

      // Inject hierarchical tags as keywords if enabled
      if (includeHierarchicalTags && tags && tagIdsByPublicationId) {
        const pubTagIds = tagIdsByPublicationId.get(pub.id) ?? [];
        const keywords = buildTagKeywords(pubTagIds, tags);
        if (keywords) {
          // Insert keywords before closing brace
          entry = entry.replace(/\n\}$/, `,\n  keywords = {${keywords}}\n}`);
        }
      }

      // Inject notes if enabled
      if (includeNotes && pub.notes) {
        const sanitizedNotes = pub.notes.replace(/[{}]/g, '');
        entry = entry.replace(/\n\}$/, `,\n  note = {${sanitizedNotes}}\n}`);
      }

      return entry;
    }).join('\n\n');
  };

  // APA preview text
  const apaContent = useMemo(() => {
    return formatMultipleAPA(publications);
  }, [publications]);

  // Tag label lookup, shared by CSV export
  const tagsByPublicationId = useMemo(() => {
    if (!tags || !tagIdsByPublicationId) return undefined;
    const map: Record<string, string> = {};
    for (const pub of publications) {
      const pubTagIds = tagIdsByPublicationId.get(pub.id) ?? [];
      const label = buildTagKeywords(pubTagIds, tags);
      if (label) map[pub.id] = label;
    }
    return map;
  }, [publications, tags, tagIdsByPublicationId]);

  const csvContent = useMemo(
    () => formatCSV(publications, selectedCsvFields, tagsByPublicationId),
    [publications, selectedCsvFields, tagsByPublicationId]
  );

  // Preview only ever shows a handful of rows as a readable table -- the raw
  // CSV text (with its escaping/quoting) is what actually gets copied/downloaded.
  const csvPreviewRows = useMemo(
    () => getCsvRows(publications.slice(0, CSV_PREVIEW_ROW_LIMIT), selectedCsvFields, tagsByPublicationId),
    [publications, selectedCsvFields, tagsByPublicationId]
  );

  const handleBibtexExport = () => {
    if (publications.length === 0 || selectedFields.length === 0) return;

    const filename = vaultName
      ? `${vaultName.toLowerCase().replace(/\s+/g, '-')}.bib`
      : 'references.bib';

    const content = buildBibtexContent();
    downloadBibtex(content, filename);
  };

  const handleAPAExport = () => {
    if (publications.length === 0) return;

    const filename = vaultName
      ? `${vaultName.toLowerCase().replace(/\s+/g, '-')}-apa.txt`
      : 'references-apa.txt';

    downloadTextFile(apaContent, filename);
  };

  const handleCSVExport = () => {
    if (publications.length === 0 || selectedCsvFields.length === 0) return;

    const filename = vaultName
      ? `${vaultName.toLowerCase().replace(/\s+/g, '-')}.csv`
      : 'references.csv';

    downloadTextFile(CSV_BOM + csvContent, filename, 'text/csv;charset=utf-8');
  };

  const isFieldSelectionEmpty =
    (format === 'bibtex' && selectedFields.length === 0) ||
    (format === 'csv' && selectedCsvFields.length === 0);

  const handleCopyToClipboard = async () => {
    const content = format === 'bibtex' ? buildBibtexContent() : format === 'apa' ? apaContent : csvContent;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({ title: 'Copied to clipboard', source: footerActionGroupRef });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'RefHub could not copy the export to your clipboard. Download the file instead, or allow clipboard access and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: footerActionGroupRef,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-mobile max-w-[100vw] sm:rounded-2xl sm:h-auto sm:w-[95vw] sm:max-w-lg sm:max-h-[90vh] flex flex-col overflow-hidden border-2 bg-card/95 backdrop-blur-xl p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 font-mono text-xl sm:text-2xl font-bold">
            // export_references
            <KbdHint shortcut="Ctrl+E" className="ml-auto" size="sm" />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 min-w-0 flex flex-col">
          <div className="flex items-center justify-between min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground font-mono">
              // exporting <span className="font-semibold text-foreground">{publications.length}</span> publication{publications.length !== 1 ? 's' : ''}
              {vaultName && <span> from <span className="font-semibold text-foreground truncate">{vaultName}</span></span>}
            </p>
          </div>

          <Tabs
            value={format}
            onValueChange={(v) => setFormat(v as ExportFormat)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-3 font-mono">
              <TabsTrigger value="bibtex" className="gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                BibTeX
              </TabsTrigger>
              <TabsTrigger value="apa" className="gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                APA
              </TabsTrigger>
              <TabsTrigger value="csv" className="gap-1.5">
                <Table className="w-3.5 h-3.5" />
                CSV
              </TabsTrigger>
            </TabsList>

            {/* BibTeX tab */}
            <TabsContent value="bibtex" className="flex-1 overflow-auto space-y-4 mt-4">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs sm:text-sm font-medium font-mono">select fields to include:</Label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7 px-2 font-mono">
                      all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs h-7 px-2 font-mono">
                      none
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-muted/50 rounded-lg border border-border min-w-0">
                  {BIBTEX_FIELDS.map(field => (
                    <label
                      key={field.key}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer transition-colors min-w-0"
                    >
                      <Checkbox
                        checked={selectedFields.includes(field.key)}
                        onCheckedChange={() => toggleField(field.key)}
                        className="shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium">{field.label}</span>
                        <span className="text-xs text-muted-foreground">{field.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* BibTeX-specific options */}
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
                <Label className="text-xs font-medium font-mono block mb-2">options:</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeHierarchicalTags}
                    onCheckedChange={(checked) => setIncludeHierarchicalTags(checked === true)}
                    disabled={!tags || !publicationTags}
                  />
                  <span className="text-sm">Include hierarchical tags as keywords</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeNotes}
                    onCheckedChange={(checked) => setIncludeNotes(checked === true)}
                  />
                  <span className="text-sm">Include notes</span>
                </label>
              </div>

              {selectedFields.length === 0 && (
                <p className="text-sm text-destructive text-center font-mono">
                  // please select at least one field
                </p>
              )}
            </TabsContent>

            {/* APA tab */}
            <TabsContent value="apa" className="flex-1 overflow-hidden flex flex-col space-y-3 mt-4">
              <Label className="text-xs sm:text-sm font-medium font-mono">preview:</Label>
              <ScrollArea className="flex-1 max-h-[40vh] border rounded-lg bg-muted/30 p-3">
                <div className="space-y-3 font-mono text-sm leading-relaxed">
                  {publications.map((pub) => (
                    <p key={pub.id} className="break-words" style={{ textIndent: '-2em', paddingLeft: '2em' }}>
                      {formatAPA(pub)}
                    </p>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground font-mono">
                // APA 7th edition style — ready for copy/paste
              </p>
            </TabsContent>

            {/* CSV tab */}
            <TabsContent value="csv" className="flex-1 overflow-auto space-y-4 mt-4">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs sm:text-sm font-medium font-mono">select fields to include:</Label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAllCsv} className="text-xs h-7 px-2 font-mono">
                      all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={selectNoneCsv} className="text-xs h-7 px-2 font-mono">
                      none
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-muted/50 rounded-lg border border-border min-w-0">
                  {CSV_FIELDS.map(field => (
                    <label
                      key={field.key}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer transition-colors min-w-0"
                    >
                      <Checkbox
                        checked={selectedCsvFields.includes(field.key)}
                        onCheckedChange={() => toggleCsvField(field.key)}
                        className="shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium">{field.label}</span>
                        <span className="text-xs text-muted-foreground">{field.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {selectedCsvFields.length === 0 ? (
                <p className="text-sm text-destructive text-center font-mono">
                  // please select at least one field
                </p>
              ) : (
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm font-medium font-mono">preview:</Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {`// ${Math.min(CSV_PREVIEW_ROW_LIMIT, publications.length)} of ${publications.length} rows`}
                    </span>
                  </div>
                  {/*
                    Plain scrollable div, not <ScrollArea>: ScrollArea only ships a
                    vertical scrollbar by default, and the table previously had
                    `w-full`, which let the browser satisfy that width by shrinking
                    + ellipsis-truncating columns instead of ever overflowing --
                    so extra columns just got clipped with no way to reach them.
                    Dropping `w-full` lets the table size to its natural content
                    width so this container's overflow-x-auto has something to
                    actually scroll.
                  */}
                  <div className="max-h-[30vh] overflow-auto border rounded-lg bg-muted/30">
                    <table className="text-xs font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          {csvPreviewRows.columns.map(column => (
                            <th key={column} className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewRows.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-border/50 last:border-0">
                            {row.map((cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                title={cell || undefined}
                                className="px-3 py-2 max-w-[220px] truncate align-top text-muted-foreground"
                              >
                                {cell || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div ref={footerActionGroupRef} className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 dialog-mobile-safe-footer px-4 sm:px-6 pb-4 sm:pb-6 pt-4 border-t gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono w-full sm:w-auto">
            cancel
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <Button
              variant="outline"
              onClick={handleCopyToClipboard}
              disabled={isFieldSelectionEmpty || publications.length === 0}
              className="gap-2 font-mono w-full sm:w-auto"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'copied!' : 'copy'}
            </Button>
          </div>
          <Button
            variant="glow"
            onClick={format === 'bibtex' ? handleBibtexExport : format === 'apa' ? handleAPAExport : handleCSVExport}
            disabled={isFieldSelectionEmpty || publications.length === 0}
            className="gap-2 font-mono w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            {format === 'bibtex' ? `export_.bib` : format === 'apa' ? `export_.txt` : `export_.csv`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
