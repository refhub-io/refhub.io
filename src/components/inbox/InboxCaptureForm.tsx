import { useRef, useState } from 'react';
import type { InboxItem, Publication } from '@/types/database';
import { useInbox } from '@/hooks/useInbox';
import { fetchDOIMetadata, parseBibtex, generateBibtexKey, type DOIMetadata } from '@/lib/bibtex';
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

// Mirrors AddImportDialog's own capture tab set (minus "library", which
// picks from papers already in the user's collection rather than capturing
// something new) -- arxiv/s2_url/pdf tabs were dropped as redundant with DOI
// for the vast majority of papers and were cluttering the top of the page.
type CaptureTab = 'doi' | 'bibtex' | 'manual';

/** Maps the shared DOIMetadata shape (returned by fetchDOIMetadata) onto the
 * Partial<Publication> shape inbox_items.parsed_fields expects. */
function doiMetadataToParsedFields(metadata: DOIMetadata): Partial<Publication> {
  const { type, ...rest } = metadata;
  return { ...rest, publication_type: (type as Publication['publication_type']) || 'article' };
}

export function InboxCaptureForm({ onCreated }: InboxCaptureFormProps) {
  const { createItem } = useInbox();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CaptureTab>('doi');

  const doiActionRef = useRef<HTMLDivElement>(null);
  const bibtexActionRef = useRef<HTMLDivElement>(null);
  const manualActionRef = useRef<HTMLDivElement>(null);

  // DOI
  const [doiInput, setDoiInput] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);

  // BibTeX
  const [bibtexInput, setBibtexInput] = useState('');
  const [bibtexLoading, setBibtexLoading] = useState(false);

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
        toast({ title: 'Could not add paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: doiActionRef });
      }
    } finally {
      setDoiLoading(false);
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
        toast({ title: `Added ${capturedCount} paper${capturedCount === 1 ? '' : 's'} to your inbox`, source: bibtexActionRef });
      } else {
        toast({ title: 'Could not add papers', description: 'RefHub could not save these items to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: bibtexActionRef });
      }
    } finally {
      setBibtexLoading(false);
    }
  };

  const handleManualCapture = async () => {
    const title = manualTitle.trim();
    if (!title) {
      toast({ title: 'Title required', description: 'Add a title before adding this paper.', variant: 'destructive', feedbackSeverity: 'error', source: manualActionRef });
      return;
    }
    setManualLoading(true);
    try {
      const item = await createItem({ sourceType: 'manual', sourceRef: title, parsedFields: { title } });
      if (item) {
        onCreated(item);
        setManualTitle('');
      } else {
        toast({ title: 'Could not add paper', description: 'RefHub could not save this item to your inbox. Try again.', variant: 'destructive', feedbackSeverity: 'error', source: manualActionRef });
      }
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CaptureTab)}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="doi" className="text-xs sm:text-sm font-mono">doi</TabsTrigger>
        <TabsTrigger value="bibtex" className="text-xs sm:text-sm font-mono">bibtex</TabsTrigger>
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
            {doiLoading ? <LoadingSpinner size="xs" /> : 'add_to_inbox'}
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
            {bibtexLoading ? <LoadingSpinner size="xs" /> : 'add_to_inbox'}
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
            {manualLoading ? <LoadingSpinner size="xs" /> : 'add_to_inbox'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
