# refhub guide

refhub is a vault-based workspace for collecting papers, curating context, and sharing research collections.

## vaults

A **vault** is a research collection. use vaults for a project, reading list, class, survey, lab theme, or public bibliography. a paper can appear in multiple vaults without losing the vault-specific notes, tags, and sharing context around it.

## adding and importing papers

use `add_paper` from `all_papers` or a vault to bring papers into refhub.

- **doi lookup** fetches publication details when a doi is available.
- **bibtex import** accepts pasted `.bib` text or uploaded bibtex files for bulk import.
- **url / manual entry** lets you add papers when structured metadata is incomplete.
- **existing papers** can be added into another vault without creating a duplicate library item.
- **pdfs** can be attached to papers. when google drive is connected, refhub can store saved pdfs in your managed drive folder.

## organizing papers

each paper has bibliographic metadata such as title, authors, year, venue, doi, url, abstract, and publication type. vaults add curation on top:

- **tags** organize papers inside a vault and can be hierarchical.
- **notes / comments** capture why a paper matters in this collection.
- **relationships** connect papers as references, citations, or related work.

paper-level metadata should describe the publication itself. vault-specific metadata should describe how that paper is used in the current vault.

## semantic scholar tools

refhub uses semantic scholar where available to reduce manual metadata work and support discovery.

- **enrich / sync** checks a paper by doi and lets you review incoming metadata before applying it.
- **related papers, references, and citations** help expand a vault from a selected paper.
- **topic or empty-vault discovery** can seed a collection when you do not yet have papers.
- **queue and rate limits** are normal: discovery requests may be queued or slowed so refhub stays within upstream api limits.

## managing a vault

open vault settings from the vault gear or the `o` shortcut when a vault is active. settings cover:

- name, description, category, abstract, and color.
- visibility: private, protected, or public.
- public slug for shareable public vault urls.
- access requests and collaborator management when sharing is enabled.

## sharing and access

vaults can stay private, be shared with collaborators, or become public entries in the codex.

- **protected vaults** require approved access.
- **public vaults** can be viewed through their public slug.
- **collaborators** can be invited or approved as viewers or editors.
- **viewers** can read. **editors** can help curate where permissions allow.
- public viewers can request collaborator access when the vault allows it.

## export

use export from a vault, public vault, or selected papers to take data out of refhub. export supports bibliographic workflows such as bibtex and selected-field exports where available.

## the codex

the codex is refhub's public discovery surface. public vaults appear there so other researchers can browse, reuse, and request collaboration on curated collections.

## profile and settings

open profile/settings from the sidebar user menu.

- profile identity controls your display name, username, avatar, bio, and links.
- google drive connects storage for managed pdf assets.
- api keys let external tools access allowed refhub data.
- theme and account controls live alongside profile settings where applicable.

## api and external workflows

api keys are created from profile settings. give each key a clear label, choose scopes such as read/write/export, and optionally restrict access to selected vaults. copy the secret when it is created; only the prefix remains visible later.

refhub also supports browser-extension and integration workflows where enabled, so papers found elsewhere can be sent into your library or vaults without manual re-entry.
