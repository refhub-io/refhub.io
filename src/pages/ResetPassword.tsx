import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { toast } = useToast();
  const resetFormRef = useRef<HTMLFormElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Detect if user is in a password recovery session
  useEffect(() => {
    const checkRecoverySession = async () => {
      setCheckingSession(true);
      
      try {
        // Check URL hash for recovery token (Supabase PKCE flow)
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const type = params.get('type');
        
        // If we have a recovery token in the URL, handle it
        if (accessToken && type === 'recovery') {
          // Set the session from the URL parameters
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: params.get('refresh_token') || '',
          });
          
          if (error) {
            toast({
              title: 'Recovery link is invalid',
              description: 'This password recovery link is invalid or has expired. Request a new reset email and try again.',
              variant: 'destructive', feedbackSeverity: 'error',
              source: resetFormRef,
            });
            setIsRecovery(false);
          } else if (data.session) {
            setIsRecovery(true);
            // Clear the hash from URL for cleaner UX
            window.history.replaceState(null, '', window.location.pathname);
          }
        } else {
          // Check for existing session
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.user) {
            // Check if this is a recovery session by looking at auth events
            // or if the user arrived here from a recovery link
            const isRecoverySession = hash.includes('type=recovery') || 
              sessionStorage.getItem('passwordRecovery') === 'true';
            
            if (isRecoverySession) {
              setIsRecovery(true);
              sessionStorage.removeItem('passwordRecovery');
            }
          }
        }
      } catch (error) {
        logger.error('ResetPassword', 'Error checking recovery session:', error);
      } finally {
        setCheckingSession(false);
      }
    };

    // Listen for auth state changes (handles redirect flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
        setCheckingSession(false);
      }
    });

    checkRecoverySession();

    return () => {
      subscription.unsubscribe();
    };
  }, [toast]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({
        title: 'Reset email failed',
        description: error.message || 'RefHub could not send the password reset email. Check the address and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: resetFormRef,
      });
    } else {
      setSent(true);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({
        title: 'Password is too short',
        description: 'Use at least 8 characters for the new password.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: newPasswordRef,
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'The confirmation password is different. Re-enter it and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: confirmPasswordRef,
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast({
        title: 'Password reset failed',
        description: error.message || 'RefHub could not update your password. Request a new reset link if this keeps happening.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: resetFormRef,
      });
    } else {
      setResetSuccess(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card/80 border-2 border-border/50 rounded-xl shadow-lg p-8 text-center animate-fade-in">
        <h1 className="text-2xl font-bold mb-4 text-gradient font-mono">reset_password();</h1>
        {checkingSession ? (
          <div className="text-muted-foreground font-mono text-sm">
            // checking_session...
          </div>
        ) : isRecovery ? (
          resetSuccess ? (
            <div>
              <p className="text-muted-foreground mb-6 font-mono text-sm">
                // your password has been updated<br />
                // you may now log in with your new password
              </p>
              <Button variant="glow" className="w-full font-mono" onClick={() => {
                // Check if there's a redirect URL stored in localStorage
                const redirectAfterLogin = localStorage.getItem('redirectAfterLogin');
                if (redirectAfterLogin) {
                  localStorage.removeItem('redirectAfterLogin'); // Clean up
                  navigate(redirectAfterLogin);
                } else {
                  navigate('/auth');
                }
              }}>
                return_to_login()
              </Button>
            </div>
          ) : (
            <form ref={resetFormRef} onSubmit={handleSetNewPassword} className="space-y-4">
              <p className="text-muted-foreground mb-6 font-mono text-sm">
                // enter your new password below
              </p>
              <div>
                <Label htmlFor="newPassword" className="text-sm font-semibold font-mono">new_password</Label>
                <Input
                  id="newPassword"
                  ref={newPasswordRef}
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-sm font-semibold font-mono">confirm_password</Label>
                <Input
                  id="confirmPassword"
                  ref={confirmPasswordRef}
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="mt-1 font-mono"
                />
              </div>
              <Button type="submit" variant="glow" className="w-full font-mono" disabled={loading}>
                {loading ? 'updating...' : 'set_new_password()'}
              </Button>
            </form>
          )
        ) : sent ? (
          <div>
            <p className="text-muted-foreground mb-6 font-mono text-sm">
              // an email has been sent to your inbox<br />
              // follow the instructions to set a new password
            </p>
            <Button variant="glow" className="w-full font-mono" onClick={() => navigate('/auth')}>
              return_to_login()
            </Button>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mb-6 font-mono text-sm">
              // enter your email and we'll send you a reset link
            </p>
            <form ref={resetFormRef} onSubmit={handleReset} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-sm font-semibold font-mono">email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="mt-1 font-mono"
                />
              </div>
              <Button type="submit" variant="glow" className="w-full font-mono" disabled={loading}>
                {loading ? 'sending...' : 'send_reset_link'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
