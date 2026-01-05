-- Add categories/topics to vaults
ALTER TABLE public.vaults ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;
ALTER TABLE public.vaults ADD COLUMN IF NOT EXISTS abstract text DEFAULT NULL;

-- Create vault stats table for tracking views
CREATE TABLE public.vault_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  view_count integer DEFAULT 0,
  download_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(vault_id)
);

-- Enable RLS
ALTER TABLE public.vault_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can view stats for public vaults
CREATE POLICY "Anyone can view stats for public vaults"
ON public.vault_stats
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.vaults
    WHERE vaults.id = vault_stats.vault_id
    AND vaults.is_public = true
  )
);

-- Owners can manage their vault stats
CREATE POLICY "Owners can manage vault stats"
ON public.vault_stats
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.vaults
    WHERE vaults.id = vault_stats.vault_id
    AND vaults.user_id = auth.uid()
  )
);

-- Function to increment view count
CREATE OR REPLACE FUNCTION public.increment_vault_views(vault_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vault_stats (vault_id, view_count)
  VALUES (vault_uuid, 1)
  ON CONFLICT (vault_id)
  DO UPDATE SET 
    view_count = vault_stats.view_count + 1,
    updated_at = now();
END;
$$;

-- Function to increment download count
CREATE OR REPLACE FUNCTION public.increment_vault_downloads(vault_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vault_stats (vault_id, download_count)
  VALUES (vault_uuid, 1)
  ON CONFLICT (vault_id)
  DO UPDATE SET 
    download_count = vault_stats.download_count + 1,
    updated_at = now();
END;
$$;