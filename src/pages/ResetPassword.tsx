import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { toast } = useToast();
  const navigate = useNavigate();

  // Detect if user is in a password recovery session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user && session.user.email && session.user.aud === 'authenticated' && session.user.email_confirmed_at) {
        // Not a recovery session
        setIsRecovery(false);
      } else if (session && session.user) {
        // If session exists but not fully confirmed, treat as recovery
        setIsRecovery(true);
      } else {
        // Try to detect recovery from URL (Supabase sets session automatically)
        const hash = window.location.hash;
        if (hash.includes('type=recovery')) {
          setIsRecovery(true);
        }
      }
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({
        title: 'reset_failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setSent(true);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({
        title: 'weak_password',
        description: 'Password must be at least 8 characters long.',
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: 'password_mismatch',
        description: 'Passwords do not match.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast({
        title: 'reset_failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setResetSuccess(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card/80 border-2 border-border/50 rounded-xl shadow-lg p-8 text-center animate-fade-in">
        <h1 className="text-2xl font-bold mb-4 text-gradient font-mono">reset_password();</h1>
        {isRecovery ? (
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
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <p className="text-muted-foreground mb-6 font-mono text-sm">
                // enter your new password below
              </p>
              <div>
                <Label htmlFor="newPassword" className="text-sm font-semibold font-mono">new_password</Label>
                <Input
                  id="newPassword"
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
            <form onSubmit={handleReset} className="space-y-4">
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
