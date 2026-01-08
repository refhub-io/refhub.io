-- Table for vault favorites (following/subscribing to public vaults)
CREATE TABLE public.vault_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vault_id, user_id)
);

-- Table for vault forks (copies that reference the original)
CREATE TABLE public.vault_forks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE SET NULL,
  forked_vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  forked_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(forked_vault_id)
);

-- Enable RLS
ALTER TABLE public.vault_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_forks ENABLE ROW LEVEL SECURITY;

-- RLS policies for vault_favorites
CREATE POLICY "Users can view their own favorites"
ON public.vault_favorites
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites"
ON public.vault_favorites
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their favorites"
ON public.vault_favorites
FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for vault_forks
CREATE POLICY "Anyone can view fork info for public vaults"
ON public.vault_forks
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.vaults v 
  WHERE v.id = vault_forks.original_vault_id AND v.is_public = true
) OR auth.uid() = forked_by);

CREATE POLICY "Users can create forks"
ON public.vault_forks
FOR INSERT
WITH CHECK (auth.uid() = forked_by);

-- Add profiles SELECT policy for public vaults (to show owner info in Codex)
CREATE POLICY "Anyone can view profiles of public vault owners"
ON public.profiles
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.vaults v 
  WHERE v.user_id = profiles.user_id AND v.is_public = true
));

-- Add index for performance
CREATE INDEX idx_vault_favorites_user ON public.vault_favorites(user_id);
CREATE INDEX idx_vault_favorites_vault ON public.vault_favorites(vault_id);
CREATE INDEX idx_vault_forks_original ON public.vault_forks(original_vault_id);