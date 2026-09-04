import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';

export function suggestionKey(suggestion: RelationshipSuggestion): string {
  return `${suggestion.sourcePublicationId}:${suggestion.targetPublicationId}`;
}

interface RelationshipSuggestionsListProps {
  suggestions: RelationshipSuggestion[];
  /** suggestionKey() of the suggestion currently being approved, if any — disables its approve button while the insert is in flight. */
  approvingKey: string | null;
  onApprove: (suggestion: RelationshipSuggestion) => void;
  onDismiss: (suggestion: RelationshipSuggestion) => void;
}

export function RelationshipSuggestionsList({ suggestions, approvingKey, onApprove, onDismiss }: RelationshipSuggestionsListProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => {
        const key = suggestionKey(suggestion);
        return (
          <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{suggestion.sourceTitle}</span>
              <span className="text-muted-foreground"> cites </span>
              <span className="font-medium">{suggestion.targetTitle}</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={approvingKey === key}
                onClick={() => onApprove(suggestion)}
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => onDismiss(suggestion)}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                dismiss
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
