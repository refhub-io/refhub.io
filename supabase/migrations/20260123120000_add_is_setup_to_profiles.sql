-- Add is_setup flag to profiles table
ALTER TABLE public.profiles ADD COLUMN is_setup BOOLEAN NOT NULL DEFAULT false;

-- Update updated_at trigger if needed (not shown here)
