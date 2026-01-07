import { useState } from 'react';
import { Publication, RELATION_TYPES, RelationType } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Link2, Plus, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RelatedPublication extends Publication {
  relation_type: string;
  relation_id: string;
}

interface RelatedPapersSectionProps {
  relations: RelatedPublication[];
  allPublications: Publication[];
  currentPublicationId: string | null;
  loading: boolean;
  onAddRelation: (publicationId: string, relationType: string) => Promise<boolean>;
  onRemoveRelation: (relationId: string) => Promise<boolean>;
}

export function RelatedPapersSection({
  relations,
  allPublications,
  currentPublicationId,
  loading,
  onAddRelation,
  onRemoveRelation,
}: RelatedPapersSectionProps) {
  const [isAddingRelation, setIsAddingRelation] = useState(false);
  const [selectedPublicationId, setSelectedPublicationId] = useState<string>('');
  const [selectedRelationType, setSelectedRelationType] = useState<string>('related');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out current publication and already-related publications
  const availablePublications = allPublications.filter(
    (pub) =>
      pub.id !== currentPublicationId &&
      !relations.some((rel) => rel.id === pub.id)
  );

  const filteredPublications = availablePublications.filter((pub) =>
    pub.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pub.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedPublication = availablePublications.find((p) => p.id === selectedPublicationId);

  const handleAddRelation = async () => {
    if (!selectedPublicationId) return;
    
    const success = await onAddRelation(selectedPublicationId, selectedRelationType);
    if (success) {
      setSelectedPublicationId('');
      setSelectedRelationType('related');
      setIsAddingRelation(false);
    }
  };

  const getRelationLabel = (type: string) => {
    return RELATION_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getRelationColor = (type: string): string => {
    const colors: Record<string, string> = {
      related: '#6366f1',
      cites: '#22c55e',
      extends: '#3b82f6',
      contradicts: '#ef4444',
      reviews: '#f97316',
      builds_on: '#8b5cf6',
      supersedes: '#ec4899',
    };
    return colors[type] || '#6366f1';
  };

  if (!currentPublicationId) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-semibold flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          Related Papers
        </Label>
        {!isAddingRelation && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAddingRelation(true)}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Link Paper
          </Button>
        )}
      </div>

      {/* Existing relations */}
      {relations.length > 0 && (
        <div className="space-y-2">
          {relations.map((rel) => (
            <div
              key={rel.relation_id}
              className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 group"
            >
              <Badge
                variant="outline"
                className="text-xs shrink-0"
                style={{
                  backgroundColor: `${getRelationColor(rel.relation_type)}15`,
                  color: getRelationColor(rel.relation_type),
                  borderColor: `${getRelationColor(rel.relation_type)}40`,
                }}
              >
                {getRelationLabel(rel.relation_type)}
              </Badge>
              <span className="text-sm truncate flex-1" title={rel.title}>
                {rel.title}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {rel.year || '—'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => onRemoveRelation(rel.relation_id)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {relations.length === 0 && !isAddingRelation && (
        <p className="text-sm text-muted-foreground italic">
          No related papers linked yet.
        </p>
      )}

      {/* Add new relation */}
      {isAddingRelation && (
        <div className="space-y-3 p-3 rounded-lg border-2 border-dashed bg-muted/20">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    disabled={availablePublications.length === 0}
                  >
                    <Search className="w-4 h-4 mr-2 shrink-0" />
                    <span className="truncate">
                      {selectedPublication?.title || 'Search papers...'}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search by title or author..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No papers found.</CommandEmpty>
                      <CommandGroup>
                        {filteredPublications.slice(0, 10).map((pub) => (
                          <CommandItem
                            key={pub.id}
                            value={pub.id}
                            onSelect={() => {
                              setSelectedPublicationId(pub.id);
                              setSearchOpen(false);
                              setSearchQuery('');
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm line-clamp-1">{pub.title}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {pub.authors[0] || 'Unknown'} {pub.year ? `• ${pub.year}` : ''}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="text-xs">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddingRelation(false);
                setSelectedPublicationId('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddRelation}
              disabled={!selectedPublicationId || loading}
              className="flex-1"
            >
              <Link2 className="w-3 h-3 mr-1" />
              Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
