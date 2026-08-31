import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Profile, ensureProfileExists } from '@/lib/profile';

export type { Profile };

type ProfileFeedbackSource = EventTarget | Element | { current: Element | null } | null;

interface UpdateProfileOptions {
  silent?: boolean;
  source?: ProfileFeedbackSource;
}

export function profileQueryKey(userId: string | undefined) {
  return ['profile', userId] as const;
}

// react-query-backed so every page sharing this hook (all of them) reads the
// same cached profile instead of independently fetching it from empty state
// on every mount — that's what caused the sidebar avatar to reset to its
// placeholder on every page navigation before this.
export function useProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: profileQueryKey(user?.id),
    queryFn: async () => {
      try {
        return await ensureProfileExists(user!);
      } catch (error) {
        logger.error('useProfile', 'Error fetching profile:', error);
        return null;
      }
    },
    enabled: !!user,
  });

  const profile = query.data ?? null;

  const updateProfile = async (updates: Partial<Profile>, options: UpdateProfileOptions = {}) => {
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

      // Written straight into the shared cache (not just a local refetch) so
      // every other mounted page's useProfile() picks up the change immediately.
      queryClient.setQueryData(profileQueryKey(user.id), updatedProfile as Profile);
      if (!options.silent) {
        toast({ title: 'Profile updated ✨', source: options.source });
      }
      return { error: null };
    } catch (error) {
      toast({
        title: 'Error updating profile',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
        source: options.source,
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
    loading: query.isLoading,
    updateProfile,
    checkUsernameAvailable,
    refetch: query.refetch,
  };
}
