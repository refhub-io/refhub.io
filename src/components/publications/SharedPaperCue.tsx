import { Share2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SharedPublicationInfo } from '@/lib/sharedPublications';

/**
 * Marks a paper that's in the library because someone shared a vault with the user. Blue Share2,
 * like the shared vaults in the sidebar.
 */
export function SharedPaperCue({ shared }: { shared: SharedPublicationInfo }) {
  const label = ['shared_with_you', ...(shared.canEdit ? [] : ['view_only']), ...shared.vaultNames].join(' • ');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} className="inline-flex shrink-0 align-[-0.125em] mr-1.5 text-blue-400">
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
