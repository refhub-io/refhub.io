import { useState } from 'react';
import { Publication, Vault } from '@/types/database';
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
import { parseBibtex, fetchDOIMetadata } from '@/lib/bibtex';
import { FileText, Link, Upload, Check, X, Loader2, Library } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ExistingPaperSelector } from './ExistingPaperSelector';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaults: Vault[];
  allPublications: Publication[];
  currentVaultId: string | null;
  onImport: (publications: Partial<Publication>[]) => Promise<void>;
  onAddToVaults: (publicationId: string, vaultIds: string[]) => Promise<void>;
}

export function ImportDialog({
  open,
  onOpenChange,
  vaults,
  allPublications,
  currentVaultId,
  onImport,
  onAddToVaults,
}: ImportDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('library');
  
  // DOI state
  const [doiInput, setDoiInput] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);
  
  // BibTeX state
  const [bibtexInput, setBibtexInput] = useState('');
  
  // Parsed publications
  const [parsedPublications, setParsedPublications] = useState<Partial<Publication>[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // Import options
  const [targetVaultId, setTargetVaultId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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
      
      setParsedPublications([...parsedPublications, pub]);
      setSelectedIndices(new Set([...selectedIndices, parsedPublications.length]));
      setDoiInput('');
      
      toast({ title: 'DOI resolved ✨', description: metadata.title });
    } catch (error: any) {
      toast({
        title: 'DOI lookup failed',
        description: error.message || 'Could not resolve DOI',
        variant: 'destructive',
      });
    } finally {
      setDoiLoading(false);
    }
  };

  const handleBibtexParse = () => {
    if (!bibtexInput.trim()) return;
    
    try {
      const parsed = parseBibtex(bibtexInput);
      
      if (parsed.length === 0) {
        toast({
          title: 'No entries found',
          description: 'Could not parse any BibTeX entries',
          variant: 'destructive',
        });
        return;
      }
      
      const startIdx = parsedPublications.length;
      setParsedPublications([...parsedPublications, ...parsed]);
      
      // Select all newly parsed entries
      const newIndices = new Set(selectedIndices);
      parsed.forEach((_, i) => newIndices.add(startIdx + i));
      setSelectedIndices(newIndices);
      
      setBibtexInput('');
      toast({ title: `Parsed ${parsed.length} entries ✨` });
    } catch (error: any) {
      toast({
        title: 'Parse error',
        description: error.message || 'Could not parse BibTeX',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBibtexInput(content);
    };
    reader.readAsText(file);
  };

  const toggleSelection = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const removePublication = (index: number) => {
    setParsedPublications(parsedPublications.filter((_, i) => i !== index));
    const newSet = new Set<number>();
    selectedIndices.forEach(i => {
      if (i < index) newSet.add(i);
      else if (i > index) newSet.add(i - 1);
    });
    setSelectedIndices(newSet);
  };

  const handleImport = async () => {
    const toImport = parsedPublications
      .filter((_, i) => selectedIndices.has(i))
      .map(pub => ({
        ...pub,
        vault_id: targetVaultId,
      }));
    
    if (toImport.length === 0) {
      toast({
        title: 'No papers selected',
        description: 'Select at least one paper to import',
        variant: 'destructive',
      });
      return;
    }
    
    setImporting(true);
    try {
      await onImport(toImport);
      toast({ title: `Imported ${toImport.length} papers ✨` });
      
      // Reset state
      setParsedPublications([]);
      setSelectedIndices(new Set());
      setDoiInput('');
      setBibtexInput('');
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const selectAll = () => {
    setSelectedIndices(new Set(parsedPublications.map((_, i) => i)));
  };

  const selectNone = () => {
    setSelectedIndices(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] p-0 border-2 bg-card/95 backdrop-blur-xl overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold">
            <span>Add <span className="text-gradient">Papers</span></span>
          </DialogTitle>
          <DialogDescription className="font-mono text-sm text-muted-foreground">
            // add from library, DOI, or BibTeX
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4 sm:p-6 pt-4">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="library" className="gap-2 text-xs sm:text-sm">
                <Library className="w-4 h-4" />
                <span className="hidden sm:inline">Library</span>
              </TabsTrigger>
              <TabsTrigger value="doi" className="gap-2 text-xs sm:text-sm">
                <Link className="w-4 h-4" />
                <span className="hidden sm:inline">DOI</span>
              </TabsTrigger>
              <TabsTrigger value="bibtex" className="gap-2 text-xs sm:text-sm">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">BibTeX</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="space-y-4">
              <ExistingPaperSelector
                publications={allPublications}
                vaults={vaults}
                currentVaultId={currentVaultId}
                onAddToVaults={async (pubId, vaultIds) => {
                  await onAddToVaults(pubId, vaultIds);
                  onOpenChange(false);
                }}
              />
            </TabsContent>

            <TabsContent value="doi" className="space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold">Enter DOI</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={doiInput}
                    onChange={(e) => setDoiInput(e.target.value)}
                    placeholder="10.1000/xyz123 or https://doi.org/..."
                    className="font-mono flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleDOILookup();
                      }
                    }}
                  />
                  <Button 
                    onClick={handleDOILookup} 
                    disabled={doiLoading || !doiInput.trim()}
                    variant="glow"
                    className="w-full sm:w-auto"
                  >
                    {doiLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Lookup'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  // supports doi.org URLs, DOI strings, or doi: prefix
                </p>
              </div>
            </TabsContent>

            <TabsContent value="bibtex" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-semibold">BibTeX Content</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 text-xs sm:text-sm"
                    onClick={() => document.getElementById('bib-file-input')?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Upload</span> .bib
                  </Button>
                  <input
                    id="bib-file-input"
                    type="file"
                    accept=".bib,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                <Textarea
                  value={bibtexInput}
                  onChange={(e) => setBibtexInput(e.target.value)}
                  placeholder="@article{key,
  title = {Paper Title},
  author = {Author Name},
  year = {2024},
  ...
}"
                  rows={6}
                  className="font-mono text-sm"
                />
                <Button 
                  onClick={handleBibtexParse} 
                  disabled={!bibtexInput.trim()}
                  variant="glow"
                  className="w-full"
                >
                  Parse BibTeX
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Parsed Publications List */}
          {parsedPublications.length > 0 && (
            <div className="px-4 sm:px-6 pb-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="font-semibold text-sm">
                  Parsed ({selectedIndices.size}/{parsedPublications.length})
                </Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs px-2">
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs px-2">
                    None
                  </Button>
                </div>
              </div>

              <div className="border-2 rounded-lg max-h-40 overflow-y-auto">
                <div className="p-2 space-y-2">
                  {parsedPublications.map((pub, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedIndices.has(index)
                          ? 'bg-primary/10 border-primary/50'
                          : 'bg-muted/30 border-transparent hover:border-border'
                      }`}
                      onClick={() => toggleSelection(index)}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedIndices.has(index) ? 'bg-primary border-primary' : 'border-muted-foreground'
                      }`}>
                        {selectedIndices.has(index) && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs sm:text-sm line-clamp-2">{pub.title}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {pub.authors?.slice(0, 2).join(', ')}{pub.authors && pub.authors.length > 2 ? '...' : ''} • {pub.year || 'n.d.'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePublication(index);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-2">
                <Label className="font-semibold text-sm">Import to Vault</Label>
                <Select
                  value={targetVaultId || 'none'}
                  onValueChange={(value) => setTargetVaultId(value === 'none' ? null : value)}
                >
                  <SelectTrigger className="text-sm">
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

              {/* Import Button */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t-2 border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button 
                  variant="glow" 
                  onClick={handleImport}
                  disabled={importing || selectedIndices.size === 0}
                  className="w-full sm:w-auto"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${selectedIndices.size} Paper${selectedIndices.size !== 1 ? 's' : ''}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>

      </DialogContent>
    </Dialog>
  );
}