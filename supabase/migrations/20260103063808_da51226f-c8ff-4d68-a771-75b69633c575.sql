-- Add is_public column to vaults for public publishing
ALTER TABLE public.vaults ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Add public_slug for SEO-friendly public URLs
ALTER TABLE public.vaults ADD COLUMN IF NOT EXISTS public_slug text UNIQUE;

-- Update vaults RLS to allow viewing public vaults
DROP POLICY IF EXISTS "Users can view own vaults" ON public.vaults;
CREATE POLICY "Users can view own vaults or public vaults" 
ON public.vaults 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR is_public = true 
  OR EXISTS (
    SELECT 1 FROM vault_shares 
    WHERE vault_shares.vault_id = vaults.id 
    AND vault_shares.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

-- Update publications RLS to allow viewing publications in shared/public vaults
DROP POLICY IF EXISTS "Users can view own publications" ON public.publications;
CREATE POLICY "Users can view publications in accessible vaults" 
ON public.publications 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM vaults 
    WHERE vaults.id = publications.vault_id 
    AND (
      vaults.is_public = true 
      OR EXISTS (
        SELECT 1 FROM vault_shares 
        WHERE vault_shares.vault_id = vaults.id 
        AND vault_shares.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  )
);

-- Update publication_tags RLS to allow viewing tags for accessible publications
DROP POLICY IF EXISTS "Users can view own publication tags" ON public.publication_tags;
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
            AND vault_shares.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
          )
        )
      )
    )
  )
);

-- Allow viewing tags that belong to publications the user can access
DROP POLICY IF EXISTS "Users can view own tags" ON public.tags;
CREATE POLICY "Users can view accessible tags" 
ON public.tags 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM publication_tags 
    JOIN publications ON publications.id = publication_tags.publication_id
    JOIN vaults ON vaults.id = publications.vault_id
    WHERE publication_tags.tag_id = tags.id
    AND (vaults.is_public = true OR EXISTS (
      SELECT 1 FROM vault_shares 
      WHERE vault_shares.vault_id = vaults.id 
      AND vault_shares.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    ))
  )
);

-- Create index for faster public vault lookups
CREATE INDEX IF NOT EXISTS idx_vaults_is_public ON public.vaults(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_vaults_public_slug ON public.vaults(public_slug) WHERE public_slug IS NOT NULL;