-- Restrict vault-scoped tags to owners and explicitly shared users.
-- Public vault contents remain public, but vault-local curation metadata such as
-- tags should not be globally enumerable merely because a vault is public.

DROP POLICY IF EXISTS "Public vault tags are viewable by everyone" ON public.tags;
DROP POLICY IF EXISTS "Tags from public vaults are viewable by everyone" ON public.tags;
DROP POLICY IF EXISTS "Users can view own tags and tags in accessible vaults" ON public.tags;

CREATE POLICY "Users can view own tags and tags in accessible vaults"
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.vaults v
        LEFT JOIN public.vault_shares vs
          ON v.id = vs.vault_id
          AND vs.shared_with_user_id = auth.uid()
        WHERE v.id = tags.vault_id
          AND (
            v.user_id = auth.uid()
            OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL)
          )
      )
    )
  );
