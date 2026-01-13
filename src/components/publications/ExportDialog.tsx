import { useState } from 'react';
import { Publication } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Download, FileText } from 'lucide-react';
import { exportMultipleToBibtexWithFields, downloadBibtex, BibtexField } from '@/lib/bibtex';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  vaultName?: string;
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

export function ExportDialog({ open, onOpenChange, publications, vaultName }: ExportDialogProps) {
  const [selectedFields, setSelectedFields] = useState<BibtexField[]>(DEFAULT_SELECTED);

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

  const handleExport = () => {
    if (publications.length === 0 || selectedFields.length === 0) return;

    const filename = vaultName
      ? `${vaultName.toLowerCase().replace(/\s+/g, '-')}.bib`
      : 'references.bib';

    const content = exportMultipleToBibtexWithFields(publications, selectedFields);
    downloadBibtex(content, filename);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <FileText className="w-5 h-5 text-primary" />
            export_to_bibtex
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-mono">
              // exporting <span className="font-semibold text-foreground">{publications.length}</span> publication{publications.length !== 1 ? 's' : ''}
              {vaultName && <span> from <span className="font-semibold text-foreground">{vaultName}</span></span>}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium font-mono">select fields to include:</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7 px-2 font-mono">
                  all
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs h-7 px-2 font-mono">
                  none
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-muted/50 rounded-lg border border-border">
              {BIBTEX_FIELDS.map(field => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedFields.includes(field.key)}
                    onCheckedChange={() => toggleField(field.key)}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{field.label}</span>
                    <span className="text-xs text-muted-foreground">{field.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedFields.length === 0 && (
            <p className="text-sm text-destructive text-center font-mono">
              // please select at least one field
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono">
            cancel
          </Button>
          <Button
            variant="glow"
            onClick={handleExport}
            disabled={selectedFields.length === 0}
            className="gap-2 font-mono"
          >
            <Download className="w-4 h-4" />
            export_{publications.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
