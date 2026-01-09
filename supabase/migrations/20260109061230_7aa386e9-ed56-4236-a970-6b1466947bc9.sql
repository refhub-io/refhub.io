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

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Allow insert from authenticated users (for triggers/functions)
CREATE POLICY "Authenticated users can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Add shared_with_user_id to vault_shares for username-based sharing
ALTER TABLE public.vault_shares 
ADD COLUMN shared_with_user_id UUID REFERENCES auth.users(id),
ALTER COLUMN shared_with_email DROP NOT NULL;

-- Create index for faster lookups
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX idx_vault_shares_user_id ON public.vault_shares(shared_with_user_id);

-- Update RLS policy for vault_shares to include user_id lookup
DROP POLICY IF EXISTS "Users can view shares for own vaults" ON public.vault_shares;
CREATE POLICY "Users can view shares for own vaults"
ON public.vault_shares
FOR SELECT
USING (
  shared_by = auth.uid() 
  OR shared_with_email = auth.email()
  OR shared_with_user_id = auth.uid()
);

-- Create function to notify on vault share
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

-- Create trigger for vault shares
CREATE TRIGGER on_vault_shared
  AFTER INSERT ON public.vault_shares
  FOR EACH ROW EXECUTE FUNCTION public.notify_vault_shared();

-- Create function to notify on vault fork
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

-- Create trigger for vault forks
CREATE TRIGGER on_vault_forked
  AFTER INSERT ON public.vault_forks
  FOR EACH ROW EXECUTE FUNCTION public.notify_vault_forked();

-- Create function to notify on vault favorite
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

-- Create trigger for vault favorites
CREATE TRIGGER on_vault_favorited
  AFTER INSERT ON public.vault_favorites
  FOR EACH ROW EXECUTE FUNCTION public.notify_vault_favorited();