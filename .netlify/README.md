# RefHub API v1

## Scope

This `.netlify` package is the initial Netlify Functions backend scaffold for API-key access to RefHub vaults.

It is intentionally narrow for v1:

- `GET /api/v1/vaults`
- `GET /api/v1/vaults/:vaultId`
- `POST /api/v1/vaults/:vaultId/items`
- `PATCH /api/v1/vaults/:vaultId/items/:itemId`
- `GET /api/v1/vaults/:vaultId/export`

No delete endpoints are included. No vault-creation endpoint is included.

## Versioned routing

`netlify.toml` routes all `/api/v1/*` traffic to a single function entrypoint:

- `/.netlify/functions/api-v1`

The handler dispatches by path segment so the backend can stay small while the contract stays versioned.

## Folder layout

```text
.netlify/
  functions/
    api-v1.js            # versioned router and handlers
  src/
    auth.js              # API-key parsing, hashing, verification, scope checks
    config.js            # required env vars and runtime knobs
    export.js            # JSON and BibTeX export helpers
    http.js              # shared HTTP/error/JSON helpers
  netlify.toml           # redirects and function settings
  package.json           # backend package metadata
  PROGRESS.md            # status snapshot for this scaffold
```

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REFHUB_API_KEY_PEPPER`
- `REFHUB_API_MAX_BULK_ITEMS` optional, defaults to `50`
- `REFHUB_API_AUDIT_DISABLED` optional, defaults to `false`

`REFHUB_API_KEY_PEPPER` is used when hashing presented API keys before comparing them to the stored hash.

## API-key model

Keys are expected in one of these headers:

- `Authorization: Bearer rhk_<publicId>_<secret>`
- `X-API-Key: rhk_<publicId>_<secret>`

Storage rules:

- only `key_hash` is stored
- `key_prefix` stores `rhk_<publicId>` for lookup
- `scopes` is a text array
- optional vault restrictions live in `api_key_vaults`
- `last_used_at` is updated best-effort
- request outcomes are written best-effort to `api_request_audit_logs`

## Existing RefHub data model reused

The backend reads and writes the existing tables instead of creating a parallel API store:

- `vaults`
- `vault_shares`
- `vault_publications`
- `publications`
- `tags`
- `publication_tags`
- `publication_relations`

For writes, v1 follows the current shared-vault pattern:

1. insert a canonical row in `publications`
2. insert the vault-specific copy in `vault_publications`
3. attach `publication_tags` against the `vault_publication_id`

## Endpoint contract

### `GET /api/v1/vaults`

Required scope: `vaults:read`

Returns vaults the API-key owner can access through ownership or explicit share, optionally narrowed by `api_key_vaults`.

Response shape:

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "AI Reading List",
      "visibility": "private",
      "permission": "owner",
      "item_count": 12,
      "updated_at": "2026-03-23T18:00:00Z"
    }
  ],
  "meta": {
    "request_id": "uuid"
  }
}
```

### `GET /api/v1/vaults/:vaultId`

Required scope: `vaults:read`

Returns one vault plus contents. v1 includes:

- vault metadata
- `vault_publications`
- vault-scoped `tags`
- `publication_tags` for those vault publications
- `publication_relations` that reference returned vault publications

### `POST /api/v1/vaults/:vaultId/items`

Required scope: `vaults:write`

Required vault permission: `editor`

Request body:

```json
{
  "items": [
    {
      "title": "Attention Is All You Need",
      "authors": ["Ashish Vaswani"],
      "year": 2017,
      "publication_type": "article",
      "doi": "10.48550/arXiv.1706.03762",
      "tag_ids": ["uuid"]
    }
  ]
}
```

Notes:

- bulk insert is supported to reduce chattiness
- `tag_ids` must already exist in the target vault
- v1 does not create tags implicitly

### `PATCH /api/v1/vaults/:vaultId/items/:itemId`

Required scope: `vaults:write`

Required vault permission: `editor`

Request body is partial. If `tag_ids` is present it replaces the item's existing tag set.

### `GET /api/v1/vaults/:vaultId/export?format=json|bibtex`

Required scope: `vaults:export`

Required vault permission: `viewer`

Supported formats in this scaffold:

- `json`
- `bibtex`

## Audit logging

Each request attempts to write one audit row with:

- API key id
- owner user id
- vault id when known
- method and path
- response status
- request id
- latency
- caller IP and user agent

Audit logging is best-effort and must not block successful API responses.
