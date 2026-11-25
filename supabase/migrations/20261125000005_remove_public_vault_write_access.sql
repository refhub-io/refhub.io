-- 20261125000005_remove_public_vault_write_access.sql
--
-- Fixes issue #242: the "editable" RLS policies on publications and
-- vault_publications granted write access (UPDATE/DELETE via USING,
-- INSERT/UPDATE via WITH CHECK) to any authenticated user whenever the
-- row's vault was merely visibility = 'public' -- not just to the vault's
-- owner or an editor/owner vault_shares collaborator. A vault's
-- visibility = 'public' flag controls read access to its public page; it
-- was never meant to be a collaboration grant. As written, any logged-in
-- user could UPDATE or DELETE any publication or vault_publications row
-- in ANYONE's public vault, via a direct PostgREST request with their own
-- JWT (the frontend never renders an edit affordance for a vault you
-- don't own, but that's a UI omission, not an RLS boundary) -- and a
-- public vault's own page already exposes its rows' ids to render them,
-- so there's no meaningful obscurity protecting this either.
--
-- Confirmed via the separate .netlify backend's own resolveVaultAccess()
-- helper (src/auth.js there) that the intended model has always been
-- "public visibility resolves to viewer permission, never editor" --
-- this migration brings these two RLS policies in line with that, and
-- with 20261125000003's publication_pdf_assets policy, which deliberately
-- never inherited this branch in the first place.
--
-- Checked every current src/ call path that writes to publications or
-- vault_publications before removing this: vaultFork.ts's insert targets
-- the newly-forked vault (owned by the forker, covered by the owner
-- branch); PublicVaultSimple.tsx (the public vault page itself) only
-- reads from both tables -- view-count tracking goes through a dedicated
-- increment_vault_views() RPC, not a direct write. Nothing relies on the
-- public-vault branch for a legitimate write.
ALTER POLICY "Users can manage own publications and publications in editable " ON public.publications
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.vault_papers vp
      JOIN public.vaults v ON vp.vault_id = v.id
      LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
      WHERE vp.publication_id = publications.id
        AND v.archived_at IS NULL
        AND (
          v.user_id = auth.uid()
          OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
        )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.vault_papers vp
      JOIN public.vaults v ON vp.vault_id = v.id
      LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
      WHERE vp.publication_id = publications.id
        AND v.archived_at IS NULL
        AND (
          v.user_id = auth.uid()
          OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
        )
    )
  );

ALTER POLICY "Users can manage vault publications in editable vaults" ON public.vault_publications
  USING (
    EXISTS (
      SELECT 1
      FROM public.vaults v
      LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
      WHERE v.id = vault_publications.vault_id
        AND v.archived_at IS NULL
        AND (
          v.user_id = auth.uid()
          OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vaults v
      LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
      WHERE v.id = vault_publications.vault_id
        AND v.archived_at IS NULL
        AND (
          v.user_id = auth.uid()
          OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
        )
    )
  );
