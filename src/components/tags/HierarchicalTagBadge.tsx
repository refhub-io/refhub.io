import { Tag } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { getHierarchicalColor, getTagParentChain } from '@/lib/tagHierarchy';
import { ChevronRight } from 'lucide-react';

interface HierarchicalTagBadgeProps {
  tag: Tag;
  allTags: Tag[];
  isSelected?: boolean;
  onClick?: () => void;
  showHierarchy?: boolean;
  size?: 'sm' | 'default';
}

export function HierarchicalTagBadge({
  tag,
  allTags,
  isSelected = false,
  onClick,
  showHierarchy = true,
  size = 'default',
}: HierarchicalTagBadgeProps) {
  const displayColor = getHierarchicalColor(tag, allTags);
  const parentChain = showHierarchy ? getTagParentChain(tag, allTags) : [];
  const hasParents = parentChain.length > 0;

  const badgeContent = (
    <Badge
      variant={isSelected ? 'default' : 'outline'}
      className={`
        cursor-pointer transition-all hover:scale-105 font-mono border-2
        ${size === 'sm' ? 'text-xs py-0 px-1.5' : ''}
        ${hasParents ? 'pl-1.5' : ''}
      `}
      style={
        isSelected
          ? { backgroundColor: displayColor, borderColor: displayColor }
          : { borderColor: `${displayColor}60`, color: displayColor }
      }
      onClick={onClick}
    >
      {hasParents && (
        <span 
          className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0"
          style={{ backgroundColor: parentChain[0].color }}
        />
      )}
      {tag.name}
    </Badge>
  );

  if (!hasParents || !showHierarchy) {
    return badgeContent;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="bg-popover/95 backdrop-blur-xl border-2 p-2"
        >
          <div className="flex items-center gap-1 text-xs">
            {parentChain.map((parent, idx) => (
              <span key={parent.id} className="flex items-center gap-1">
                <span 
                  className="px-1.5 py-0.5 rounded font-mono"
                  style={{ 
                    backgroundColor: `${parent.color}20`,
                    color: parent.color 
                  }}
                >
                  {parent.name}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </span>
            ))}
            <span 
              className="px-1.5 py-0.5 rounded font-mono font-medium"
              style={{ 
                backgroundColor: `${displayColor}20`,
                color: displayColor 
              }}
            >
              {tag.name}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
