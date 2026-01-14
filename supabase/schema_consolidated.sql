-- ============================================================================
-- REFHUB.IO DATABASE SCHEMA - CONSOLIDATED
-- ============================================================================
-- This is a complete, consolidated schema that combines all migrations.
-- Run this in the Supabase SQL Editor to set up a fresh database.
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  bluesky_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vaults (folders) table
CREATE TABLE public.vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  is_shared BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  public_slug TEXT UNIQUE,
  category TEXT,
  abstract TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create publications table
CREATE TABLE public.publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  authors TEXT[] DEFAULT '{}',
  year INTEGER,
  journal TEXT,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  doi TEXT,
  url TEXT,
  abstract TEXT,
  pdf_url TEXT,
  bibtex_key TEXT,
  publication_type TEXT DEFAULT 'article',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tags table with hierarchical support
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  parent_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create publication_tags junction table
CREATE TABLE public.publication_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(publication_id, tag_id)
);

-- Create vault_shares table for sharing vaults
CREATE TABLE public.vault_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  shared_with_email TEXT,
  shared_with_user_id UUID REFERENCES auth.users(id),
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT DEFAULT 'viewer' CHECK (permission IN ('viewer', 'editor')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vault stats table for tracking views and downloads
CREATE TABLE public.vault_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(vault_id)
);

-- Create publication_relations table for bidirectional labeled relationships
CREATE TABLE public.publication_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  related_publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'related',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  
  -- Prevent duplicate relationships (order matters for the unique constraint)
  CONSTRAINT unique_relation UNIQUE (publication_id, related_publication_id),
  -- Prevent self-references
  CONSTRAINT no_self_reference CHECK (publication_id != related_publication_id)
);

-- Table for vault favorites (following/subscribing to public vaults)
CREATE TABLE public.vault_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vault_id, user_id)
);

-- Table for vault forks (copies that reference the original)
CREATE TABLE public.vault_forks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE SET NULL,
  forked_vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  forked_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(forked_vault_id)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'vault_shared', 'vault_forked', 'vault_favorited'
  title TEXT NOT NULL,
  message TEXT,
  data JSONB, -- additional context like vault_id, from_user_id, etc.
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Profiles indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Vaults indexes
CREATE INDEX idx_vaults_is_public ON public.vaults(is_public) WHERE is_public = true;
CREATE INDEX idx_vaults_public_slug ON public.vaults(public_slug) WHERE public_slug IS NOT NULL;

-- Tags indexes
CREATE INDEX idx_tags_parent_id ON public.tags(parent_id);

-- Vault shares indexes
CREATE INDEX idx_vault_shares_user_id ON public.vault_shares(shared_with_user_id);

-- Publication relations indexes
CREATE INDEX idx_publication_relations_publication ON public.publication_relations(publication_id);
CREATE INDEX idx_publication_relations_related ON public.publication_relations(related_publication_id);

-- Vault favorites indexes
CREATE INDEX idx_vault_favorites_user ON public.vault_favorites(user_id);
CREATE INDEX idx_vault_favorites_vault ON public.vault_favorites(vault_id);

-- Vault forks indexes
CREATE INDEX idx_vault_forks_original ON public.vault_forks(original_vault_id);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_forks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - PROFILES
-- ============================================================================

CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view profiles of public vault owners"
ON public.profiles
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.vaults v 
  WHERE v.user_id = profiles.user_id AND v.is_public = true
));

-- ============================================================================
-- RLS POLICIES - VAULTS
-- ============================================================================

CREATE POLICY "Users can view own vaults or public vaults" 
ON public.vaults 
FOR SELECT 
USING (
  (auth.uid() = user_id) 
  OR (is_public = true) 
  OR (EXISTS (
    SELECT 1 FROM vault_shares
    WHERE vault_shares.vault_id = vaults.id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
  ))
);

CREATE POLICY "Users can insert own vaults" 
ON public.vaults 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vaults" 
ON public.vaults 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vaults" 
ON public.vaults 
FOR DELETE 
USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - PUBLICATIONS
-- ============================================================================

