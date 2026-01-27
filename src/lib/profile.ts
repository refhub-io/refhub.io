import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/database';

export async function ensureProfileExists(user: User): Promise<Profile | null> {
  // Check if profile exists
  const { data: existingProfile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
    console.error('Error fetching profile:', error);
    return null;
  }

  if (existingProfile) {
    return existingProfile as Profile;
  }

  // Create profile if it doesn't exist
  const displayName = user.user_metadata?.display_name || 
                     user.email?.split('@')[0] || 
                     'Anonymous User';
  
  const { data: newProfile, error: createError } = await supabase
    .rpc('create_user_profile', {
      p_user_id: user.id,
      p_email: user.email || '',
      p_display_name: displayName
    })
    .single();

  if (createError) {
    console.error('Error creating profile:', createError);
    return null;
  }

  return newProfile as Profile;
}

export { type Profile };