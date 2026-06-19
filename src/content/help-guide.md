# RefHub guide

RefHub is a vault-based workspace for collecting papers, curating context, and sharing research collections.

## Vaults

A **vault** is a research collection. Use vaults for a project, reading list, class, survey, lab theme, or public bibliography. A paper can appear in multiple vaults without losing the vault-specific notes, tags, and sharing context around it.

## Adding and importing papers

Use `add_paper` from all_papers or a vault to bring papers into RefHub.

- **DOI lookup** fetches publication details when a DOI is available.
- **BibTeX import** accepts pasted `.bib` text or uploaded BibTeX files for bulk import.
- **URL / manual entry** lets you add papers when structured metadata is incomplete.
- **Existing papers** can be added into another vault without creating a duplicate library item.
- **PDFs** can be attached to papers. When Google Drive is connected, RefHub can store saved PDFs in your managed Drive folder.

## Organizing papers

Each paper has bibliographic metadata such as title, authors, year, venue, DOI, URL, abstract, and publication type. Vaults add curation on top:

- **Tags** organize papers inside a vault and can be hierarchical.
- **Notes / comments** capture why a paper matters in this collection.
- **Relationships** connect papers as references, citations, or related work.

Paper-level metadata should describe the publication itself. Vault-specific metadata should describe how that paper is used in the current vault.

## Semantic Scholar tools

RefHub uses Semantic Scholar where available to reduce manual metadata work and support discovery.

- **Enrich / sync** checks a paper by DOI and lets you review incoming metadata before applying it.
- **Related papers, references, and citations** help expand a vault from a selected paper.
- **Topic or empty-vault discovery** can seed a collection when you do not yet have papers.
- **Queue and rate limits** are normal: discovery requests may be queued or slowed so RefHub stays within upstream API limits.

## Managing a vault

Open vault settings from the vault gear or the `o` shortcut when a vault is active. Settings cover:

- Name, description, category, abstract, and color.
- Visibility: private, protected, or public.
- Public slug for shareable public vault URLs.
- Access requests and collaborator management when sharing is enabled.

## Sharing and access

Vaults can stay private, be shared with collaborators, or become public entries in the Codex.

- **Protected vaults** require approved access.
- **Public vaults** can be viewed through their public slug.
- **Collaborators** can be invited or approved as viewers or editors.
- **Viewers** can read. **Editors** can help curate where permissions allow.
- Public viewers can request collaborator access when the vault allows it.

## Export

Use export from a vault, public vault, or selected papers to take data out of RefHub. Export supports bibliographic workflows such as BibTeX and selected-field exports where available.

## The Codex

The Codex is RefHub's public discovery surface. Public vaults appear there so other researchers can browse, reuse, and request collaboration on curated collections.

## Profile and settings

Open profile/settings from the sidebar user menu.

- Profile identity controls your display name, username, avatar, bio, and links.
- Google Drive connects storage for managed PDF assets.
- API keys let external tools access allowed RefHub data.
- Theme and account controls live alongside profile settings where applicable.

## API and external workflows

API keys are created from profile settings. Give each key a clear label, choose scopes such as read/write/export, and optionally restrict access to selected vaults. Copy the secret when it is created; only the prefix remains visible later.

RefHub also supports browser-extension and integration workflows where enabled, so papers found elsewhere can be sent into your library or vaults without manual re-entry.
