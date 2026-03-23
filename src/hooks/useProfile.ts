import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Profile, ensureProfileExists } from '@/lib/profile';

export type { Profile };

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
      const profileData = await ensureProfileExists(user);
      setProfile(profileData);
    } catch (error) {
      logger.error('useProfile', 'Error fetching profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  // Use user?.id so Supabase token refreshes (which create new user object
  // references without changing the user) don't trigger a re-fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Refetch only when the user ID changes (login / logout), not on every
  // token refresh that produces a new user object reference.
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user || !profile) return { error: new Error('Not authenticated or no profile') };

    try {
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      setProfile(updatedProfile as Profile);
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
      logger.error('useProfile', 'Error checking username availability:', error);
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
