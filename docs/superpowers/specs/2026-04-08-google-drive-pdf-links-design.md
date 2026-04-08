# google drive pdf links — design spec
_2026-04-08_

## Overview

Surface Google Drive PDF links in the refhub.io frontend. The extension already uploads PDFs to Drive and records the `webViewLink` in `publication_pdf_assets`. This feature makes those links visible and editable in the UI — for vault owners only.

---

## 1. Data Layer — `VaultContentContext`

### New state
- `pdfAssetsMap: Record<string, string | null>` — keyed by `vault_publication_id` (= `publication.id` in vault context), value is `stored_pdf_url` from `publication_pdf_assets`
- `pdfAssetsLoading: boolean` — true while the parallel fetch is in flight

### New method
- `updatePdfAsset(vaultPublicationId: string, url: string | null): Promise<void>`

### Fetch logic
After the existing `vault_publications` query resolves, fire a **separate async query** (does not block publication rendering):

```
publication_pdf_assets
  .select('vault_publication_id, stored_pdf_url')
  .in('vault_publication_id', publicationIds)
  .eq('storage_provider', 'google_drive')
  .eq('status', 'stored')
```

Build `pdfAssetsMap` from the result. RLS ensures non-owners receive zero rows — no frontend owner check needed.

### Write logic (`updatePdfAsset`)
Upsert to `publication_pdf_assets` with `onConflict: 'vault_publication_id,storage_provider'`:
- If `url` is non-empty: set `stored_pdf_url = url`, `status = 'stored'`, `stored_file_id = null` (manually entered, not extension-uploaded)
- If `url` is null/empty: set `status = 'removed'` (row is preserved, won't appear in future fetches)

Optimistically update `pdfAssetsMap` before the upsert resolves.

### Context shape additions
```ts
pdfAssetsMap: Record<string, string | null>;
pdfAssetsLoading: boolean;
updatePdfAsset: (vaultPublicationId: string, url: string | null) => Promise<void>;
```

---

## 2. Component Changes

### `PublicationCard`
New optional props:
```ts
driveUrl?: string | null;
driveLoading?: boolean;
```

In the PDF/links area (top-right of card, next to the existing pdf link):
- Rename link label `pdf` → `publisher_pdf` (monospace, lowercase)
- When `driveLoading`: render `<Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />`
- When `driveUrl`: render a `<a href={driveUrl} target="_blank" rel="noopener noreferrer">` with a Google Drive SVG icon (inline small SVG or `HardDrive` Lucide fallback), `title="open_in_drive"`, styled like the existing pdf link

### `PublicationTable`
Same two optional props as `PublicationCard`. Same rendering logic in the pdf column cell.

### `PublicationViewDialog`
New optional props:
```ts
driveUrl?: string | null;
driveLoading?: boolean;
```

In the header links area alongside the existing external link / pdf button:
- `publisher_pdf` label for the `pdf_url` link
- Drive icon badge alongside it (same spinner/icon pattern)

### `PublicationDialog` (edit + create)
New optional props:
```ts
driveUrl?: string | null;
```

`onSave` signature extended:
```ts
onSave: (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave?: boolean, driveUrl?: string | null) => Promise<void>;
```

Form field changes:
- Rename label for `pdf_url` input: `publisher_pdf`
- Add new input field below it: label `drive_pdf`, pre-filled from `driveUrl` prop, free-text editable
- On save: always pass the current `drive_pdf` value as the 5th argument to `onSave`
- Parent's `onSave` handler does the two-step for new publications: create publication → upsert Drive URL using the returned `vault_publication_id`
- For edits: parent calls `updatePdfAsset(publication.id, driveUrl)` if value changed

### `AddImportDialog` (manual tab)
New optional prop:
```ts
updatePdfAsset?: (vaultPublicationId: string, url: string | null) => Promise<void>;
```

Manual tab changes:
- Add `drive_pdf` input field alongside `publisher_pdf` in the manual entry form (local state: `manualDrivePdf`)
- After `onManualCreate` resolves and returns the new `vault_publication_id`, if `manualDrivePdf` is non-empty, call `updatePdfAsset(newId, manualDrivePdf)`

DOI/BibTeX import: **out of scope** — no per-publication Drive URL step at import time. Users add it via the edit dialog after importing.

---

## 3. Wiring — `VaultDetail`

Pull from context:
```ts
const { pdfAssetsMap, pdfAssetsLoading, updatePdfAsset } = useVaultContent();
```

Pass to each publication component:
- `driveUrl={pdfAssetsMap[publication.id] ?? null}`
- `driveLoading={pdfAssetsLoading}`
- `updatePdfAsset` passed to `AddImportDialog` and used in `PublicationDialog`'s `onSave` handler

---

## 4. Backend / Schema

**No changes required.**

- `publication_pdf_assets` table already exists (migration `011_gdrive_tables.sql`)
- RLS policies already in place (migration `012_gdrive_rls_policies.sql`) — owner-only read/write
- `stored_pdf_url` already stores the `webViewLink` from Drive uploads
- All reads/writes go through the Supabase client directly (same pattern as tags, shares)

---

## 5. Style & Copy Conventions

Per `refhub-identity.md`:
- Labels in form fields: lowercase, snake_case in monospace contexts → `publisher_pdf`, `drive_pdf`
- Link labels in cards/tables: `publisher_pdf` (monospace, lowercase)
- Drive badge: icon only, `title="open_in_drive"` tooltip
- Loading state: `Loader2` spinner, muted color, same size as adjacent icon (`w-3 h-3`)
- No schema rename to `Publication` type — Drive URL lives in `pdfAssetsMap`, not on the publication object

---

## 6. Constraints & Non-Goals

- Drive links are **read-only for non-owners** (RLS enforces this at DB level; UI simply shows nothing)
- Public vault views (`PublicVaultSimple`) do **not** get Drive links — `publication_pdf_assets` RLS blocks anonymous/non-owner reads
- No realtime subscription for `publication_pdf_assets` — a page refresh or explicit save is sufficient
- `TheCodex` and `UserProfile` publication views are out of scope (owner-only feature, those are public views)