CREATE POLICY "Users can view publications in accessible vaults" 
ON public.publications 
FOR SELECT 
USING (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    WHERE vaults.id = publications.vault_id 
    AND (
      vaults.is_public = true 
      OR EXISTS (
        SELECT 1 FROM vault_shares
        WHERE vault_shares.vault_id = vaults.id 
        AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
      )
    )
  ))
);

CREATE POLICY "Users can insert own publications or into shared vaults with editor permission" 
ON public.publications 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission = 'editor'
  ))
);

CREATE POLICY "Users can update own publications or shared vaults with editor permission" 
ON public.publications 
FOR UPDATE 
USING (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission = 'editor'
  ))
);

CREATE POLICY "Users can delete own publications or from shared vaults with editor permission" 
ON public.publications 
FOR DELETE 
USING (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission = 'editor'
  ))
);

-- ============================================================================
-- RLS POLICIES - TAGS
-- ============================================================================

CREATE POLICY "Users can view accessible tags" 
ON public.tags 
FOR SELECT 
USING (
  (auth.uid() = user_id) 
  OR EXISTS (
    SELECT 1 FROM publication_tags
    JOIN publications ON publications.id = publication_tags.publication_id
    JOIN vaults ON vaults.id = publications.vault_id
    WHERE publication_tags.tag_id = tags.id 
    AND (
      vaults.is_public = true 
      OR EXISTS (
        SELECT 1 FROM vault_shares
        WHERE vault_shares.vault_id = vaults.id 
        AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
      )
    )
  )
);

CREATE POLICY "Users can insert own tags" 
ON public.tags 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags" 
ON public.tags 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags" 
ON public.tags 
FOR DELETE 
USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - PUBLICATION_TAGS
-- ============================================================================

CREATE POLICY "Users can view tags for accessible publications" 
ON public.publication_tags 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM publications
    WHERE publications.id = publication_tags.publication_id 
    AND (
      publications.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM vaults
        WHERE vaults.id = publications.vault_id 
        AND (
          vaults.is_public = true 
          OR EXISTS (
            SELECT 1 FROM vault_shares
            WHERE vault_shares.vault_id = vaults.id 
            AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
          )
        )
      )
    )
  )
);

CREATE POLICY "Users can insert publication tags for own publications or shared vaults with editor permission" 
ON public.publication_tags 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.publications 
    WHERE id = publication_id 
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM vaults
        JOIN vault_shares ON vault_shares.vault_id = vaults.id
        WHERE vaults.id = publications.vault_id 
        AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
        AND vault_shares.permission = 'editor'
      )
    )
  )
);

CREATE POLICY "Users can delete publication tags from own publications or shared vaults with editor permission" 
ON public.publication_tags 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.publications 
    WHERE id = publication_id 
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM vaults
        JOIN vault_shares ON vault_shares.vault_id = vaults.id
        WHERE vaults.id = publications.vault_id 
        AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
        AND vault_shares.permission = 'editor'
      )
    )
  )
);

-- ============================================================================
-- RLS POLICIES - VAULT_SHARES
-- ============================================================================

CREATE POLICY "Users can view shares for own vaults"
ON public.vault_shares
FOR SELECT
USING (
  shared_by = auth.uid() 
  OR shared_with_email = auth.email()
  OR shared_with_user_id = auth.uid()
);

CREATE POLICY "Users can share own vaults" 
ON public.vault_shares 
FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.vaults WHERE id = vault_id AND user_id = auth.uid()));

CREATE POLICY "Users can update shares for own vaults"
ON public.vault_shares
FOR UPDATE
USING (shared_by = auth.uid())
WITH CHECK (shared_by = auth.uid());

CREATE POLICY "Users can delete shares from own vaults" 
ON public.vault_shares 
FOR DELETE 
USING (shared_by = auth.uid());

-- ============================================================================
-- RLS POLICIES - VAULT_STATS
-- ============================================================================

CREATE POLICY "Anyone can view stats for public vaults"
ON public.vault_stats
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.vaults
    WHERE vaults.id = vault_stats.vault_id
    AND vaults.is_public = true
  )
);

CREATE POLICY "Owners can manage vault stats"
ON public.vault_stats
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.vaults
    WHERE vaults.id = vault_stats.vault_id
    AND vaults.user_id = auth.uid()
  )
);

-- ============================================================================
-- RLS POLICIES - PUBLICATION_RELATIONS
-- ============================================================================

