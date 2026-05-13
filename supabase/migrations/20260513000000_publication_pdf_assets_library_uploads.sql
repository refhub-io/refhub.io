ALTER TABLE public.publication_pdf_assets
  ALTER COLUMN vault_publication_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS publication_pdf_assets_publication_storage_provider_key
  ON public.publication_pdf_assets (publication_id, storage_provider)
  WHERE publication_id IS NOT NULL AND vault_publication_id IS NULL;
