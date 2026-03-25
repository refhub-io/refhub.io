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
        'inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.22em] font-mono uppercase shadow-sm backdrop-blur-sm',
        provider === 'google'
          ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-500/14 dark:text-emerald-200'
          : 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/14 dark:text-fuchsia-200',
        className
      )}
    >
      LAST USED
    </span>
  );
}
