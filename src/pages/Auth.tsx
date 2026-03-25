import { useState, useMemo } from 'react';
import { logger } from '@/lib/logger';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, ArrowRight, Sparkles, Check, X } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ensureProfileExists } from '@/lib/profile';
import { resolvePostAuthRedirect } from '@/lib/authRedirect';
import { AuthProviderBadge } from '@/components/auth/AuthProviderBadge';
import { getPersistedLastLoginProvider, getAuthProviderLabel, type SupportedOAuthProvider } from '@/lib/authProviders';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.2v3.95h5.49c-.24 1.28-.98 2.37-2.05 3.1l3.31 2.57c1.93-1.78 3.05-4.4 3.05-7.52 0-.73-.07-1.43-.2-2.1H12Z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.06-.91 6.75-2.46l-3.31-2.57c-.92.62-2.1 1-3.44 1-2.64 0-4.88-1.79-5.67-4.19l-3.42 2.64A9.99 9.99 0 0 0 12 22Z" />
      <path fill="#4A90E2" d="M6.33 13.78A5.98 5.98 0 0 1 6 12c0-.62.11-1.22.33-1.78L2.91 7.58A9.98 9.98 0 0 0 2 12c0 1.61.38 3.13 1.05 4.42l3.28-2.64Z" />
      <path fill="#FBBC05" d="M12 6.04c1.49 0 2.82.51 3.87 1.5l2.9-2.9C17.05 3.02 14.75 2 12 2 8.09 2 4.72 4.24 3.05 7.58l3.28 2.64c.79-2.4 3.03-4.18 5.67-4.18Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58l-.02-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.34-1.75-1.34-1.75-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.82 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.31-5.46-1.33-5.46-5.91 0-1.31.47-2.39 1.24-3.23-.12-.31-.54-1.56.12-3.24 0 0 1.01-.32 3.3 1.23a11.45 11.45 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.68.24 2.93.12 3.24.77.84 1.24 1.92 1.24 3.23 0 4.59-2.81 5.6-5.49 5.9.43.37.82 1.11.82 2.25l-.02 3.33c0 .32.21.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function OAuthButton({
  provider,
  onClick,
  disabled,
  loading,
}: {
  provider: SupportedOAuthProvider;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  const Icon = provider === 'google' ? GoogleIcon : GitHubIcon;

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'h-11 w-full justify-between border-fuchsia-400/30 bg-slate-950/60 font-mono text-slate-100 shadow-[0_0_0_1px_rgba(244,114,182,0.04)] hover:bg-fuchsia-500/10 hover:text-white',
        provider === 'github' && 'border-pink-400/30 hover:bg-pink-500/10'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Icon />
        </span>
        {loading ? `connecting_${provider}...` : `continue_with_${provider}`}
      </span>
      <ArrowRight className="w-4 h-4 text-fuchsia-200" />
    </Button>
  );
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  checks: {
    minLength: boolean;
    hasUpperCase: boolean;
    hasLowerCase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
  };
}

function calculatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  
  let score = 0;
  let label = '';
  let color = '';

  if (password.length === 0) {
    return { score: 0, label: '', color: '', checks };
  }

  if (passedChecks <= 2) {
    score = 1;
    label = 'weak';
    color = 'bg-red-500';
  } else if (passedChecks === 3) {
    score = 2;
    label = 'fair';
    color = 'bg-orange-500';
  } else if (passedChecks === 4) {
    score = 3;
    label = 'good';
    color = 'bg-yellow-500';
  } else {
    score = 4;
    label = 'strong';
    color = 'bg-green-500';
  }

  return { score, label, color, checks };
}

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [oauthProviderLoading, setOauthProviderLoading] = useState<SupportedOAuthProvider | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp, signInWithGoogle, signInWithGitHub } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const passwordStrength = useMemo(() => calculatePasswordStrength(password), [password]);
  const lastOAuthProvider = useMemo(() => getPersistedLastLoginProvider(), []);
  const isBusy = credentialLoading || oauthProviderLoading !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Password strength validation for sign up
    if (isSignUp) {
      if (password.length < 8) {
        toast({
          title: 'weak_password',
          description: 'Password must be at least 8 characters long.',
          variant: 'destructive',
        });
        return;
      }
      if (passwordStrength.score < 3) {
        toast({
          title: 'weak_password',
          description: 'Please create a stronger password with a mix of uppercase, lowercase, numbers, and special characters.',
          variant: 'destructive',
        });
        return;
      }
    }

    setCredentialLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, displayName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'account_exists',
              description: 'This email is already registered. Please sign in instead.',
              variant: 'destructive',
            });
          } else {
            throw error;
          }
        } else {
          toast({
            title: 'welcome_to_refhub.io!',
            description: 'Your account has been created successfully.',
          });
          const {
            data: { user, session },
          } = await supabase.auth.getUser().then(async ({ data, error }) => {
            if (error) throw error;
            const sessionData = await supabase.auth.getSession();
            return { data: { user: data.user, session: sessionData.data.session } };
          });

          if (user && session) {
            const profile = await ensureProfileExists(user);
            navigate(resolvePostAuthRedirect(profile), { replace: true });
          } else {
            navigate('/signup-next-steps');
          }
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: 'sign_in_failed',
            description: 'Invalid email or password. Please try again.',
            variant: 'destructive',
          });
        } else {
          // Get current user from Supabase Auth
          const {
            data: { user },
            error: userError
          } = await supabase.auth.getUser();
          if (userError || !user) {
            navigate('/');
            return;
          }
          const profile = await ensureProfileExists(user);

          if (!profile) {
            logger.error('Auth', 'Failed to create or fetch profile');
            navigate('/');
          } else {
            navigate(resolvePostAuthRedirect(profile), { replace: true });
          }
        }
      }
    } catch (error) {
      toast({
        title: 'error',
        description: (error as Error).message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setCredentialLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: SupportedOAuthProvider) => {
    setOauthProviderLoading(provider);

    try {
      const action = provider === 'google' ? signInWithGoogle : signInWithGitHub;
      const { error } = await action();

      if (error) {
        toast({
          title: `${provider}_sign_in_failed`,
          description: error.message || `Unable to connect ${getAuthProviderLabel(provider)} right now.`,
          variant: 'destructive',
        });
        setOauthProviderLoading(null);
      }
    } catch (error) {
      toast({
        title: `${provider}_sign_in_failed`,
        description: (error as Error).message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setOauthProviderLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-purple/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-neon-green/10 via-transparent to-transparent" />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-neon-purple/30 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-neon-green/20 rounded-full blur-[128px]" />
      
      <div className="w-full max-w-md animate-fade-in relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold">
            <span className="text-gradient">refhub</span>
            <span className="text-muted-foreground">.io</span>
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm">// your research, organized</p>
        </div>

        <Card className="border-2 border-border/50 bg-card/80 backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center font-mono">
              {isSignUp ? 'create_account' : 'welcome_back'}
            </CardTitle>
            <CardDescription className="text-center font-mono text-xs">
              {isSignUp
                ? '// start organizing your papers today'
                : '// sign in to access your library'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-fuchsia-500/20 bg-black/20 p-3">
                <OAuthButton
                  provider="google"
                  onClick={() => handleOAuthSignIn('google')}
                  disabled={isBusy}
                  loading={oauthProviderLoading === 'google'}
                />
                <OAuthButton
                  provider="github"
                  onClick={() => handleOAuthSignIn('github')}
                  disabled={isBusy}
                  loading={oauthProviderLoading === 'github'}
                />
                <div className="flex items-center justify-between gap-3 px-1 pt-1">
                  <p className="text-[11px] font-mono text-muted-foreground">
                    // social login keeps email/password available below
                  </p>
                  {lastOAuthProvider && <AuthProviderBadge provider={lastOAuthProvider} />}
                </div>
              </div>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
                  or_use_email
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-sm font-semibold font-mono">display_name</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="your name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="pl-11"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold font-mono">email</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold font-mono">password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={isSignUp ? 8 : 6}
                    className="pl-11 pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    tabIndex={0}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                
                {/* Password strength indicator for sign up */}
                {isSignUp && password.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {/* Strength bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">strength:</span>
                        <span className={cn(
                          "text-xs font-mono font-semibold",
                          passwordStrength.score === 1 && "text-red-500",
                          passwordStrength.score === 2 && "text-orange-500",
                          passwordStrength.score === 3 && "text-yellow-500",
                          passwordStrength.score === 4 && "text-green-500"
                        )}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-all duration-300",
                              level <= passwordStrength.score
                                ? passwordStrength.color
                                : "bg-muted"
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Requirements checklist */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        {passwordStrength.checks.minLength ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "font-mono",
                          passwordStrength.checks.minLength ? "text-green-500" : "text-muted-foreground"
                        )}>
                          at_least_8_characters
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {passwordStrength.checks.hasUpperCase ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "font-mono",
                          passwordStrength.checks.hasUpperCase ? "text-green-500" : "text-muted-foreground"
                        )}>
                          uppercase_letter_(a-z)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {passwordStrength.checks.hasLowerCase ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "font-mono",
                          passwordStrength.checks.hasLowerCase ? "text-green-500" : "text-muted-foreground"
                        )}>
                          lowercase_letter_(a-z)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {passwordStrength.checks.hasNumber ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "font-mono",
                          passwordStrength.checks.hasNumber ? "text-green-500" : "text-muted-foreground"
                        )}>
                          number_(0-9)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {passwordStrength.checks.hasSpecialChar ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "font-mono",
                          passwordStrength.checks.hasSpecialChar ? "text-green-500" : "text-muted-foreground"
                        )}>
                          special_character_(!@#$...)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="glow"
                className="w-full font-mono"
                disabled={isBusy}
              >
                  {credentialLoading ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="xs" variant="inverted" />
                      {isSignUp ? 'creating...' : 'signing in...'}
                    </span>
                  ) : (
                  <span className="flex items-center gap-2">
                    {isSignUp ? 'create_account' : 'sign_in'}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>

            </form>
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors font-mono"
                disabled={isBusy}
              >
                {isSignUp
                  ? '// already have an account? sign_in'
                  : "// don't have an account? sign_up"}
              </button>
            </div>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono font-bold bg-transparent border-0 p-0 cursor-pointer"
                onClick={() => navigate('/reset-password')}
                disabled={isBusy}
              >
                forgot_my_password();
              </button>
            </div>

            <div className="mt-5 border-t border-border/60 pt-4 text-center">
              <p className="text-[11px] font-mono text-muted-foreground">
                By continuing, you agree to the{' '}
                <Link to="/tos" className="text-primary transition-colors hover:text-primary/80 hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-primary transition-colors hover:text-primary/80 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6 font-mono">
          built for researchers, by researchers ✨
        </p>
      </div>
    </div>
  );
}
