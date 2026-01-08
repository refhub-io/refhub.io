-- Add profile fields for username, bio, and social links
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS github_url TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS bluesky_url TEXT;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Create a function to validate username format (alphanumeric and underscores only, 3-30 chars)
CREATE OR REPLACE FUNCTION public.validate_username()
RETURNS TRIGGER AS $$
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

-- Create trigger for username validation
DROP TRIGGER IF EXISTS validate_username_trigger ON public.profiles;
CREATE TRIGGER validate_username_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_username();