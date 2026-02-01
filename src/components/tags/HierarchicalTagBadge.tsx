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
        cursor-pointer transition-all hover:scale-105 font-mono border
        ${size === 'sm' ? 'text-xs py-0 px-1.5' : 'text-xs py-0.5 px-2'}
        ${hasParents ? 'pl-1.5' : ''}
      `}
      style={
        isSelected
          ? { backgroundColor: displayColor, borderColor: displayColor }
          : { borderColor: `${displayColor}40`, color: displayColor, backgroundColor: `${displayColor}10` }
      }
      onClick={onClick}
    >
      {hasParents && (
        <span 
          className="w-1.5 h-1.5 rounded-full mr-1 shrink-0"
          style={{ backgroundColor: parentChain[0].color }}
        />
      )}
      <span className="opacity-50">#</span>{tag.name}
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
          className="bg-popover/95 backdrop-blur-xl border p-2"
        >
          <div className="flex items-center gap-1 text-xs font-mono">
            {parentChain.map((parent, idx) => (
              <span key={parent.id} className="flex items-center gap-1">
                <span 
                  className="px-1.5 py-0.5 rounded"
                  style={{ 
                    backgroundColor: `${parent.color}15`,
                    color: parent.color 
                  }}
                >
                  <span className="opacity-50">#</span>{parent.name}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </span>
            ))}
            <span 
              className="px-1.5 py-0.5 rounded font-medium"
              style={{ 
                backgroundColor: `${displayColor}15`,
                color: displayColor 
              }}
            >
              <span className="opacity-50">#</span>{tag.name}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
