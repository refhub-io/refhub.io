ALTER TABLE public.publication_pdf_assets
  ALTER COLUMN vault_publication_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS publication_pdf_assets_publication_storage_provider_key
  ON public.publication_pdf_assets (publication_id, storage_provider)
  WHERE publication_id IS NOT NULL AND vault_publication_id IS NULL;

WITH ranked_vault_assets AS (
  SELECT DISTINCT ON (ppa.publication_id, ppa.storage_provider)
    ppa.user_id,
    ppa.publication_id,
    ppa.storage_provider,
    ppa.source_pdf_url,
    ppa.stored_pdf_url,
    ppa.stored_file_id,
    ppa.status,
    ppa.error_message,
    ppa.created_at,
    ppa.updated_at
  FROM public.publication_pdf_assets AS ppa
  INNER JOIN public.vault_publications AS vp
    ON vp.id = ppa.vault_publication_id
  WHERE ppa.publication_id IS NOT NULL
    AND ppa.vault_publication_id IS NOT NULL
    AND vp.original_publication_id = ppa.publication_id
  ORDER BY
    ppa.publication_id,
    ppa.storage_provider,
    CASE ppa.status
      WHEN 'stored' THEN 0
      WHEN 'pending' THEN 1
      WHEN 'failed' THEN 2
      WHEN 'removed' THEN 3
      ELSE 4
    END,
    CASE WHEN ppa.stored_pdf_url IS NOT NULL THEN 0 ELSE 1 END,
    ppa.updated_at DESC,
    ppa.created_at DESC,
    ppa.id DESC
)
INSERT INTO public.publication_pdf_assets (
  user_id,
  publication_id,
  vault_publication_id,
  storage_provider,
  source_pdf_url,
  stored_pdf_url,
  stored_file_id,
  status,
  error_message,
  created_at,
  updated_at
)
SELECT
  ranked.user_id,
  ranked.publication_id,
  NULL,
  ranked.storage_provider,
  ranked.source_pdf_url,
  ranked.stored_pdf_url,
  ranked.stored_file_id,
  ranked.status,
  ranked.error_message,
  ranked.created_at,
  ranked.updated_at
FROM ranked_vault_assets AS ranked
ON CONFLICT (publication_id, storage_provider)
WHERE vault_publication_id IS NULL
DO UPDATE SET
  user_id = EXCLUDED.user_id,
  source_pdf_url = EXCLUDED.source_pdf_url,
  stored_pdf_url = EXCLUDED.stored_pdf_url,
  stored_file_id = EXCLUDED.stored_file_id,
  status = EXCLUDED.status,
  error_message = EXCLUDED.error_message,
  updated_at = GREATEST(public.publication_pdf_assets.updated_at, EXCLUDED.updated_at);
