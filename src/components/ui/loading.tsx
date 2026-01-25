import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

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