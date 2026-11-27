-- One list of relation types, shared with the API (refhub-io/.netlify src/routes/relations.js)
-- and refhub-cli. The column default is already 'related'.
--
-- NOT VALID enforces the list for every new or changed row straight away without checking
-- existing rows, so this migration can't fail on legacy data. The DO block then validates the
-- existing rows; if any hold another value, the constraint stays NOT VALID and a NOTICE lists
-- those values so they can be fixed and the constraint validated by hand:
--   ALTER TABLE public.publication_relations VALIDATE CONSTRAINT publication_relations_relation_type_check;

ALTER TABLE public.publication_relations
  ADD CONSTRAINT publication_relations_relation_type_check
  CHECK (relation_type IN ('cites', 'extends', 'builds_on', 'contradicts', 'reviews', 'related')) NOT VALID;

DO $$
DECLARE
  unknown_types text;
BEGIN
  SELECT string_agg(DISTINCT relation_type, ', ') INTO unknown_types
  FROM public.publication_relations
  WHERE relation_type NOT IN ('cites', 'extends', 'builds_on', 'contradicts', 'reviews', 'related');

  IF unknown_types IS NULL THEN
    EXECUTE 'ALTER TABLE public.publication_relations VALIDATE CONSTRAINT publication_relations_relation_type_check';
  ELSE
    RAISE NOTICE 'publication_relations has relation types outside the list (%); the CHECK stays NOT VALID until they are fixed', unknown_types;
  END IF;
END $$;
