import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle the auth callback
    const handleAuthCallback = async () => {
      try {
        // Get the hash from URL (Supabase puts tokens in hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        if (accessToken && type === 'signup') {
          // Email confirmed successfully
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          // Check if there's a redirect URL stored in localStorage
          const redirectAfterLogin = localStorage.getItem('redirectAfterLogin');
          if (redirectAfterLogin) {
            localStorage.removeItem('redirectAfterLogin'); // Clean up
            // Redirect to the stored URL
            setTimeout(() => {
              navigate(redirectAfterLogin);
            }, 1500);
          } else {
            // Redirect to dashboard
            setTimeout(() => {
              navigate('/dashboard');
            }, 1500);
          }
        } else {
          // If no valid tokens, redirect to auth page
          navigate('/auth');
        }
      } catch (error) {
        navigate('/auth');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple animate-glow-pulse">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold font-mono">// email_confirmed ✨</h1>
        <p className="text-muted-foreground font-mono text-sm">
          // redirecting_to_dashboard...
        </p>
      </div>
    </div>
  );
}
