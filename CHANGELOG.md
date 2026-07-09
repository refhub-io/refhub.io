# Changelog

All notable changes to `refhub.io` are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/). History prior to
1.4.2 was not tracked in this file.

## [1.4.2] - 2026-07-09

### Changed
- The vault "discovery" related-papers tab now fetches recommendations for
  the whole set of resolved seed papers in one batched request (chunked at
  20 seeds per call) instead of one request per paper, via the backend's
  batched `/recommendations` endpoint.

### Fixed
- Semantic Scholar sync and discovery were hitting rate limits almost
  constantly. The root cause was on the backend (see `.netlify`'s
  changelog): its per-user rate limiter let every user race the one shared
  Semantic Scholar API key independently. No frontend change was needed for
  that fix, but this release depends on the corresponding `.netlify` v2.2.0
  deploy.
