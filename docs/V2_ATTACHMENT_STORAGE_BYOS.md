# RefHub V2 Attachment Storage Spec

## Summary

RefHub needs reference-manager-style PDF attachment support, but it should not become a blob-storage provider in V2. The V2 attachment model should follow a bring-your-own-storage (BYOS) principle: RefHub stores attachment metadata, linkage, and provider references, while the PDF file itself remains in user-owned external storage.

Google Drive is the first provider target because it is widely used, has stable APIs, and matches the product goal of keeping files under user control rather than moving storage responsibility into RefHub.

---

## Problem statement

RefHub needs PDF attachment behavior that feels normal for a literature/reference manager:

- a publication can have an attached PDF
- users should be able to save that PDF while capturing metadata
- users should be able to reopen the PDF later from the publication record
- ingestion workflows should preserve the link between metadata and file

At the same time, RefHub does not want to become a storage host in V2:

- hosting blobs introduces storage cost, retention, compliance, backup, and abuse concerns
- direct file hosting expands the security/privacy surface significantly
- storage infrastructure is not the highest-value product investment for the current phase
- user-owned storage is a better fit for researchers who already keep paper libraries in existing cloud drives

The product requirement is therefore not "upload PDFs into RefHub," but "make PDFs reliably attachable to publications without RefHub owning the file blobs."

---

## Proposed principle

### BYOS / external user-owned storage

RefHub should treat attachments as externally stored assets referenced by RefHub records.

Core principle:

- RefHub stores metadata about an attachment
- RefHub stores the provider identifier and access reference for the file
- RefHub stores linkage between the attachment and a publication
- RefHub does not store or serve the PDF blob as a first-party asset in V2

This keeps RefHub responsible for organization and workflow while keeping the file itself under user control.

### What RefHub owns vs. does not own

RefHub owns:

- attachment records
- publication-to-attachment relationships
- provider metadata needed to open/reconcile the attachment
- status and sync state
- audit trail around attachment actions

RefHub does not own:

- the canonical PDF blob
- long-term file retention
- storage quotas
- file-serving infrastructure

---

## First provider: Google Drive

Google Drive should be the first supported external attachment provider for V2.

Reasons:

- common user familiarity and existing adoption
- mature OAuth and file APIs
- practical support for user-owned storage
- easy sharing/opening semantics for MVP workflows

Non-goals for the first provider release:

- multiple providers at launch
- enterprise shared-drive edge cases as the primary target
- full offline sync
- background repair of every legacy Drive permission issue

The abstraction should still be provider-shaped from day one so that future support for Dropbox, OneDrive, S3-compatible stores, or self-hosted WebDAV is not blocked by a Google-specific data model.

---

## Architecture

### Core relationship

The V2 attachment model should be:

`publication <-> attachment record <-> external file`

The attachment record is the stable object inside RefHub. The external file is provider-owned. A publication references one or more attachment records.

### Recommended v1 flow

Likely flow for PDF capture:

1. user or extension identifies a publication and a candidate PDF
2. extension sends publication metadata and attachment intent to RefHub backend
3. backend resolves the user/provider connection and upload target
4. backend uploads the PDF to the user-owned Drive location
5. backend creates/updates the attachment record with Drive metadata
6. backend links the attachment record to the publication
7. client receives the publication plus attachment state

This supports both:

- metadata-only saves
- metadata plus PDF upload in one workflow

### Why backend-mediated upload is preferred in v1

For V1 Google Drive integration, backend-mediated upload is preferable to extension-direct Google authentication.

Reasons:

- keeps Google OAuth/provider integration in one place rather than distributing auth logic into browser extensions
- avoids storing or refreshing Google credentials in the extension
- allows a single backend policy layer for ownership checks, folder strategy, dedupe heuristics, and audit logging
- simplifies future support for non-extension clients that need the same attachment flow
- reduces extension complexity across browser environments and permission surfaces
- makes it easier to evolve upload logic without shipping an extension update for every integration change

