import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'subtle' | 'inverted' | 'gradient';
  className?: string;
}

interface LoadingTextProps {
  text?: string;
  dots?: boolean;
  className?: string;
}

interface LoadingButtonProps {
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

interface FullScreenLoaderProps {
  message?: string;
  variant?: 'terminal' | 'minimal' | 'centered';
  progress?: boolean;
  className?: string;
}

export interface LoadingPhase {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'complete' | 'error';
}

interface PhaseLoaderProps {
  phases: LoadingPhase[];
  title?: string;
  subtitle?: string;
  className?: string;
  progress?: number; // Optional external progress override (0-100)
}

const loadingMessages = [
  'initializing_neurons...',
  'compiling_knowledge_graph...',
  'parsing_bibtex_quantum_state...',
  'loading_research_matrix...',
  'bootstrapping_citations...',
  'indexing_academic_vectors...',
  'calibrating_reference_engine...',
  'establishing_paper_connections...',
  'synchronizing_vault_data...',
  'decrypting_doi_algorithms...',
];

// Core spinner component with consistent styling
export function LoadingSpinner({ size = 'md', variant = 'default', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6', 
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const borderClasses = {
    xs: 'border-2',
    sm: 'border-2',
    md: 'border-2',
    lg: 'border-3',
    xl: 'border-4'
  };

  const variantClasses = {
    default: 'border-primary/20 border-t-primary',
    subtle: 'border-muted/30 border-t-muted-foreground',
    inverted: 'border-background/50 border-t-foreground',
    gradient: 'border-primary/20 border-t-transparent'
  };

  return (
    <div className={cn(
      "relative rounded-full",
      sizeClasses[size],
      borderClasses[size],
      variantClasses[variant],
      className
    )}>
      <div className={cn(
        "absolute inset-0 rounded-full border-transparent animate-spin",
        borderClasses[size],
        variant === 'gradient' ? 'border-t-primary' : ''
      )} />
      {variant === 'gradient' && (
        <div className="absolute inset-1 rounded-full border border-transparent border-t-secondary animate-spin-reverse" style={{ animationDuration: '1.5s' }} />
      )}
    </div>
  );
}

// Loading text with optional animated dots
export function LoadingText({ text, dots = true, className }: LoadingTextProps) {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (!dots) return;
    
    const interval = setInterval(() => {
      setDotCount(prev => (prev + 1) % 4);
    }, 400);
    
    return () => clearInterval(interval);
  }, [dots]);

  return (
    <span className={cn("font-mono text-sm text-muted-foreground", className)}>
      {text}
      {dots && <span className="inline-block w-4">{'.'.repeat(dotCount)}</span>}
    </span>
  );
}

// Enhanced button loading state
export function LoadingButton({ loading, children, className, disabled, ...props }: LoadingButtonProps) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center gap-2 font-mono transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      disabled={loading || disabled}
      {...props}
    >
      {loading && (
        <LoadingSpinner size="xs" variant="default" />
      )}
      <span className={cn("transition-opacity", loading && "opacity-70")}>
        {children}
      </span>
    </button>
  );
}

// Inline loader for tight spaces (buttons, forms, etc.)
export function InlineLoader({ size = 'sm', variant = 'default', className }: Omit<LoadingSpinnerProps, 'variant'> & { variant?: 'default' | 'subtle' }) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <LoadingSpinner size={size} variant={variant} />
      <LoadingText text="loading" dots={false} />
    </div>
  );
}

