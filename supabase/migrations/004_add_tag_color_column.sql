-- Migration: Ensure tags table has a color column (already exists in schema.sql)
-- This is a no-op if the column already exists, but ensures consistency.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tags'
      AND column_name = 'color'
  ) THEN
    ALTER TABLE "public"."tags" ADD COLUMN "color" TEXT DEFAULT '#6366f1' NOT NULL;
  END IF;
END
$$;

COMMENT ON COLUMN "public"."tags"."color" IS 'User-chosen hex color for tag display. Defaults to indigo.';