Extension-direct Google auth could reduce backend data transit, but it makes the client significantly more complex and fragments provider logic across surfaces. That tradeoff is not worth it for V2.

### Backend role

The backend becomes the control plane for attachments:

- provider connection management
- upload orchestration
- attachment record creation/update
- publication linking
- attachment health/status checks
- access/open URL generation or redirect handling

### Drive storage strategy

Initial strategy should be pragmatic:

- each user connects a Google account
- RefHub stores files in a RefHub-managed application folder or configurable root folder inside that user account
- backend records the Drive file ID and enough metadata to reopen/reconcile the file later

Folder strategy should stay configurable enough for future evolution, but V1 should avoid over-design.

---

## Data model implications

### Attachment entity

RefHub should introduce an attachment record separate from publications.

Suggested fields:

- `id`
- `vault_id`
- `created_by`
- `source_type` or `kind` (`pdf` in V1)
- `storage_provider` (`google_drive` in V1)
- `storage_owner_type` (`user`, later maybe `vault_service_account`, `shared`)
- `status`
- `filename`
- `mime_type`
- `size_bytes`
- `checksum_sha256` if available
- `external_file_id`
- `external_parent_id` or folder reference if useful
- `external_url`
- `provider_metadata` JSON blob for provider-specific fields
- `last_verified_at`
- `missing_reason` or `error_code`
- `created_at`
- `updated_at`

### Publication linkage

Publications should link to attachments via either:

- a direct one-to-many relation if the schema remains simple, or
- a join table if attachment reuse/order/roles need to be explicit

Even if most publications have zero or one PDF initially, the model should allow multiple attachments later:

- publisher PDF
- author manuscript
- supplementary material
- annotated copy

### Provider metadata

Provider metadata should be explicitly scoped so the base model stays portable.

For Google Drive, likely metadata includes:

- Drive file ID
- Drive web/view URL
- Drive account subject or provider user ID
- upload source (`extension_capture`, `manual_upload`, etc.)
- optional revision/version marker if later needed

### Status model

Attachment status should be first-class rather than implied.

Suggested states:

- `pending_upload`
- `ready`
- `missing`
- `access_revoked`
- `deleted_external`
- `blocked_source`
- `failed_upload`

This allows UI and automation flows to respond cleanly when the file is not actually retrievable.

### Sync and verification

V2 does not need heavy continuous sync, but it should support lightweight verification:

- verify attachment on upload success
- recheck on explicit open failure
- optional periodic health check later

The important product behavior is not perfect synchronization; it is accurate user-visible state when a previously linked file disappears or becomes inaccessible.

---

## API implications

API design should separate publication creation from attachment operations while still allowing a combined convenience flow.

Useful capability areas:

- create attachment record
- upload attachment via provider connection
- link/unlink attachment to publication
- list publication attachments
- open attachment / fetch launch URL
- refresh attachment status

Potential convenience flow:

- one endpoint for "save publication with optional PDF attachment"

The response should return normalized attachment state so clients can show whether the PDF is:

- uploaded and linked
- metadata-only
- missing or blocked
- awaiting provider connection

Attachment APIs should avoid exposing provider tokens to clients.

---

## UX and product flows

### 1. Save metadata only

User captures a paper but does not upload a PDF.

Expected behavior:

- publication is saved normally
- attachment remains absent
- UI can still show "Add PDF" later

This is important because not every capture path will have a retrievable PDF.

### 2. Save metadata plus upload PDF to Drive

Primary target flow:

- user captures/imports publication
- PDF is available in the browser or extension context
- client sends save request with attachment intent
- backend uploads to Drive
- publication detail shows attached PDF once ready

If Drive is not connected:

- UI should prompt to connect Drive
- metadata save should not be blocked if the product chooses graceful degradation

### 3. Open attachment

From a publication, the user selects the attached PDF.

Expected behavior:

