import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles } from 'lucide-react';
import { ensureProfileExists } from '@/lib/profile';
import { resolvePostAuthRedirect } from '@/lib/authRedirect';
import {
  getAuthProviderLabel,
  getUserAuthProvider,
  persistLastLoginProvider,
  consumePendingLastLoginProvider,
  type SupportedAuthProvider,
} from '@/lib/authProviders';
import { showError } from '@/lib/toast';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [statusLabel, setStatusLabel] = useState('restoring_session');
  const [callbackProvider, setCallbackProvider] = useState<SupportedAuthProvider | null>(null);

  useEffect(() => {
    // Handle the auth callback
    const handleAuthCallback = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const authCode = searchParams.get('code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const errorDescription =
          searchParams.get('error_description') ||
          searchParams.get('error') ||
          hashParams.get('error_description') ||
          hashParams.get('error');

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
        }

        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session && authCode) {
          setStatusLabel('exchanging_oauth_code');
          const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) throw error;
          session = data.session;
        }

        if (!session && accessToken && refreshToken) {
          setStatusLabel('restoring_callback_session');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          session = data.session;
        }

        if (!session) {
          throw new Error('No active session found after authentication callback.');
        }

        setStatusLabel('hydrating_profile');
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError || new Error('Could not load the authenticated user.');
        }

        const profile = await ensureProfileExists(user);
        if (!profile) {
          throw new Error('Unable to load your profile after sign-in.');
        }

        const pendingProvider = consumePendingLastLoginProvider();
        const uiProvider = (pendingProvider || getUserAuthProvider(user)) as SupportedAuthProvider | null;

        if (uiProvider) {
          persistLastLoginProvider(uiProvider);
          setCallbackProvider(uiProvider);
          setStatusLabel(`finishing_${uiProvider}_login`);
        }

        navigate(resolvePostAuthRedirect(profile), { replace: true });
      } catch (error) {
        showError('Sign-in failed', (error as Error).message || 'Please try again.');
        navigate('/auth', { replace: true });
      }
    };

    handleAuthCallback();
  }, [navigate]);

  const providerLabel = callbackProvider
    ? getAuthProviderLabel(callbackProvider)
    : statusLabel.startsWith('finishing_')
    ? '\u2014'
    : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple animate-glow-pulse">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold font-mono">
          {providerLabel ? `// ${providerLabel.toLowerCase()}_connected ✨` : '// auth_callback ✨'}
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          {providerLabel
            ? `// syncing_${providerLabel.toLowerCase()}_profile_and_redirecting...`
            : `// ${statusLabel}...`}
        </p>
      </div>
    </div>
  );
}