CREATE POLICY "Users can view relations for accessible publications"
ON public.publication_relations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM publications p
    WHERE p.id = publication_relations.publication_id
    AND (
      p.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM vaults v
        WHERE v.id = p.vault_id
        AND (
          v.is_public = true
          OR EXISTS (
            SELECT 1 FROM vault_shares vs
            WHERE vs.vault_id = v.id
            AND (vs.shared_with_email = auth.email() OR vs.shared_with_user_id = auth.uid())
          )
        )
      )
    )
  )
);

CREATE POLICY "Users can create relations for own publications"
ON public.publication_relations
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM publications WHERE id = publication_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own relations"
ON public.publication_relations
FOR DELETE
USING (created_by = auth.uid());

-- ============================================================================
-- RLS POLICIES - VAULT_FAVORITES
-- ============================================================================

CREATE POLICY "Users can view their own favorites"
ON public.vault_favorites
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites"
ON public.vault_favorites
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their favorites"
ON public.vault_favorites
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - VAULT_FORKS
-- ============================================================================

CREATE POLICY "Anyone can view fork info for public vaults"
ON public.vault_forks
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.vaults v 
  WHERE v.id = vault_forks.original_vault_id AND v.is_public = true
) OR auth.uid() = forked_by);

CREATE POLICY "Users can create forks"
ON public.vault_forks
FOR INSERT
WITH CHECK (auth.uid() = forked_by);

-- ============================================================================
-- RLS POLICIES - NOTIFICATIONS
-- ============================================================================

CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

-- Function to validate username format
CREATE OR REPLACE FUNCTION public.validate_username()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    IF LENGTH(NEW.username) < 3 OR LENGTH(NEW.username) > 30 THEN
      RAISE EXCEPTION 'Username must be between 3 and 30 characters';
    END IF;
    IF NEW.username !~ '^[a-zA-Z0-9_]+$' THEN
      RAISE EXCEPTION 'Username can only contain letters, numbers, and underscores';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to increment vault view count
CREATE OR REPLACE FUNCTION public.increment_vault_views(vault_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vault_stats (vault_id, view_count)
  VALUES (vault_uuid, 1)
  ON CONFLICT (vault_id)
  DO UPDATE SET 
    view_count = vault_stats.view_count + 1,
    updated_at = now();
END;
$$;

-- Function to increment vault download count
CREATE OR REPLACE FUNCTION public.increment_vault_downloads(vault_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vault_stats (vault_id, download_count)
  VALUES (vault_uuid, 1)
  ON CONFLICT (vault_id)
  DO UPDATE SET 
    download_count = vault_stats.download_count + 1,
    updated_at = now();
END;
$$;

-- Function to calculate and update tag depth
CREATE OR REPLACE FUNCTION public.update_tag_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
  ELSE
    SELECT depth + 1 INTO NEW.depth FROM public.tags WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to notify on vault share
CREATE OR REPLACE FUNCTION public.notify_vault_shared()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vault_name TEXT;
  sharer_name TEXT;
  target_user_id UUID;
BEGIN
  -- Get vault name
  SELECT name INTO vault_name FROM public.vaults WHERE id = NEW.vault_id;
  
  -- Get sharer display name
  SELECT COALESCE(display_name, email) INTO sharer_name 
  FROM public.profiles WHERE user_id = NEW.shared_by;
  
  -- Determine target user
  IF NEW.shared_with_user_id IS NOT NULL THEN
    target_user_id := NEW.shared_with_user_id;
  ELSE
    -- Lookup user by email
    SELECT id INTO target_user_id FROM auth.users WHERE email = NEW.shared_with_email;
  END IF;
  
  -- Only create notification if we found a user
  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      target_user_id,
      'vault_shared',
      'New vault shared with you',
      sharer_name || ' shared "' || vault_name || '" with you',
      jsonb_build_object('vault_id', NEW.vault_id, 'from_user_id', NEW.shared_by, 'permission', NEW.permission)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to notify on vault fork
CREATE OR REPLACE FUNCTION public.notify_vault_forked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vault_name TEXT;
  vault_owner_id UUID;
  forker_name TEXT;
BEGIN
  -- Get original vault info
  SELECT name, user_id INTO vault_name, vault_owner_id 
  FROM public.vaults WHERE id = NEW.original_vault_id;
  
  -- Don't notify if user forks their own vault
  IF vault_owner_id = NEW.forked_by THEN
    RETURN NEW;
  END IF;
  
  -- Get forker display name
  SELECT COALESCE(display_name, email) INTO forker_name 
  FROM public.profiles WHERE user_id = NEW.forked_by;
  
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    vault_owner_id,
    'vault_forked',
    'Your vault was forked',
    forker_name || ' forked your vault "' || vault_name || '"',
    jsonb_build_object('vault_id', NEW.original_vault_id, 'forked_vault_id', NEW.forked_vault_id, 'from_user_id', NEW.forked_by)
  );
  
  RETURN NEW;
END;
$$;

-- Function to notify on vault favorite
CREATE OR REPLACE FUNCTION public.notify_vault_favorited()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vault_name TEXT;
  vault_owner_id UUID;
  favoriter_name TEXT;
BEGIN
  -- Get vault info
  SELECT name, user_id INTO vault_name, vault_owner_id 
  FROM public.vaults WHERE id = NEW.vault_id;
  
  -- Don't notify if user favorites their own vault
  IF vault_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;
  
  -- Get favoriter display name
  SELECT COALESCE(display_name, email) INTO favoriter_name 
  FROM public.profiles WHERE user_id = NEW.user_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    vault_owner_id,
    'vault_favorited',
    'Your vault was favorited',
    favoriter_name || ' favorited your vault "' || vault_name || '"',
    jsonb_build_object('vault_id', NEW.vault_id, 'from_user_id', NEW.user_id)
  );
  
  RETURN NEW;
