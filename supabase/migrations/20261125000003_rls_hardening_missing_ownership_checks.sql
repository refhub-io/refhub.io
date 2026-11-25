-- 20261125000003_rls_hardening_missing_ownership_checks.sql
--
-- Three RLS gaps found by security review while fixing #231/#232 (all
-- pre-existing, not introduced by that work):
--
-- 1. vault_forks INSERT policies checked that the caller owns `forked_by`
--    and that `original_vault_id` is a public vault, but never checked that
--    `forked_vault_id` -- the vault being registered as "the fork" -- is
--    actually one the caller owns. A malicious authenticated user could
--    register someone else's vault as their own "fork" record.
--
-- 2. publication_relations_update only checked `created_by = auth.uid()`,
--    none of the vault edit-access check the INSERT policy
--    (publication_relations_insert) requires. src/lib/dupeMerge.ts's
--    duplicate-merge flow legitimately re-points publication_id/
--    related_publication_id via UPDATE -- the new check mirrors the INSERT
--    policy's existing subquery exactly, so that flow (which always
--    re-points into vault_publications the user already has edit access to,
--    since it operates within a vault merge they're already editing)
--    continues to work; it only blocks pointing a relation at a
--    vault_publications row in a vault the user can't edit.
--
-- 3. publication_pdf_assets INSERT/UPDATE only checked `user_id =
--    auth.uid()`, never that the referenced publication_id/
--    vault_publication_id is one the caller can actually edit. Combined
--    with the partial unique index on (publication_id, storage_provider)
--    WHERE vault_publication_id IS NULL, this let any authenticated user
--    squat another user's canonical PDF-asset slot for a publication they
--    don't own, permanently blocking the real owner from ever creating
--    their own. The new checks mirror the existing "editable" policies
--    already applied to publications and vault_publications themselves,
--    minus one thing: those policies also treat a merely-public vault as
--    editable, which is a separate, broader pre-existing issue (reported,
--    not fixed here -- it affects the publications/vault_publications
--    tables directly, not just this one). Attaching a PDF asset is a write,
--    so this migration deliberately drops that branch rather than inherit
--    it: being able to view a public vault's papers is not being able to
--    attach a PDF to them.

ALTER POLICY "Authenticated users can fork public vaults" ON public.vault_forks
  WITH CHECK (
    auth.uid() = forked_by
    AND EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = original_vault_id AND v.visibility = 'public'
    )
    AND EXISTS (
      SELECT 1 FROM public.vaults fv
      WHERE fv.id = forked_vault_id AND fv.user_id = auth.uid()
    )
  );

ALTER POLICY "Users can fork public vaults" ON public.vault_forks
  WITH CHECK (
    auth.uid() = forked_by
    AND EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = original_vault_id AND v.visibility = 'public' AND v.user_id <> auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.vaults fv
      WHERE fv.id = forked_vault_id AND fv.user_id = auth.uid()
    )
  );

ALTER POLICY "publication_relations_update" ON public.publication_relations
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.vault_publications vp
      JOIN public.vaults v ON vp.vault_id = v.id
      LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
      WHERE vp.id = publication_relations.publication_id
        AND v.archived_at IS NULL
        AND (
          v.user_id = auth.uid()
          OR (vs.shared_with_user_id IS NOT NULL AND vs.role = ANY (ARRAY['editor'::public.vault_permission, 'owner'::public.vault_permission]))
        )
    )
  );

ALTER POLICY "Users can insert their own publication pdf assets" ON public.publication_pdf_assets
  WITH CHECK (
    user_id = auth.uid()
    AND (
      publication_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.publications pub
        WHERE pub.id = publication_pdf_assets.publication_id AND pub.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.vault_papers vp
        JOIN public.vaults v ON vp.vault_id = v.id
        LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
        WHERE vp.publication_id = publication_pdf_assets.publication_id
          AND v.archived_at IS NULL
          AND (
            v.user_id = auth.uid()
            OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
          )
      )
    )
    AND (
      vault_publication_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.vault_publications vp
        JOIN public.vaults v ON vp.vault_id = v.id
        LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
        WHERE vp.id = publication_pdf_assets.vault_publication_id
          AND v.archived_at IS NULL
          AND (
            v.user_id = auth.uid()
            OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
          )
      )
    )
  );

ALTER POLICY "Users can update their own publication pdf assets" ON public.publication_pdf_assets
  WITH CHECK (
    user_id = auth.uid()
    AND (
      publication_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.publications pub
        WHERE pub.id = publication_pdf_assets.publication_id AND pub.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.vault_papers vp
        JOIN public.vaults v ON vp.vault_id = v.id
        LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
        WHERE vp.publication_id = publication_pdf_assets.publication_id
          AND v.archived_at IS NULL
          AND (
            v.user_id = auth.uid()
            OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
          )
      )
    )
    AND (
      vault_publication_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.vault_publications vp
        JOIN public.vaults v ON vp.vault_id = v.id
        LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
        WHERE vp.id = publication_pdf_assets.vault_publication_id
          AND v.archived_at IS NULL
          AND (
            v.user_id = auth.uid()
            OR (vs.shared_with_user_id IS NOT NULL AND vs.role IS NOT NULL AND vs.role <> 'viewer'::public.vault_permission)
          )
      )
    )
  );
