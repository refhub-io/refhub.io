import { useState, useRef, useEffect } from 'react';
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
import { Link2, Plus, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RelationshipSuggestionsList } from './RelationshipSuggestionsList';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';

interface RelatedPublication extends Publication {
  relation_type: string;
  relation_id: string;
}

interface RelatedPapersSectionProps {
  relations: RelatedPublication[];
  allPublications: Publication[];
  currentPublicationId: string | null;
  loading: boolean;
  onAddRelation: (publicationId: string, relationType: string, direction?: 'outgoing' | 'incoming') => Promise<boolean>;
  onRemoveRelation: (relationId: string) => Promise<boolean>;
  suggestions: RelationshipSuggestion[];
  checkingRelationships: boolean;
  approvingSuggestionKey: string | null;
  onCheckRelationships: () => void;
  onApproveSuggestion: (suggestion: RelationshipSuggestion) => void;
  onDismissSuggestion: (suggestion: RelationshipSuggestion) => void;
}

export function RelatedPapersSection({
  relations,
  allPublications,
  currentPublicationId,
  loading,
  onAddRelation,
  onRemoveRelation,
  suggestions,
  checkingRelationships,
  approvingSuggestionKey,
  onCheckRelationships,
  onApproveSuggestion,
  onDismissSuggestion,
}: RelatedPapersSectionProps) {
  const [isAddingRelation, setIsAddingRelation] = useState(false);
  const [selectedPublicationId, setSelectedPublicationId] = useState<string>('');
  const [selectedRelationType, setSelectedRelationType] = useState<string>('cites');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const currentPublication = allPublications.find((p) => p.id === currentPublicationId);

  // Scroll highlighted item into view when using keyboard
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleAddRelation = async () => {
    if (!selectedPublicationId) return;
    
    const success = await onAddRelation(selectedPublicationId, selectedRelationType);
    if (success) {
      setSelectedPublicationId('');
      setSelectedRelationType('cites');
      setIsAddingRelation(false);
    }
  };

  const getRelationLabel = (type: string) => {
    return RELATION_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getRelationColor = (type: string): string => {
    const colors: Record<string, string> = {
      cites: '#22c55e',
      extends: '#3b82f6',
      contradicts: '#ef4444',
      reviews: '#f97316',
      builds_on: '#8b5cf6',
    };
    return colors[type] || '#22c55e';
  };

  if (!currentPublicationId) {
    return null;
  }

  return (
    <div className="space-y-3 min-w-0 w-full overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <Label className="font-semibold flex items-center gap-2">
          <Link2 className="w-4 h-4 shrink-0" />
          <span className="truncate">Related Papers</span>
        </Label>
        <div className="flex items-center gap-2 shrink-0">
          {currentPublication?.doi && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={checkingRelationships}
              onClick={onCheckRelationships}
              className="h-7 text-xs"
            >
              <Search className="w-3 h-3 mr-1" />
              {checkingRelationships ? 'checking...' : 'check_relationships'}
            </Button>
          )}
          {!isAddingRelation && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddingRelation(true)}
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              link_paper
            </Button>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <RelationshipSuggestionsList
          suggestions={suggestions}
          approvingKey={approvingSuggestionKey}
          onApprove={onApproveSuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}

      {/* Existing relations */}
      {relations.length > 0 && (
        <div className="space-y-2 max-h-[200px] overflow-y-auto overflow-x-hidden">
          {relations.map((rel) => (
            <div
              key={rel.relation_id}
              className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 group max-w-full"
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
              <span className="text-sm w-0 flex-1 truncate" title={rel.title}>
                {rel.title}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {rel.year || '—'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
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
        <div className="space-y-3 p-3 rounded-lg border-2 border-dashed bg-muted/20 min-w-0">
          {/* Paper list — above the search bar */}
          <div
            ref={listRef}
            className="max-h-[240px] overflow-y-auto overscroll-contain rounded-md border bg-popover shadow-md"
          >
            {filteredPublications.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No papers found.</p>
            ) : (
              <div className="p-1">
                {filteredPublications.slice(0, 50).map((pub, idx) => (
                  <div
                    key={pub.id}
                    data-item
                    onClick={() => {
                      setSelectedPublicationId(pub.id);
                      setSearchQuery(pub.title);
                      inputRef.current?.focus();
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "px-3 py-2.5 rounded-sm cursor-pointer transition-colors",
                      idx === highlightedIndex && "bg-accent text-accent-foreground",
                      idx !== highlightedIndex && "hover:bg-accent/50",
                      selectedPublicationId === pub.id && "ring-1 ring-primary/50"
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm line-clamp-2 leading-snug">{pub.title}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {pub.authors[0] || 'Unknown'} {pub.year ? `• ${pub.year}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search input + relation type */}
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                autoFocus
                placeholder="search by title or author..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex((i) => Math.min(i + 1, filteredPublications.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && filteredPublications.length > 0) {
                    e.preventDefault();
                    const pub = filteredPublications[highlightedIndex];
                    if (pub) {
                      setSelectedPublicationId(pub.id);
                      setSearchQuery(pub.title);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchQuery('');
                  }
                }}
                className="pl-9 text-xs sm:text-sm h-10"
              />
            </div>
            <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
              <SelectTrigger className="text-xs w-[120px] shrink-0">
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

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddingRelation(false);
                setSelectedPublicationId('');
                setSearchQuery('');
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