END;
$$;

-- Function to delete a user and all their data
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id_to_delete UUID;
BEGIN
  -- Get the current user's ID
  user_id_to_delete := auth.uid();
  
  IF user_id_to_delete IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete all user data in order (respecting foreign key constraints)
  DELETE FROM public.publication_tags 
  WHERE publication_id IN (
    SELECT id FROM public.publications WHERE user_id = user_id_to_delete
  );
  
  DELETE FROM public.publication_relations 
  WHERE publication_id IN (
    SELECT id FROM public.publications WHERE user_id = user_id_to_delete
  ) OR related_publication_id IN (
    SELECT id FROM public.publications WHERE user_id = user_id_to_delete
  );
  
  DELETE FROM public.publications WHERE user_id = user_id_to_delete;
  
  DELETE FROM public.vault_shares WHERE shared_by = user_id_to_delete;
  DELETE FROM public.vault_favorites WHERE user_id = user_id_to_delete;
  DELETE FROM public.vault_forks WHERE forked_by = user_id_to_delete;
  DELETE FROM public.tags WHERE user_id = user_id_to_delete;
  DELETE FROM public.vaults WHERE user_id = user_id_to_delete;
  DELETE FROM public.profiles WHERE user_id = user_id_to_delete;
  
  -- Delete the auth user (requires auth schema access)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
  
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at 
BEFORE UPDATE ON public.profiles 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vaults_updated_at 
BEFORE UPDATE ON public.vaults 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_publications_updated_at 
BEFORE UPDATE ON public.publications 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to automatically create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for username validation
CREATE TRIGGER validate_username_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_username();

-- Trigger to auto-calculate tag depth on insert/update
CREATE TRIGGER trigger_update_tag_depth
BEFORE INSERT OR UPDATE OF parent_id ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.update_tag_depth();

-- Trigger for vault shares
CREATE TRIGGER on_vault_shared
  AFTER INSERT ON public.vault_shares
  FOR EACH ROW EXECUTE FUNCTION public.notify_vault_shared();

-- Trigger for vault forks
CREATE TRIGGER on_vault_forked
  AFTER INSERT ON public.vault_forks
  FOR EACH ROW EXECUTE FUNCTION public.notify_vault_forked();

-- Trigger for vault favorites
CREATE TRIGGER on_vault_favorited
  AFTER INSERT ON public.vault_favorites
  FOR EACH ROW EXECUTE FUNCTION public.notify_vault_favorited();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION delete_user() IS 'Allows a user to delete their own account and all associated data';

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
