-- Public vault RLS policies and vault_forks policies
-- Fixes: anon users can't read public vaults; vault_forks has no RLS policies

-- ─── vaults ──────────────────────────────────────────────────────────────────
-- Allow anon + authenticated to SELECT vaults with visibility = 'public'
CREATE POLICY "Public vaults are viewable by everyone"
  ON public.vaults
  FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public');

-- ─── vault_publications ───────────────────────────────────────────────────────
-- Allow anon + authenticated to SELECT publications from public vaults
CREATE POLICY "Public vault publications are viewable by everyone"
  ON public.vault_publications
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = vault_publications.vault_id
        AND v.visibility = 'public'
    )
  );

-- ─── tags ─────────────────────────────────────────────────────────────────────
-- Allow anon + authenticated to SELECT tags that belong to public vaults
CREATE POLICY "Public vault tags are viewable by everyone"
  ON public.tags
  FOR SELECT
  TO anon, authenticated
  USING (
    vault_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = tags.vault_id
        AND v.visibility = 'public'
    )
  );

-- ─── vault_forks ─────────────────────────────────────────────────────────────
-- Allow anon + authenticated to SELECT fork records for public vaults
-- (needed for fork-count display on public vault pages)
CREATE POLICY "Fork counts on public vaults are viewable by everyone"
  ON public.vault_forks
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = vault_forks.original_vault_id
        AND v.visibility = 'public'
    )
  );

-- Allow authenticated users to view their own fork records
-- (covers private/non-public original vaults too)
CREATE POLICY "Users can view own fork records"
  ON public.vault_forks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = forked_by);

-- Allow vault owners to view all forks of their vaults
CREATE POLICY "Vault owners can view forks of their vault"
  ON public.vault_forks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = vault_forks.original_vault_id
        AND v.user_id = auth.uid()
    )
  );

-- Allow authenticated users to fork public vaults
CREATE POLICY "Authenticated users can fork public vaults"
  ON public.vault_forks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = forked_by
    AND EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = original_vault_id
        AND v.visibility = 'public'
    )
  );
