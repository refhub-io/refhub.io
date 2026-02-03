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
import { parseBibtex, fetchDOIMetadata, generateBibtexKey } from '@/lib/bibtex';
import { FileText, Link, Upload, Check, X, Loader2, Library } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { ExistingPaperSelector } from './ExistingPaperSelector';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaults: Vault[];
  allPublications: Publication[];
  currentVaultId: string | null;
  onImport: (publications: Partial<Publication>[], targetVaultId?: string | null) => Promise<string[]>;
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
  const [duplicateIndices, setDuplicateIndices] = useState<Set<number>>(new Set());
  
  // Import options
  const [targetVaultId, setTargetVaultId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Don't reset state when dialog opens/closes to preserve user input
  // State is only cleared after successful import

  // Duplicate checker helper
  const checkForDuplicate = (newPub: Partial<Publication>) => {
    return allPublications.find(pub => {
      // Check DOI match (if DOI exists on both)
      if (newPub.doi && pub.doi && newPub.doi.toLowerCase().trim() === pub.doi.toLowerCase().trim()) {
        return true;
      }
      
      // Check title match (normalize for comparison)
      if (newPub.title && pub.title) {
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalizeTitle(newPub.title) === normalizeTitle(pub.title)) {
          return true;
        }
      }
      
      return false;
    });
  };

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
      
      // Generate bibkey for the imported paper
      pub.bibtex_key = generateBibtexKey(pub as Publication);
      
      const isDuplicate = checkForDuplicate(pub);
      const newIndex = parsedPublications.length;
      
      setParsedPublications([...parsedPublications, pub]);
      setSelectedIndices(new Set([...selectedIndices, newIndex]));
      
      if (isDuplicate) {
        setDuplicateIndices(new Set([...duplicateIndices, newIndex]));
        toast({ 
          title: '⚠️ possible_duplicate', 
          description: `"${metadata.title}" may already exist in your library`,
          variant: 'destructive'
        });
      } else {
        toast({ title: 'doi_resolved ✨', description: metadata.title });
      }
      
      setDoiInput('');
    } catch (error) {
      toast({
        title: 'doi_lookup_failed',
        description: (error as Error).message || 'Could not resolve DOI',
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
          title: 'no_entries_found',
          description: 'Could not parse any BibTeX entries',
          variant: 'destructive',
        });
        return;
      }
      
      const startIdx = parsedPublications.length;
      setParsedPublications([...parsedPublications, ...parsed]);
      
      // Check for duplicates and select all newly parsed entries
      const newIndices = new Set(selectedIndices);
      const newDuplicates = new Set(duplicateIndices);
      let duplicateCount = 0;
      
      parsed.forEach((pub, i) => {
        const idx = startIdx + i;
        newIndices.add(idx);
        
        if (checkForDuplicate(pub)) {
          newDuplicates.add(idx);
          duplicateCount++;
        }
      });
      
      setSelectedIndices(newIndices);
      setDuplicateIndices(newDuplicates);
      
      setBibtexInput('');
      
      if (duplicateCount > 0) {
        toast({ 
          title: `parsed_${parsed.length}_entries (${duplicateCount} duplicates)`,
          description: 'Duplicates are marked in preview',
        });
      } else {
        toast({ title: `parsed_${parsed.length}_entries ✨` });
      }
    } catch (error) {
      toast({
        title: 'parse_error',
        description: (error as Error).message || 'Could not parse BibTeX',
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
    
    // Update selectedIndices
    const newSet = new Set<number>();
    selectedIndices.forEach(i => {
      if (i < index) newSet.add(i);
      else if (i > index) newSet.add(i - 1);
    });
    setSelectedIndices(newSet);
    
    // Update duplicateIndices
    const newDuplicates = new Set<number>();
    duplicateIndices.forEach(i => {
      if (i < index) newDuplicates.add(i);
      else if (i > index) newDuplicates.add(i - 1);
    });
    setDuplicateIndices(newDuplicates);
  };

  const handleImport = async () => {
    const toImport = parsedPublications
      .filter((_, i) => selectedIndices.has(i))
      .map(pub => {
        // Remove vault_id from the publication object since it doesn't exist in the publications table
        const { vault_id, ...cleanPub } = pub as any;
        return cleanPub;
      });

    if (toImport.length === 0) {
      toast({
        title: 'no_papers_selected',
        description: 'Select at least one paper to import',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    try {
      // Import publications and optionally add to target vault
      // The parent function handles adding to the specified vault
      const insertedIds = await onImport(toImport, targetVaultId);
      
      if (targetVaultId && insertedIds.length > 0) {
        const targetVault = vaults.find(v => v.id === targetVaultId);
        toast({ 
          title: `imported_${insertedIds.length}_papers ✨`,
          description: targetVault ? `Added to ${targetVault.name}` : undefined
        });
      } else {
        toast({ title: `imported_${toImport.length}_papers ✨` });
      }

      // Reset state
      setParsedPublications([]);
      setSelectedIndices(new Set());
      setDoiInput('');
      setBibtexInput('');
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'import_failed',
        description: (error as Error).message,
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
      <DialogContent forceMount className="w-full max-w-[100vw] h-full sm:h-auto sm:w-[95vw] sm:max-w-4xl sm:max-h-[90vh] p-0 border-2 bg-card/95 backdrop-blur-xl overflow-hidden flex flex-col data-[state=closed]:hidden">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
            // import_<span className="text-gradient">papers</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs sm:text-sm text-muted-foreground">
            // from_library • doi • bibtex
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4 sm:p-6 pt-4">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="library" className="gap-2 text-xs sm:text-sm font-mono">
                <Library className="w-4 h-4" />
                <span className="hidden sm:inline">library</span>
              </TabsTrigger>
              <TabsTrigger value="doi" className="gap-2 text-xs sm:text-sm font-mono">
                <Link className="w-4 h-4" />
                <span className="hidden sm:inline">doi</span>
              </TabsTrigger>
              <TabsTrigger value="bibtex" className="gap-2 text-xs sm:text-sm font-mono">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">bibtex</span>
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

            <TabsContent value="doi" className="space-y-4 min-w-0">
              <div className="space-y-2 min-w-0">
                <Label className="font-semibold font-mono">enter_doi</Label>
                <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                  <Input
                    value={doiInput}
                    onChange={(e) => setDoiInput(e.target.value)}
                    placeholder="10.1000/xyz123 or https://doi.org/..."
                    className="font-mono flex-1 text-sm w-full min-w-0"
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
                    className="w-full sm:w-auto font-mono"
                  >
                    {doiLoading ? (
                      <LoadingSpinner size="xs" />
                    ) : (
                      'lookup'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  // supports doi.org URLs, DOI strings, or doi: prefix
                </p>
              </div>
            </TabsContent>

            <TabsContent value="bibtex" className="space-y-4 min-w-0">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-semibold font-mono">bibtex_content</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 text-xs sm:text-sm font-mono"
                    onClick={() => document.getElementById('bib-file-input')?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">upload</span> .bib
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
                  className="font-mono text-sm w-full min-w-0"
                />
                <Button 
                  onClick={handleBibtexParse} 
                  disabled={!bibtexInput.trim()}
                  variant="glow"
                  className="w-full font-mono"
                >
                  parse_bibtex
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Parsed Publications List */}
          {parsedPublications.length > 0 && (
            <div className="px-4 sm:px-6 pb-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="font-semibold text-sm font-mono">
                  parsed ({selectedIndices.size}/{parsedPublications.length})
                </Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs px-2 font-mono">
                    all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs px-2 font-mono">
                    none
                  </Button>
                </div>
              </div>

              {duplicateIndices.size > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2">
                  <p className="text-xs font-mono text-orange-600 dark:text-orange-400">
                    <span className="text-orange-500 font-bold">&gt;&gt;</span> warning: {duplicateIndices.size} duplicate{duplicateIndices.size > 1 ? 's' : ''} detected in library
                  </p>
                </div>
              )}

              <div className="border-2 rounded-lg max-h-40 overflow-y-auto">
                <div className="p-2 space-y-2">
                  {parsedPublications.map((pub, index) => {
                    const isDuplicate = duplicateIndices.has(index);
                    return (
                    <div
                      key={index}
                      className={`relative flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-colors cursor-pointer ${
                        isDuplicate
                          ? 'bg-orange-500/10 border-orange-500/50'
                          : selectedIndices.has(index)
                          ? 'bg-primary/10 border-primary/50'
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
                  );
                  })}
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-2">
                <Label className="font-semibold text-sm font-mono">import_to_vault</Label>
                <Select
                  value={targetVaultId || 'none'}
                  onValueChange={(value) => setTargetVaultId(value === 'none' ? null : value)}
                >
                  <SelectTrigger className="text-sm">
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

              {/* Import Button */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t-2 border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-mono">
                  cancel
                </Button>
                <Button 
                  variant="glow" 
                  onClick={handleImport}
                  disabled={importing || selectedIndices.size === 0}
                  className="w-full sm:w-auto font-mono"
                >
                  {importing ? (
                    <>
                      <LoadingSpinner size="xs" className="mr-2" />
                      importing...
                    </>
                  ) : (
                    `import_${selectedIndices.size}_paper${selectedIndices.size !== 1 ? 's' : ''}`
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