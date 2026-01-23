import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  username: string | null;
  bio: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  bluesky_url: string | null;
  is_setup: boolean;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      if (!data) {
      }
      setProfile(data as Profile | null);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Always refetch profile when user changes (login/logout)
  useEffect(() => {
    fetchProfile();
    // Reset profile state if user logs out
    if (!user) {
      setProfile(null);
    }
  }, [user, fetchProfile]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      // Always fetch the latest profile from Supabase after update
      await fetchProfile();
      toast({ title: 'Profile updated ✨' });
      return { error: null };
    } catch (error) {
      toast({
        title: 'Error updating profile',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return { error };
    }
  };

  const checkUsernameAvailable = async (username: string): Promise<boolean> => {
    if (!username || username.length < 3) return false;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('user_id', user?.id || '')
        .maybeSingle();

      if (error) throw error;
      return data === null;
    } catch (error) {
      return false;
    }
  };

  return {
    profile,
    loading,
    updateProfile,
    checkUsernameAvailable,
    refetch: fetchProfile,
  };
}
