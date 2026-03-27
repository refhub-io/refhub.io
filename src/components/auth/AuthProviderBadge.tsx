import { cn } from '@/lib/utils';
import { type SupportedOAuthProvider } from '@/lib/authProviders';

interface AuthProviderBadgeProps {
  provider: SupportedOAuthProvider;
  className?: string;
}

export function AuthProviderBadge({ provider, className }: AuthProviderBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-semibold tracking-[0.22em] font-mono uppercase shadow-sm backdrop-blur-sm',
        'border-pink-500/30 bg-gradient-to-r from-fuchsia-500/10 via-pink-500/10 to-violet-500/10 text-fuchsia-100 dark:border-fuchsia-400/35 dark:bg-fuchsia-500/15 dark:text-fuchsia-100',
        className
      )}
    >
      last_used
    </span>
  );
}
