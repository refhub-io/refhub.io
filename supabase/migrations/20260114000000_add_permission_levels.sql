-- ============================================================================
-- ADD PERMISSION LEVELS FOR VAULT SHARING
-- ============================================================================
-- This migration updates the vault_shares table to support viewer/editor
-- permissions and updates RLS policies to enforce these permissions.
-- ============================================================================

-- 1. Update the permission column to use new values and add constraint
ALTER TABLE public.vault_shares 
  ALTER COLUMN permission SET DEFAULT 'viewer';

-- Update existing 'read' permissions to 'viewer'
UPDATE public.vault_shares 
  SET permission = 'viewer' 
  WHERE permission = 'read';

-- Add check constraint to only allow 'viewer' or 'editor'
ALTER TABLE public.vault_shares 
  ADD CONSTRAINT vault_shares_permission_check 
  CHECK (permission IN ('viewer', 'editor'));

-- 2. Add UPDATE policy for vault_shares so owners can update permissions
CREATE POLICY "Users can update shares for own vaults"
ON public.vault_shares
FOR UPDATE
USING (shared_by = auth.uid())
WITH CHECK (shared_by = auth.uid());

-- 3. Drop and recreate UPDATE policies for publications to check editor permission
DROP POLICY IF EXISTS "Users can update own publications" ON public.publications;

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

-- 4. Drop and recreate INSERT policies for publications to check editor permission
DROP POLICY IF EXISTS "Users can insert own publications" ON public.publications;

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

-- 5. Drop and recreate DELETE policies for publications to check editor permission
DROP POLICY IF EXISTS "Users can delete own publications" ON public.publications;

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

-- 6. Update publication_tags policies to check editor permission
DROP POLICY IF EXISTS "Users can insert own publication tags" ON public.publication_tags;

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

DROP POLICY IF EXISTS "Users can delete own publication tags" ON public.publication_tags;

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
