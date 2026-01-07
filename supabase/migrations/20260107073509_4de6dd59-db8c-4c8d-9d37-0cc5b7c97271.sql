-- Create publication_relations table for bidirectional labeled relationships
CREATE TABLE public.publication_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  related_publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'related',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  
  -- Prevent duplicate relationships (order matters for the unique constraint)
  CONSTRAINT unique_relation UNIQUE (publication_id, related_publication_id),
  -- Prevent self-references
  CONSTRAINT no_self_reference CHECK (publication_id != related_publication_id)
);

-- Enable RLS
ALTER TABLE public.publication_relations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view relations for publications they can access
CREATE POLICY "Users can view relations for accessible publications"
ON public.publication_relations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM publications p
    WHERE p.id = publication_relations.publication_id
    AND (
      p.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM vaults v
        WHERE v.id = p.vault_id
        AND (
          v.is_public = true
          OR EXISTS (
            SELECT 1 FROM vault_shares vs
            WHERE vs.vault_id = v.id
            AND vs.shared_with_email = auth.email()
          )
        )
      )
    )
  )
);

-- Policy: Users can create relations for their own publications
CREATE POLICY "Users can create relations for own publications"
ON public.publication_relations
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM publications WHERE id = publication_id AND user_id = auth.uid()
  )
);

-- Policy: Users can delete relations they created
CREATE POLICY "Users can delete own relations"
ON public.publication_relations
FOR DELETE
USING (created_by = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_publication_relations_publication ON public.publication_relations(publication_id);
CREATE INDEX idx_publication_relations_related ON public.publication_relations(related_publication_id);