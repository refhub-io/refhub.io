import { cn } from '@/lib/utils';
import { getAuthProviderLabel, type SupportedOAuthProvider } from '@/lib/authProviders';

interface AuthProviderBadgeProps {
  provider: SupportedOAuthProvider;
  className?: string;
}

export function AuthProviderBadge({ provider, className }: AuthProviderBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.22em] font-mono lowercase shadow-sm backdrop-blur-sm',
        provider === 'google'
          ? 'border-fuchsia-500/20 bg-fuchsia-500/8 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200'
          : 'border-slate-400/30 bg-slate-500/8 text-slate-700 dark:border-pink-400/30 dark:bg-pink-500/10 dark:text-pink-200',
        className
      )}
    >
      last login: {getAuthProviderLabel(provider).toLowerCase()}
    </span>
  );
}
