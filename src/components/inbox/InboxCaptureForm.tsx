import { useRef, useState } from 'react';
import type { InboxItem, Publication } from '@/types/database';
import { useInbox } from '@/hooks/useInbox';
import { fetchDOIMetadata, parseBibtex, generateBibtexKey, type DOIMetadata } from '@/lib/bibtex';
import { normalizeArxivId, fetchArxivMetadata } from '@/lib/arxivLookup';
import { parseS2PaperIdFromUrl, fetchS2UrlMetadata } from '@/lib/s2UrlLookup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';

interface InboxCaptureFormProps {
  onCreated: (item: InboxItem) => void;
}

type CaptureTab = 'doi' | 'arxiv' | 's2_url' | 'bibtex' | 'pdf' | 'manual';

/** Maps the shared DOIMetadata shape (returned by fetchDOIMetadata,
 * fetchArxivMetadata, and fetchS2UrlMetadata alike) onto the Partial<Publication>
 * shape inbox_items.parsed_fields expects. */
function doiMetadataToParsedFields(metadata: DOIMetadata): Partial<Publication> {
  const { type, ...rest } = metadata;
  return { ...rest, publication_type: (type as Publication['publication_type']) || 'article' };
}

export function InboxCaptureForm({ onCreated }: InboxCaptureFormProps) {
  const { createItem } = useInbox();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CaptureTab>('doi');

  const doiActionRef = useRef<HTMLDivElement>(null);
  const arxivActionRef = useRef<HTMLDivElement>(null);
  const s2ActionRef = useRef<HTMLDivElement>(null);
  const bibtexActionRef = useRef<HTMLDivElement>(null);
  const pdfActionRef = useRef<HTMLDivElement>(null);
  const manualActionRef = useRef<HTMLDivElement>(null);

  // DOI
  const [doiInput, setDoiInput] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);

  // arXiv
  const [arxivInput, setArxivInput] = useState('');
  const [arxivLoading, setArxivLoading] = useState(false);

  // Semantic Scholar URL
  const [s2Input, setS2Input] = useState('');
  const [s2Loading, setS2Loading] = useState(false);

  // BibTeX
  const [bibtexInput, setBibtexInput] = useState('');
  const [bibtexLoading, setBibtexLoading] = useState(false);

  // PDF (URL paste, not a file upload — see task brief)
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Manual
  const [manualTitle, setManualTitle] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  const handleDOICapture = async () => {
    const sourceRef = doiInput.trim();
    if (!sourceRef) return;
    setDoiLoading(true);
    try {
      let parsedFields: Partial<Publication>;
      try {
        const metadata = await fetchDOIMetadata(sourceRef);
        parsedFields = doiMetadataToParsedFields(metadata);
      } catch {
        // Degrade gracefully — never block capture on enrichment failing.
        parsedFields = { title: sourceRef };
      }
      const item = await createItem({ sourceType: 'doi', sourceRef, parsedFields });
      if (item) {
        onCreated(item);
        setDoiInput('');
      } else {
        toast({ title: 'Could not capture paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: doiActionRef });
      }
    } finally {
      setDoiLoading(false);
    }
  };

  const handleArxivCapture = async () => {
    const sourceRef = arxivInput.trim();
    if (!sourceRef) return;
    setArxivLoading(true);
    try {
      let parsedFields: Partial<Publication> = { title: sourceRef };
      const arxivId = normalizeArxivId(sourceRef);
      if (arxivId) {
        const metadata = await fetchArxivMetadata(arxivId);
        if (metadata) parsedFields = doiMetadataToParsedFields(metadata);
      }
      const item = await createItem({ sourceType: 'arxiv', sourceRef, parsedFields });
      if (item) {
        onCreated(item);
        setArxivInput('');
      } else {
        toast({ title: 'Could not capture paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: arxivActionRef });
      }
    } finally {
      setArxivLoading(false);
    }
  };

  const handleS2Capture = async () => {
    const sourceRef = s2Input.trim();
    if (!sourceRef) return;
    setS2Loading(true);
    try {
      let parsedFields: Partial<Publication> = { title: sourceRef };
      const paperId = parseS2PaperIdFromUrl(sourceRef);
      if (paperId) {
        const metadata = await fetchS2UrlMetadata(paperId);
        if (metadata) parsedFields = doiMetadataToParsedFields(metadata);
      }
      const item = await createItem({ sourceType: 's2_url', sourceRef, parsedFields });
      if (item) {
        onCreated(item);
        setS2Input('');
      } else {
        toast({ title: 'Could not capture paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: s2ActionRef });
      }
    } finally {
      setS2Loading(false);
    }
  };

  const handleBibtexCapture = async () => {
    if (!bibtexInput.trim()) return;
    setBibtexLoading(true);
    try {
      const parsed = parseBibtex(bibtexInput);
      if (parsed.length === 0) {
        toast({ title: 'No BibTeX entries found', description: 'RefHub could not find any complete BibTeX records in the pasted text. Check the format and try again.', variant: 'destructive', feedbackSeverity: 'error', source: bibtexActionRef });
        return;
      }
      let capturedCount = 0;
      for (const entry of parsed) {
        const sourceRef = entry.bibtex_key || generateBibtexKey(entry as Publication);
        const item = await createItem({ sourceType: 'bibtex', sourceRef, parsedFields: entry });
        if (item) {
          onCreated(item);
          capturedCount++;
        }
      }
      if (capturedCount > 0) {
        setBibtexInput('');
        toast({ title: `Captured ${capturedCount} paper${capturedCount === 1 ? '' : 's'} to your inbox`, source: bibtexActionRef });
      } else {
        toast({ title: 'Could not capture papers', description: 'RefHub could not save these items to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: bibtexActionRef });
      }
    } finally {
      setBibtexLoading(false);
    }
  };

  const handlePdfCapture = async () => {
    if (!pdfTitle.trim()) {
      toast({ title: 'Title required', description: 'Add a title before capturing this PDF link.', variant: 'destructive', feedbackSeverity: 'error', source: pdfActionRef });
      return;
    }
    setPdfLoading(true);
    try {
      const item = await createItem({
        sourceType: 'pdf',
        sourceRef: pdfUrl.trim(),
        parsedFields: { title: pdfTitle.trim(), url: pdfUrl.trim() },
      });
      if (item) {
        onCreated(item);
        setPdfUrl('');
        setPdfTitle('');
      } else {
        toast({ title: 'Could not capture paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: pdfActionRef });
      }
    } finally {
      setPdfLoading(false);
    }
  };

  const handleManualCapture = async () => {
    const title = manualTitle.trim();
    if (!title) {
      toast({ title: 'Title required', description: 'Add a title before capturing this paper.', variant: 'destructive', feedbackSeverity: 'error', source: manualActionRef });
      return;
    }
    setManualLoading(true);
    try {
      const item = await createItem({ sourceType: 'manual', sourceRef: title, parsedFields: { title } });
      if (item) {
        onCreated(item);
        setManualTitle('');
      } else {
        toast({ title: 'Could not capture paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: manualActionRef });
      }
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CaptureTab)}>
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="doi" className="text-xs sm:text-sm font-mono">doi</TabsTrigger>
        <TabsTrigger value="arxiv" className="text-xs sm:text-sm font-mono">arxiv</TabsTrigger>
        <TabsTrigger value="s2_url" className="text-xs sm:text-sm font-mono">s2_url</TabsTrigger>
        <TabsTrigger value="bibtex" className="text-xs sm:text-sm font-mono">bibtex</TabsTrigger>
        <TabsTrigger value="pdf" className="text-xs sm:text-sm font-mono">pdf</TabsTrigger>
        <TabsTrigger value="manual" className="text-xs sm:text-sm font-mono">manual</TabsTrigger>
      </TabsList>

      {/* ─── DOI tab ───────────────────────────────────────── */}
      <TabsContent value="doi" className="space-y-2">
        <Label className="font-semibold font-mono">enter_doi</Label>
        <Input
          value={doiInput}
          onChange={(e) => setDoiInput(e.target.value)}
          placeholder="10.1000/xyz123 or https://doi.org/..."
          className="font-mono text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDOICapture(); } }}
        />
        <div ref={doiActionRef} className="flex justify-end">
          <Button onClick={handleDOICapture} disabled={doiLoading || !doiInput.trim()} variant="glow" className="font-mono">
            {doiLoading ? <LoadingSpinner size="xs" /> : 'capture'}
          </Button>
        </div>
      </TabsContent>

      {/* ─── arXiv tab ─────────────────────────────────────── */}
      <TabsContent value="arxiv" className="space-y-2">
        <Label className="font-semibold font-mono">enter_arxiv_id</Label>
        <Input
          value={arxivInput}
          onChange={(e) => setArxivInput(e.target.value)}
          placeholder="2301.00001 or https://arxiv.org/abs/2301.00001"
          className="font-mono text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleArxivCapture(); } }}
        />
        <div ref={arxivActionRef} className="flex justify-end">
          <Button onClick={handleArxivCapture} disabled={arxivLoading || !arxivInput.trim()} variant="glow" className="font-mono">
            {arxivLoading ? <LoadingSpinner size="xs" /> : 'capture'}
          </Button>
        </div>
      </TabsContent>

      {/* ─── Semantic Scholar URL tab ──────────────────────── */}
      <TabsContent value="s2_url" className="space-y-2">
        <Label className="font-semibold font-mono">enter_semantic_scholar_url</Label>
        <Input
          value={s2Input}
          onChange={(e) => setS2Input(e.target.value)}
          placeholder="https://www.semanticscholar.org/paper/..."
          className="font-mono text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleS2Capture(); } }}
        />
        <div ref={s2ActionRef} className="flex justify-end">
          <Button onClick={handleS2Capture} disabled={s2Loading || !s2Input.trim()} variant="glow" className="font-mono">
            {s2Loading ? <LoadingSpinner size="xs" /> : 'capture'}
          </Button>
        </div>
      </TabsContent>

      {/* ─── BibTeX tab ────────────────────────────────────── */}
      <TabsContent value="bibtex" className="space-y-2">
        <Label className="font-semibold font-mono">bibtex_content</Label>
        <Textarea
          value={bibtexInput}
          onChange={(e) => setBibtexInput(e.target.value)}
          placeholder={`@article{key,\n  title = {Paper Title},\n  author = {Author Name},\n  year = {2024},\n  ...\n}`}
          rows={6}
          className="font-mono text-sm"
        />
        <div ref={bibtexActionRef} className="flex justify-end">
          <Button onClick={handleBibtexCapture} disabled={bibtexLoading || !bibtexInput.trim()} variant="glow" className="font-mono">
            {bibtexLoading ? <LoadingSpinner size="xs" /> : 'capture'}
          </Button>
        </div>
      </TabsContent>

      {/* ─── PDF tab (URL paste, not a file upload) ────────── */}
      <TabsContent value="pdf" className="space-y-2">
        <div className="space-y-2">
          <Label className="font-semibold font-mono">title *</Label>
          <Input
            value={pdfTitle}
            onChange={(e) => setPdfTitle(e.target.value)}
            placeholder="Paper title"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-semibold font-mono">pdf_url</Label>
          <Input
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="https://... link to a hosted PDF"
            className="font-mono text-sm"
          />
        </div>
        <div ref={pdfActionRef} className="flex justify-end">
          <Button onClick={handlePdfCapture} disabled={pdfLoading} variant="glow" className="font-mono">
            {pdfLoading ? <LoadingSpinner size="xs" /> : 'capture'}
          </Button>
        </div>
      </TabsContent>

      {/* ─── Manual tab ────────────────────────────────────── */}
      <TabsContent value="manual" className="space-y-2">
        <Label className="font-semibold font-mono">title *</Label>
        <Input
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          placeholder="Paper title"
          className="font-mono text-sm"
        />
        <div ref={manualActionRef} className="flex justify-end">
          <Button onClick={handleManualCapture} disabled={manualLoading} variant="glow" className="font-mono">
            {manualLoading ? <LoadingSpinner size="xs" /> : 'capture'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
