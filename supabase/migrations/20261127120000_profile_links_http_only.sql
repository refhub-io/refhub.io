-- Profile links (github_url, linkedin_url, bluesky_url) are shown as clickable links on public
-- profiles, so they may only hold http(s) URLs. The web app checks and normalizes them before
-- saving; these constraints cover every other way of writing a profile.
--
-- Existing values are made to fit first, touching only the rows that change: surrounding
-- whitespace is trimmed, and a value that still isn't an http(s) URL is cleared, because it
-- could never work as a profile link.

UPDATE public.profiles SET github_url = NULLIF(btrim(github_url, E' \t\r\n'), '')
  WHERE github_url <> btrim(github_url, E' \t\r\n');
UPDATE public.profiles SET linkedin_url = NULLIF(btrim(linkedin_url, E' \t\r\n'), '')
  WHERE linkedin_url <> btrim(linkedin_url, E' \t\r\n');
UPDATE public.profiles SET bluesky_url = NULLIF(btrim(bluesky_url, E' \t\r\n'), '')
  WHERE bluesky_url <> btrim(bluesky_url, E' \t\r\n');

UPDATE public.profiles SET github_url = NULL WHERE github_url !~* '^https?://';
UPDATE public.profiles SET linkedin_url = NULL WHERE linkedin_url !~* '^https?://';
UPDATE public.profiles SET bluesky_url = NULL WHERE bluesky_url !~* '^https?://';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_github_url_http CHECK (github_url IS NULL OR github_url ~* '^https?://'),
  ADD CONSTRAINT profiles_linkedin_url_http CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https?://'),
  ADD CONSTRAINT profiles_bluesky_url_http CHECK (bluesky_url IS NULL OR bluesky_url ~* '^https?://');
