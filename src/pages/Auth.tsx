import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, ArrowRight, Sparkles, Check, X } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { cn } from '@/lib/utils';

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
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const passwordStrength = useMemo(() => calculatePasswordStrength(password), [password]);

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

    setLoading(true);

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
          navigate('/signup-next-steps');
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
          // Check if profile is incomplete (stub: always redirect for now)
          navigate('/profile-edit');
        }
      }
    } catch (error) {
      toast({
        title: 'error',
        description: (error as Error).message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              >
                {isSignUp
                  ? '// already have an account? sign_in'
                  : "// don't have an account? sign_up"}
              </button>
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
