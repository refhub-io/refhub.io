import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  persistLastLoginProvider,
  persistPendingLastLoginProvider,
  consumePendingLastLoginProvider,
} from '@/lib/authProviders';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithGitHub: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const persistAuthProvider = () => {
      const pendingProvider = consumePendingLastLoginProvider();
      if (pendingProvider) {
        persistLastLoginProvider(pendingProvider);
      }
      // Never infer provider from session metadata: for multi-provider users
      // app_metadata.provider reflects the original signup provider, not the
      // most recent one. The pending mechanism and explicit signIn() call are
      // the only authoritative sources.
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        // Only consume/apply the pending provider on an actual fresh sign-in.
        // INITIAL_SESSION, TOKEN_REFRESHED, etc. should not touch it — a stale
        // pending key (e.g. from an abandoned OAuth flow) would otherwise corrupt
        // the stored provider.
        if (event === 'SIGNED_IN') {
          persistAuthProvider();
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/auth/callback`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      persistLastLoginProvider('email');
    }
    
    return { error: error as Error | null };
  };

  const signInWithGoogle = async () => {
    persistPendingLastLoginProvider('google');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      persistPendingLastLoginProvider(null);
    }

    return { error: error as Error | null };
  };

  const signInWithGitHub = async () => {
    persistPendingLastLoginProvider('github');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      persistPendingLastLoginProvider(null);
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Keep last login provider so the sign-in screen can still highlight last used provider.
    // This improves the next-auth path when users sign out and then sign back in.
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signInWithGoogle, signInWithGitHub, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
