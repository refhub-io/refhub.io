-- Add parent_id to tags for hierarchical categorization
ALTER TABLE public.tags ADD COLUMN parent_id UUID REFERENCES public.tags(id) ON DELETE SET NULL;

-- Add index for efficient parent lookups
CREATE INDEX idx_tags_parent_id ON public.tags(parent_id);

-- Add depth column to help with hierarchy traversal (0 = root level)
ALTER TABLE public.tags ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;

-- Function to calculate and update tag depth
CREATE OR REPLACE FUNCTION public.update_tag_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
  ELSE
    SELECT depth + 1 INTO NEW.depth FROM public.tags WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-calculate depth on insert/update
CREATE TRIGGER trigger_update_tag_depth
BEFORE INSERT OR UPDATE OF parent_id ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.update_tag_depth();