- RefHub opens the provider-backed file via a stable open action
- RefHub may redirect to Drive or return an openable URL
- if the file is no longer available, RefHub updates status and shows a clear failure state

### 4. Missing PDF / blocked PDF fallback

Not every PDF can be captured or retained.

Fallback cases:

- publisher blocked direct PDF fetch
- upload failed after metadata save
- user deleted the Drive file
- Google access was revoked

Expected behavior:

- publication record remains intact
- attachment state explains what failed
- UI offers retry, reconnect, or manual attach depending on reason

The metadata record must never depend on the PDF upload succeeding.

---

## Auth and ownership model

### Primary model: user-owned Drive

The preferred ownership model is:

- each user connects their own Google Drive
- files are uploaded into that user’s Drive
- RefHub stores references to those files

This best matches the BYOS principle and keeps data custody with the user.

### Why not make RefHub the storage owner

Alternatives exist, but they should not be primary in V2:

- RefHub-owned cloud bucket
- RefHub-controlled shared Drive/service account
- per-vault managed storage owned by RefHub

These centralize control and simplify some collaboration cases, but they reintroduce the exact storage-provider responsibility the product is trying to avoid.

### Shared-vault implications

User-owned attachments create a real collaboration constraint:

- if a publication lives in a shared/multi-user vault, the linked PDF may still be owned by one user’s Drive
- other collaborators may lose access unless the file is explicitly shared or duplicated

V2 should document this clearly and treat shared-vault attachment access as a known limitation or follow-on design area rather than pretending it is solved automatically.

---

## Risks and open questions

### Publisher restrictions

- some sources block direct PDF retrieval or automate anti-bot controls
- product should not assume every imported publication can produce an uploadable PDF

### Duplicate handling

- same paper may be uploaded multiple times by the same user
- same PDF may attach to multiple publication records due to metadata duplication
- checksum and provider/file-ID heuristics may help, but exact dedupe policy can be deferred

### Permissions and revocation

- user can revoke Google access at any time
- file-level permissions may change after upload
- RefHub must surface access loss as attachment state, not silent failure

### Folder strategy

- single app folder is simplest
- per-vault or per-year folders may help organization
- too much configurability in V1 will complicate support and migration

### Privacy

- provider metadata stored by RefHub should be minimized
- avoid copying unnecessary Drive account/profile data into the RefHub DB
- audit logs should record actions without leaking more file detail than needed

### Multi-user/shared vaults

- user-owned storage conflicts with team-wide access expectations
- later phases may need shared-drive support, vault-owned provider connections, or explicit share/replicate flows

### File lifecycle mismatch

- publication records are durable
- external files may be moved, deleted, renamed, or permissions-changed outside RefHub
- V2 needs resilient status handling more than strict synchronization

---

## Roadmap placement

This work fits in V2 as a backend-plus-product capability that enables stronger ingestion and reference-manager behavior without expanding into full hosted storage.

Recommended rollout sequence:

### Phase 1: model and provider foundation

- add attachment record model and publication linkage
- add Google provider connection model
- add backend-mediated Drive upload/open flow
- expose attachment status in APIs

### Phase 2: capture and UI integration

- extension/backend capture flow for metadata plus optional PDF
- publication detail attachment UI
- connect-Drive prompt and recoverable error states

### Phase 3: reliability and collaboration follow-ups

- missing/revoked-file detection improvements
- duplicate heuristics
- clearer shared-vault behavior and policy
- evaluate second storage provider only after Google Drive flow is stable

This should be treated as a V2 enabling track adjacent to import/ingestion UX, not as a storage-platform project.

---

## Implementation stance for later work

This document is intentionally a product/technical spec, not an implementation design. It sets the architectural direction for V2:

- BYOS rather than RefHub-hosted blobs
- Google Drive first
- backend-mediated provider handling
- attachment records as first-class metadata objects
- graceful degradation when file capture fails

That scope is sufficient to guide backend, extension, and frontend implementation planning without prematurely locking every API or schema detail.
