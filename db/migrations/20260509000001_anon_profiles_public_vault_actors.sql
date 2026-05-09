-- Allow anonymous visitors to read profiles of contributors to public vaults.
-- Scope is intentionally narrow: only profiles of users who have created_by or
-- updated_by records on publications in public vaults, and vault owners of public vaults.
-- This enables PublicVaultSimple to show contributor names to unauthenticated viewers.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Public: profiles of public vault actors are viewable by anon'
  ) THEN
    CREATE POLICY "Public: profiles of public vault actors are viewable by anon"
      ON public.profiles
      FOR SELECT
      TO anon
      USING (
        user_id IN (
          SELECT DISTINCT vp.updated_by
          FROM public.vault_publications vp
          JOIN public.vaults v ON v.id = vp.vault_id
          WHERE v.visibility = 'public' AND vp.updated_by IS NOT NULL
          UNION
          SELECT DISTINCT vp.created_by
          FROM public.vault_publications vp
          JOIN public.vaults v ON v.id = vp.vault_id
          WHERE v.visibility = 'public' AND vp.created_by IS NOT NULL
          UNION
          SELECT v.user_id
          FROM public.vaults v
          WHERE v.visibility = 'public'
        )
      );
  END IF;
END
$$;
