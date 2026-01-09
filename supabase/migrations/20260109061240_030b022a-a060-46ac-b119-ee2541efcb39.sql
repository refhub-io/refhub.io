-- Fix the INSERT policy to be more restrictive (only allow from triggers via SECURITY DEFINER functions)
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;

-- Since notifications are created by SECURITY DEFINER triggers, we don't need an INSERT policy for regular users
-- The triggers run with elevated privileges and bypass RLS