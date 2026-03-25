import { User } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/database';
import { extractAuthProfileMetadata } from '@/lib/authProviders';

async function hydrateProfileFromAuth(user: User, profile: Profile): Promise<Profile> {
  const emailFallback = user.email?.split('@')[0]?.trim();
  const { displayName, avatarUrl } = extractAuthProfileMetadata(user);
  const updates: Partial<Profile> = {};

  if (
    displayName &&
    (!profile.display_name || profile.display_name.trim() === '' || profile.display_name === emailFallback)
  ) {
    updates.display_name = displayName;
  }

  if (avatarUrl && !profile.avatar_url) {
    updates.avatar_url = avatarUrl;
  }

  if (user.email && !profile.email) {
    updates.email = user.email;
  }

  if (Object.keys(updates).length === 0) {
    return profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error) {
    logger.error('profile', 'Error hydrating profile from auth metadata:', error);
    return profile;
  }

  return data as Profile;
}

export async function ensureProfileExists(user: User): Promise<Profile | null> {
  // Check if profile exists
  const { data: existingProfile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
    logger.error('profile', 'Error fetching profile:', error);
    return null;
  }

  if (existingProfile) {
    return hydrateProfileFromAuth(user, existingProfile as Profile);
  }

  // Create profile if it doesn't exist
  const { displayName: providerDisplayName } = extractAuthProfileMetadata(user);
  const displayName = providerDisplayName ||
                     user.user_metadata?.display_name ||
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
    logger.error('profile', 'Error creating profile:', createError);
    return null;
  }

  return hydrateProfileFromAuth(user, newProfile as Profile);
}

export { type Profile };
