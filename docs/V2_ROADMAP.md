# RefHub Frontend V2 Roadmap

This document describes the frontend/product work needed to make the RefHub UI keep pace with a stronger backend and make agent-facing workflows usable rather than merely possible.

## Goals

The frontend should make these things easy:

- creating and managing narrow API keys
- understanding what a key can and cannot do
- setting vault restrictions safely
- monitoring automation activity
- working with tags, relations, search, and import flows without friction

The UI should make the backend permission model visible instead of hiding it.

---

## Design principles

1. **Reflect the real backend contract** — do not invent UI toggles for endpoints that do not exist.
2. **Make permissions legible** — scopes and vault restrictions must be understandable at a glance.
3. **Optimize for safe automation** — preview, audit, confirm, revoke.
4. **Separate user auth from API-key auth clearly** — human login stays normal app auth; API keys are for automation/runtime.
5. **Support complex workflows without turning settings into a cockpit.**

---

## Track 1 — API key management UX v2

The current panel is a good start, but v2 should become a serious automation control surface.

### Needed UI capabilities
- create key with clear scope picker
- choose vault restrictions at creation time
- set expiry date
- label/describe intended use
- copy key once with strong warning and clear success state
- rotate/revoke cleanly
- show last-used timestamp and status
- show restricted vault count / names

### Recommended UX additions
- preset templates:
  - read-only research sync
  - ingestion bot
  - export/sync bot
  - admin/maintenance key
- warning badges for broad keys
- “this key can access all current and future vaults” warning when unrestricted
- sort/filter keys by active/revoked/expired/unused

### Why it matters
If API-key management is clumsy, nobody will actually use the safer narrow-key path.

---

## Track 2 — Permission model visibility

As backend scopes grow, the UI must explain them clearly.

### Needed UI capabilities
- show scope descriptions inline
- explain required vault role for each scope class
- distinguish:
  - account-level capabilities (`vaults:create`)
  - existing-vault content capabilities (`vaults:write`)
  - structural capabilities (`tags:write`, `relations:write`)
  - admin capabilities (`vaults:admin`)
- surface vault restrictions and effective access together

### Recommended UX shape
- grouped scope picker by category
- effective-permission preview card
- “this key can do X in these Y vaults” summary before creation

### Why it matters
Otherwise users will create overpowered keys by accident.

---

## Track 3 — Vault creation and admin UI

Once backend vault lifecycle exists, frontend should expose it cleanly.

### Needed UI capabilities
- create vault
- edit vault metadata
- archive/delete vault
- duplicate vault
- manage collaborators and roles
- show owner/admin/editor/viewer state

### Recommended UX
- lightweight create-vault flow
- settings page for metadata and admin actions
- collaborators panel with clear role editing
- caution around destructive actions

---

## Track 4 — Tag management UI

Tags should become a first-class workspace tool, not a side effect.

### Needed UI capabilities
- create/edit/delete tags
- tag color/name editing
- hierarchy/reparenting if supported
- attach/detach tags on single items
- bulk retagging
- filter views by tag

### Why it matters
Tagging is one of the main ways both humans and agents organize literature and notes.

---

## Track 5 — Relation management UI

Relations need proper UI if they are going to matter.

### Needed UI capabilities
- create relation between items
- choose relation type
- inspect graph neighborhood of an item
- remove/edit relations
- filter by relation type

### Recommended UX options
- sidebar relation editor
- lightweight graph/list hybrid view
- relation chips on item detail pages

### Why it matters
Without usable relation editing, the backend graph model stays academically interesting but practically underused.

---

## Track 6 — Search, filtering, and saved views

This is probably the highest leverage product improvement for daily use.

### Needed UI capabilities
- fast search across titles/authors/abstracts/DOIs
- structured filters by year/tag/type/vault
- sort options
- saved queries/views
- recent changes view
- lightweight stats summaries

### Why it matters
This is what lets humans and agents work on the same dataset efficiently.

---

## Track 7 — Import and ingestion UX

The frontend should support both manual and agent-assisted ingestion.

### Needed UI capabilities
- DOI import
- BibTeX import
- URL import
- paste candidate metadata
- dry-run import preview
- duplicate detection and merge suggestions
- error reporting per imported item

### Recommended UX
- import modal with review step
- duplicate resolution UI
- “suggested tags” / “suggested metadata fixes” hooks later

---

## Track 8 — Audit and automation observability

This is where RefHub becomes operationally trustworthy.

### Needed UI capabilities
- activity timeline
- per-key usage history
- audit feed for item/vault changes
- actor attribution (user vs automation key)
- last sync/import summaries
- failure surfaces for automation jobs

### Why it matters
Users need to see what automation did without spelunking logs.

---

## Track 9 — Agent-facing UX patterns

The frontend should explicitly support automation-heavy use cases.

### Good additions
- “Create key for this workflow” shortcuts
- read-only / ingest / export key presets
- docs/examples panel for curl / SDK usage
- vault-specific automation setup cards
- revoke-all / rotate-all maintenance tools for owners

### Stretch ideas
- generated setup snippets for MCP/CLI/agent configs
- ephemeral task keys
- copyable “least privilege” recommendations

---

## Track 10 — Frontend architecture work needed

To support the above, frontend architecture should keep improving.

### Technical/product needs
- stable API client wrappers around backend routes
- stricter response normalization
- clearer loading/error states
- consistent toasts and one-time secret reveal handling
- route guards around admin/owner-only surfaces
- better test coverage for API-key and settings flows

### Environment/config discipline
The frontend should continue to keep these separate:

- `VITE_SUPABASE_URL` → Supabase auth/data origin for normal app auth
- `VITE_API_KEY_MANAGEMENT_BASE_URL` → backend API-key management origin when separate

That split must remain explicit so auth does not accidentally route to the backend host.

---

## Suggested sequencing

### Phase A — immediate product leverage
1. improve API key management UX
2. add permission previews and warnings
3. add vault creation/admin screens when backend supports them
4. improve search/filter/saved views

### Phase B — structure workflows
5. add tag management UI
6. add relation management UI
7. add import preview / duplicate resolution UX

### Phase C — operations and agent friendliness
8. add audit/activity views
9. add automation presets and setup helpers
10. add richer vault admin / sharing surfaces

---

## Definition of done for V2

Frontend V2 is successful when a user can:

- create a narrowly scoped key confidently
- understand exactly what that key can do
- restrict it to specific vaults
- create and manage vaults cleanly
- organize data with tags and relations
- search/filter effectively
- import data safely with review steps
- inspect what automation changed afterward

At that point, RefHub becomes pleasant not only for normal product use but also as an operational hub for agents and integrations.
