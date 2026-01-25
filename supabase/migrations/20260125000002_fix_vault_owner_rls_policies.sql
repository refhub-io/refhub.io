-- ============================================================================
-- FIX RLS POLICIES TO INCLUDE VAULT OWNERS
-- ============================================================================
-- This migration updates RLS policies to include vault owners in addition to
-- users with editor permissions. Previously, owners couldn't see updates
-- made by editors in shared vaults.
-- ============================================================================

-- 1. Drop and recreate UPDATE policies for publications to include vault owners
DROP POLICY IF EXISTS "Users can update own publications or shared vaults with editor permission" ON public.publications;

CREATE POLICY "Users can update own publications or shared vaults with editor permission" 
ON public.publications 
FOR UPDATE 
USING (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    WHERE vaults.id = publications.vault_id 
    AND vaults.user_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission = 'editor'
  ))
);

-- 2. Drop and recreate INSERT policies for publications to include vault owners
DROP POLICY IF EXISTS "Users can insert own publications or into shared vaults with editor permission" ON public.publications;

CREATE POLICY "Users can insert own publications or into shared vaults with editor permission" 
ON public.publications 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    WHERE vaults.id = publications.vault_id 
    AND vaults.user_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission = 'editor'
  ))
);

-- 3. Drop and recreate DELETE policies for publications to include vault owners
DROP POLICY IF EXISTS "Users can delete own publications or from shared vaults with editor permission" ON public.publications;

CREATE POLICY "Users can delete own publications or from shared vaults with editor permission" 
ON public.publications 
FOR DELETE 
USING (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    WHERE vaults.id = publications.vault_id 
    AND vaults.user_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission = 'editor'
  ))
);

-- 4. Update publication_tags policies to include vault owners
DROP POLICY IF EXISTS "Users can insert publication tags for own publications or shared vaults with editor permission" ON public.publication_tags;

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
        WHERE vaults.id = publications.vault_id 
        AND vaults.user_id = auth.uid()
      )
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

DROP POLICY IF EXISTS "Users can delete publication tags from own publications or shared vaults with editor permission" ON public.publication_tags;

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
        WHERE vaults.id = publications.vault_id 
        AND vaults.user_id = auth.uid()
      )
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

-- 5. Also update the SELECT policies to ensure owners can see all publications in their vaults
DROP POLICY IF EXISTS "Users can view own publications or shared vaults" ON public.publications;

CREATE POLICY "Users can view own publications or shared vaults" 
ON public.publications 
FOR SELECT 
USING (
  (auth.uid() = user_id) 
  OR (EXISTS (
    SELECT 1 FROM vaults
    WHERE vaults.id = publications.vault_id 
    AND vaults.user_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM vaults
    JOIN vault_shares ON vault_shares.vault_id = vaults.id
    WHERE vaults.id = publications.vault_id 
    AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
    AND vault_shares.permission IN ('viewer', 'editor')
  ))
  OR (EXISTS (
    SELECT 1 FROM vaults
    WHERE vaults.id = publications.vault_id 
    AND vaults.is_public = true
  ))
);

-- 6. Update publication_tags SELECT policies as well
DROP POLICY IF EXISTS "Users can view publication tags for accessible publications" ON public.publication_tags;

CREATE POLICY "Users can view publication tags for accessible publications" 
ON public.publication_tags 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.publications 
    WHERE id = publication_id 
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM vaults
        WHERE vaults.id = publications.vault_id 
        AND vaults.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM vaults
        JOIN vault_shares ON vault_shares.vault_id = vaults.id
        WHERE vaults.id = publications.vault_id 
        AND (vault_shares.shared_with_email = auth.email() OR vault_shares.shared_with_user_id = auth.uid())
        AND vault_shares.permission IN ('viewer', 'editor')
      )
      OR EXISTS (
        SELECT 1 FROM vaults
        WHERE vaults.id = publications.vault_id 
        AND vaults.is_public = true
      )
    )
  )
);