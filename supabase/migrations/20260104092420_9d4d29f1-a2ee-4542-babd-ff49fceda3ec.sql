-- Drop and recreate policies that reference auth.users table
-- Use auth.email() function instead of querying auth.users

-- Fix vault_shares policies
DROP POLICY IF EXISTS "Users can view shares for own vaults" ON public.vault_shares;
CREATE POLICY "Users can view shares for own vaults" 
ON public.vault_shares 
FOR SELECT 
USING ((shared_by = auth.uid()) OR (shared_with_email = auth.email()));

-- Fix vaults policies
DROP POLICY IF EXISTS "Users can view own vaults or public vaults" ON public.vaults;
CREATE POLICY "Users can view own vaults or public vaults" 
ON public.vaults 
FOR SELECT 
USING (
  (auth.uid() = user_id) 
  OR (is_public = true) 
  OR (EXISTS (
    SELECT 1 FROM vault_shares
    WHERE vault_shares.vault_id = vaults.id 
    AND vault_shares.shared_with_email = auth.email()
  ))
);

-- Fix publications policies
DROP POLICY IF EXISTS "Users can view publications in accessible vaults" ON public.publications;
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
        AND vault_shares.shared_with_email = auth.email()
      )
    )
  ))
);

-- Fix publication_tags policies
DROP POLICY IF EXISTS "Users can view tags for accessible publications" ON public.publication_tags;
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
            AND vault_shares.shared_with_email = auth.email()
          )
        )
      )
    )
  )
);

-- Fix tags policies
DROP POLICY IF EXISTS "Users can view accessible tags" ON public.tags;
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
        AND vault_shares.shared_with_email = auth.email()
      )
    )
  )
);