// Compact three-dot loader for minimal spaces
export function CompactLoader({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

// Enhanced full-screen loader with multiple variants
export function FullScreenLoader({ message, variant = 'terminal', progress = false, className }: FullScreenLoaderProps) {
  const [dots, setDots] = useState('');
  const [currentMessage, setCurrentMessage] = useState(message || loadingMessages[0]);
  const [progressValue, setProgressValue] = useState(0);

  useEffect(() => {
    // Animate dots
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);

    // Rotate messages if no custom message
    let messageInterval: NodeJS.Timeout;
    if (!message) {
      messageInterval = setInterval(() => {
        setCurrentMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
      }, 2000);
    }

    // Progress to 100% in 3 seconds if enabled
    if (progress) {
      const startTime = Date.now();
      const duration = 3000;
      
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const targetProgress = Math.min((elapsed / duration) * 100, 100);
        
        setProgressValue(prev => {
          const diff = targetProgress - prev;
          const increment = Math.random() * Math.max(diff * 0.5, 2);
          const newProgress = Math.min(prev + increment, 100);
          return newProgress;
        });

        if (elapsed >= duration) {
          setProgressValue(100);
        }
      }, 100);

      return () => {
        clearInterval(dotsInterval);
        clearInterval(messageInterval);
        clearInterval(progressInterval);
      };
    }

    return () => {
      clearInterval(dotsInterval);
      if (messageInterval) clearInterval(messageInterval);
    };
  }, [message, progress]);

  if (variant === 'minimal') {
    return (
      <div className={cn("flex flex-col items-center justify-center min-h-screen bg-background", className)}>
        <LoadingSpinner size="lg" variant="default" />
        <LoadingText text={message || "loading..."} className="mt-4" />
      </div>
    );
  }

  if (variant === 'centered') {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8", className)}>
        <LoadingSpinner size="md" variant="default" />
        <LoadingText text={message || "loading..."} className="mt-3" />
      </div>
    );
  }

  // Terminal variant (default, maintains existing cool aesthetic)
  return (
    <div className={cn("flex flex-col items-center justify-center min-h-screen bg-background", className)}>
      <div className="w-full max-w-xl bg-card border-2 border-border rounded-lg overflow-hidden shadow-xl">
        {/* Terminal header */}
        <div className="bg-muted/50 px-4 py-2 flex items-center gap-2 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs font-mono text-muted-foreground ml-2">refhub.io</span>
        </div>

        {/* Terminal content */}
        <div className="p-4 sm:p-6 font-mono text-sm space-y-4">
          {/* ASCII art logo */}
          <pre className="text-gradient text-[10px] sm:text-xs leading-tight select-none overflow-x-auto">
{`
 *******   ******** ******** **      ** **     ** ******  
/**////** /**///// /**///// /**     /**/**    /**/*////** 
/**   /** /**      /**      /**     /**/**    /**/*   /** 
/*******  /******* /******* /**********/**    /**/******  
/**///**  /**////  /**////  /**//////**/**    /**/*//// **
/**  //** /**      /**      /**     /**/**    /**/*    /**
/**   //**/********/**      /**     /**//******* /******* 
//     // //////// //       //      //  ///////  ///////  
`}
          </pre>

          {/* Loading message */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-primary">$</span>
              <LoadingText text={currentMessage || 'initializing_system...'} dots={false} />
              {dots && <span className="text-primary">{dots}</span>}
            </div>
            
            {/* Progress bar */}
            {progress && (
              <>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-primary transition-all duration-300 ease-out"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {progressValue.toFixed(0)}%
                </div>
              </>
            )}
          </div>

          {/* Blinking cursor */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-primary">▸</span>
            <div className="inline-block w-2 h-4 bg-primary animate-pulse" />
          </div>
        </div>
      </div>

      {/* Rotating DNA/helix loader */}
      <div className="relative mt-6">
        <LoadingSpinner size="xl" variant="gradient" />
      </div>

      {/* Fun status message */}
      <p className="text-xs text-muted-foreground font-mono text-center max-w-xs mt-6">
        // brewing_coffee_for_the_neural_network ☕
      </p>
    </div>
  );
}

// Legacy exports for backward compatibility
export function Loader({ message, className }: { message?: string; className?: string }) {
  return <FullScreenLoader message={message} className={className} />;
}

export function InlineLoaderCompat({ className }: { className?: string }) {
  return <CompactLoader className={className} />;
}

// Phase-based loader with progress visualization
export function PhaseLoader({ phases, title = 'initializing_refhub', subtitle, className, progress: externalProgress }: PhaseLoaderProps) {
  const [dots, setDots] = useState('');
  const [glitchText, setGlitchText] = useState(false);

  // Calculate progress based on phases, or use external progress if provided
  const progress = useMemo(() => {
    if (externalProgress !== undefined) {
      return Math.round(externalProgress);
    }
    const completed = phases.filter(p => p.status === 'complete').length;
    const loading = phases.filter(p => p.status === 'loading').length;
    return Math.round(((completed + loading * 0.5) / phases.length) * 100);
  }, [phases, externalProgress]);

  const currentPhase = useMemo(() => {
    return phases.find(p => p.status === 'loading') || phases.find(p => p.status === 'pending');
  }, [phases]);

  const allComplete = useMemo(() => {
    return phases.every(p => p.status === 'complete');
  }, [phases]);

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Random glitch effect
  useEffect(() => {
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.85) {
        setGlitchText(true);
        setTimeout(() => setGlitchText(false), 100);
      }
    }, 500);
    return () => clearInterval(glitchInterval);
  }, []);

  return (
    <div className={cn("min-h-screen bg-background flex items-center justify-center", className)}>
      <div className="w-full max-w-lg px-6">
        {/* Terminal window */}
        <div className="bg-card border-2 border-border rounded-lg overflow-hidden shadow-2xl">
          {/* Terminal header */}
          <div className="bg-muted/50 px-4 py-2 flex items-center gap-2 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors" />
              <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors" />
            </div>
            <span className="text-xs font-mono text-muted-foreground ml-2">refhub.io — loading</span>
          </div>

          {/* Terminal content */}
          <div className="p-6 font-mono text-sm space-y-6">
            {/* Title with glitch effect */}
            <div className="space-y-1">
              <h1 className={cn(
                "text-xl font-bold transition-all duration-75",
                glitchText && "text-primary translate-x-[1px] skew-x-1"
              )}>
                <span className="text-primary">$</span> {title}
                <span className="text-primary animate-pulse">{dots}</span>
              </h1>
              {subtitle && (
                <p className="text-muted-foreground text-xs pl-4">// {subtitle}</p>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>progress</span>
                <span className="text-primary tabular-nums">{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full"
                  style={{ 
                    width: `${progress}%`,
                    transition: 'width 150ms ease-out'
                  }}
                />
              </div>
            </div>

            {/* Phase list */}
            <div className="space-y-2 border-l-2 border-border pl-4 ml-1">
              {phases.map((phase, index) => (
                <div 
                  key={phase.id}
                  className={cn(
                    "flex items-center gap-3 text-sm transition-all duration-300",
                    phase.status === 'complete' && "text-green-500",
                    phase.status === 'loading' && "text-primary",
                    phase.status === 'pending' && "text-muted-foreground/50",
                    phase.status === 'error' && "text-destructive"
                  )}
                  style={{ 
                    animationDelay: `${index * 100}ms`,
                    opacity: phase.status === 'pending' ? 0.4 : 1
                  }}
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {phase.status === 'complete' && (
                      <Check className="w-4 h-4 animate-in zoom-in duration-200" />
                    )}
                    {phase.status === 'loading' && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {phase.status === 'pending' && (
                      <div className="w-2 h-2 rounded-full bg-current" />
                    )}
                    {phase.status === 'error' && (
                      <span className="text-xs">✗</span>
                    )}
                  </div>
                  <span className={cn(
                    "transition-all duration-300",
                    phase.status === 'loading' && "font-semibold"
                  )}>
                    {phase.label}
                    {phase.status === 'loading' && <span className="text-primary">{dots}</span>}
                  </span>
                </div>
              ))}
            </div>

            {/* Current operation */}
            {currentPhase && !allComplete && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-primary">▸</span>
                  <span>executing: </span>
                  <span className="text-foreground">{currentPhase.label}</span>
                  <div className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                </div>
              </div>
            )}

            {/* Completion message */}
            {allComplete && (
              <div className="pt-2 border-t border-border animate-in fade-in duration-500">
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <span>▸</span>
                  <span>initialization_complete ✨</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fun footer message */}
        <p className="text-xs text-muted-foreground font-mono text-center mt-6 animate-pulse">
          // {allComplete ? 'ready_to_explore_your_research 🚀' : 'brewing_knowledge_graphs ☕'}
        </p>
      </div>
    </div>
  );
}

// Hook to manage loading phases
export function useLoadingPhases(initialPhases: { id: string; label: string }[]) {
  const [phases, setPhases] = useState<LoadingPhase[]>(
    initialPhases.map((p, index) => ({
      ...p,
      status: index === 0 ? 'loading' : 'pending'
    }))
  );

  const completePhase = (phaseId: string) => {
    setPhases(prev => {
      const index = prev.findIndex(p => p.id === phaseId);
      if (index === -1) return prev;

      const newPhases = [...prev];
      newPhases[index] = { ...newPhases[index], status: 'complete' };
      
      // Start next pending phase
      const nextPending = newPhases.findIndex(p => p.status === 'pending');
      if (nextPending !== -1) {
        newPhases[nextPending] = { ...newPhases[nextPending], status: 'loading' };
      }
      
      return newPhases;
    });
  };

  const setPhaseLoading = (phaseId: string) => {
    setPhases(prev => prev.map(p => 
      p.id === phaseId ? { ...p, status: 'loading' } : p
    ));
  };

  const setPhaseError = (phaseId: string) => {
    setPhases(prev => prev.map(p => 
      p.id === phaseId ? { ...p, status: 'error' } : p
    ));
  };

  const resetPhases = () => {
    setPhases(initialPhases.map((p, index) => ({
      ...p,
      status: index === 0 ? 'loading' : 'pending'
    })));
  };

  const allComplete = phases.every(p => p.status === 'complete');

  return { phases, completePhase, setPhaseLoading, setPhaseError, resetPhases, allComplete };
}