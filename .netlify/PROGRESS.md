# Progress

## Implemented in this scaffold

- implementation-ready API v1 spec and routing plan
- Netlify config for `/api/v1/*`
- shared API-key verification helpers using hashed key lookup plus scopes
- vault restriction checks via `api_key_vaults`
- best-effort audit logging hook
- initial handlers for list vaults, read vault, add items, update items, and export vault
- Supabase migration for `api_keys`, `api_key_vaults`, and `api_request_audit_logs`

## Still pending

- key issuance UI or admin workflow for generating `rhk_<publicId>_<secret>` values
- transactional write path if add/update needs to become an RPC instead of sequential REST writes
- stricter schema validation and rate limiting
- automated tests once the backend repo/package is wired into CI
- deployment hookup in the actual standalone backend repo if it exists outside this checkout

## Local repo note

The task referenced a separate `refhub-io/.netlify` repo, but only the `refhub` repo was available locally. This scaffold was created under `refhub/.netlify` as the closest workable fallback.
