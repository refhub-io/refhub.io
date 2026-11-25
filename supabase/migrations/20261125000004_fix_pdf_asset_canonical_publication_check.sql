-- 20261125000004_fix_pdf_asset_canonical_publication_check.sql
--
-- Fixes a real regression in 20261125000003's publication_pdf_assets
-- INSERT/UPDATE policies, caught by GitHub Copilot's PR review (not by
-- this branch's own local-stack RLS testing, since that testing never
-- exercised the shared-vault + canonical-publication_id combination).
--
-- The publication_id branch joined through vault_papers to check whether
-- the caller has edit access to the vault containing a copy of that
-- canonical publication. vault_papers is a legacy table the app no longer
-- writes to -- see ExistingPaperSelector.tsx's own comment: "Vault content
-- lives in vault_publications (one row per vault, copied from the
-- canonical publications row), not a vault_papers join table -- each copy
-- points back to its source via original_publication_id." Confirmed empty
-- for the current data model: no INSERT into vault_papers exists anywhere
-- in src/.
--
-- Concretely, this broke a real, frontend-exercised path:
-- src/lib/pdfAssets.ts's syncDrivePdfAsset() upserts a row with BOTH
-- publication_id (canonical) and vault_publication_id (the specific copy)
-- set at once for the "origin" copy. Because the two outer conditions are
-- ANDed, the vault_publication_id branch passing (correctly, since it
-- already joins through vault_publications) wasn't enough -- the
-- publication_id branch's vault_papers join found nothing, and failed the
-- whole check, for any editor who isn't also the canonical publications
-- row's direct owner (e.g. attaching a PDF to a shared vault's copy of
-- someone else's paper).
--
-- Fix: join through vault_publications.original_publication_id instead,
-- matching the model ExistingPaperSelector.tsx itself documents. This is
-- the same bug (vault_papers vs. vault_publications.original_publication_id)
-- in the same migration's own two occurrences of this branch -- INSERT and
-- UPDATE both get it.
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
        FROM public.vault_publications vp
        JOIN public.vaults v ON vp.vault_id = v.id
        LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
        WHERE vp.original_publication_id = publication_pdf_assets.publication_id
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
        FROM public.vault_publications vp
        JOIN public.vaults v ON vp.vault_id = v.id
        LEFT JOIN public.vault_shares vs ON v.id = vs.vault_id AND vs.shared_with_user_id = auth.uid()
        WHERE vp.original_publication_id = publication_pdf_assets.publication_id
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
