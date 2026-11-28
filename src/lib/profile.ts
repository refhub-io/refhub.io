import { User } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/database';
import { extractAuthProfileMetadata } from '@/lib/authProviders';

/**
 * The profile columns clients can read: everything but email, which the database doesn't grant
 * to clients (see migration 20261128000000_hide_profile_emails.sql). Select these instead of `*`,
 * which fails on that table. A user's own address comes from their auth session.
 */
export const PUBLIC_PROFILE_COLUMNS =
  'id, user_id, display_name, avatar_url, username, bio, github_url, linkedin_url, bluesky_url, is_setup, created_at, updated_at' as const;

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
    .select(PUBLIC_PROFILE_COLUMNS)
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
    .select(PUBLIC_PROFILE_COLUMNS)
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
