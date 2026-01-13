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

-- Add comment
COMMENT ON FUNCTION delete_user() IS 'Allows a user to delete their own account and all associated data';
