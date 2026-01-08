-- Fix search_path for the validate_username function
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