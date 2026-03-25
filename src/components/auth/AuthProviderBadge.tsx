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
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] font-mono',
        provider === 'google'
          ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200'
          : 'border-pink-500/30 bg-pink-500/10 text-pink-200',
        className
      )}
    >
      last_login: {getAuthProviderLabel(provider)}
    </span>
  );
}
