import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  getUserAuthProvider,
  getPersistedLastLoginProvider,
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
    const persistAuthProvider = (session: Session | null) => {
      const pendingProvider = consumePendingLastLoginProvider();

      if (pendingProvider) {
        persistLastLoginProvider(pendingProvider);
        return;
      }

      // Always update from session metadata on a real sign-in event so switching
      // providers (e.g. GitHub → Google) is reflected even when the pending key
      // was already consumed by another concurrent handler.
      const inferredProvider = getUserAuthProvider(session?.user);
      if (inferredProvider) {
        persistLastLoginProvider(inferredProvider);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        persistAuthProvider(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      persistAuthProvider(session);
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
