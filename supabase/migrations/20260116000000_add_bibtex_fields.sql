-- Add all missing BibTeX fields to publications table
-- This migration adds support for complete BibTeX entry types

ALTER TABLE public.publications
ADD COLUMN IF NOT EXISTS booktitle TEXT,
ADD COLUMN IF NOT EXISTS chapter TEXT,
ADD COLUMN IF NOT EXISTS edition TEXT,
ADD COLUMN IF NOT EXISTS editor TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS howpublished TEXT,
ADD COLUMN IF NOT EXISTS institution TEXT,
ADD COLUMN IF NOT EXISTS number TEXT,
ADD COLUMN IF NOT EXISTS organization TEXT,
ADD COLUMN IF NOT EXISTS publisher TEXT,
ADD COLUMN IF NOT EXISTS school TEXT,
ADD COLUMN IF NOT EXISTS series TEXT,
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS eid TEXT,
ADD COLUMN IF NOT EXISTS isbn TEXT,
ADD COLUMN IF NOT EXISTS issn TEXT,
ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';

-- Add comment to explain the fields
COMMENT ON COLUMN public.publications.booktitle IS 'Title of a book, part of which is being cited';
COMMENT ON COLUMN public.publications.chapter IS 'A chapter (or section) number';
COMMENT ON COLUMN public.publications.edition IS 'The edition of a book';
COMMENT ON COLUMN public.publications.editor IS 'Editor(s) of the book or collection';
COMMENT ON COLUMN public.publications.howpublished IS 'How something strange has been published';
COMMENT ON COLUMN public.publications.institution IS 'The sponsoring institution of a technical report';
COMMENT ON COLUMN public.publications.number IS 'The number of a journal, magazine, technical report, or work in a series';
COMMENT ON COLUMN public.publications.organization IS 'The organization that sponsors a conference or publishes a manual';
COMMENT ON COLUMN public.publications.publisher IS 'The publisher name';
COMMENT ON COLUMN public.publications.school IS 'The name of the academic institution where a thesis was written';
COMMENT ON COLUMN public.publications.series IS 'The name of a series or set of books';
COMMENT ON COLUMN public.publications.type IS 'The type of a technical report or thesis';
COMMENT ON COLUMN public.publications.eid IS 'Electronic identifier for electronic journals';
COMMENT ON COLUMN public.publications.isbn IS 'International Standard Book Number';
COMMENT ON COLUMN public.publications.issn IS 'International Standard Serial Number';
COMMENT ON COLUMN public.publications.keywords IS 'Keywords for searching or annotation';
