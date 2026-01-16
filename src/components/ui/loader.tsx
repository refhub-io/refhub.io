import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface LoaderProps {
  message?: string;
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

export function Loader({ message, className }: LoaderProps) {
  const [dots, setDots] = useState('');
  const [currentMessage, setCurrentMessage] = useState(message || loadingMessages[0]);
  const [progress, setProgress] = useState(0);

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

    // Progress to 100% in 3 seconds with random increments
    const startTime = Date.now();
    const duration = 3000; // 3 seconds
    
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const targetProgress = Math.min((elapsed / duration) * 100, 100);
      
      setProgress(prev => {
        // Add random variation but trend towards target
        const diff = targetProgress - prev;
        const increment = Math.random() * Math.max(diff * 0.5, 2);
        const newProgress = Math.min(prev + increment, 100);
        return newProgress;
      });

      // Stop when we reach 100%
      if (elapsed >= duration) {
        setProgress(100);
      }
    }, 100);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(messageInterval);
      clearInterval(progressInterval);
    };
  }, [message]);

  return (
    <div className={cn("flex flex-col items-center gap-6 p-4 sm:p-8", className)}>
      {/* Terminal-style window */}
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
              <span>{currentMessage}{dots}</span>
            </div>
            
            {/* Progress bar */}
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            {/* Progress percentage */}
            <div className="text-right text-xs text-muted-foreground">
              {progress.toFixed(0)}%
            </div>
          </div>

          {/* Blinking cursor */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-primary">▸</span>
            <span className="inline-block w-2 h-4 bg-primary animate-pulse" />
          </div>
        </div>
      </div>

      {/* Rotating DNA/helix loader */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-secondary animate-spin-reverse" style={{ animationDuration: '1.5s' }} />
      </div>

      {/* Fun status message */}
      <p className="text-xs text-muted-foreground font-mono text-center max-w-xs">
        // brewing_coffee_for_the_neural_network ☕
      </p>
    </div>
  );
}

// Simple inline loader for buttons and small spaces
export function InlineLoader({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

// Minimal spinner loader
export function SpinnerLoader({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-8 h-8", className)}>
      <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
    </div>
  );
}
