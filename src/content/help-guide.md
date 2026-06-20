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

## faq

### how do i share a vault?

Open the vault, then open vault settings from the gear button or press `o` while the vault is active. Choose a visibility:

- **private** keeps the vault visible only to you.
- **protected** lets people request access and requires approval before they can view the contents.
- **public** publishes the vault through its public slug so it can appear in the codex.

For protected or public vaults, use the sharing section in vault settings to invite collaborators, approve access requests, and assign viewer or editor roles. Viewers can read; editors can help curate where the vault permissions allow it.

### how do tags work?

Tags are managed where the papers live.

- In `all_papers`, tags are personal tags attached to your library items.
- Inside a vault, tags are vault-local curation. They can differ from the same paper's tags in another vault.
- Tags can be hierarchical: create a parent tag, then create child tags under it.
- Use `manage_tags` in the paper list/vault toolbar to rename or delete tags. Deleting a tag removes that label from papers; it does not delete the papers.

When editing a paper, use the tag selector to assign or remove tags. In shared vaults, tag editing follows the same edit permissions as the rest of the vault.

### what markdown is supported in notes and help content?

RefHub renders Markdown with GitHub-flavored Markdown support. Common syntax works:

- headings, paragraphs, links, images, lists, task lists, blockquotes, and horizontal rules.
- inline code and fenced code blocks with syntax highlighting.
- tables and footnotes.
- line breaks are preserved.

Raw HTML is sanitized before rendering, so use Markdown syntax for portable notes instead of relying on embedded HTML.

### where do i get an api key?

Open profile/settings from the sidebar user menu, then go to **API keys**. Create a key with:

- a clear label and optional description.
- scopes such as `vaults:read`, `vaults:write`, `vaults:export`, or `vaults:admin`.
- an optional expiration.
- optional vault restrictions if the key should only reach selected vaults.

Copy the secret when it is created. RefHub only shows the key prefix later, so a lost secret should be revoked and replaced.

### how do i connect google drive?

Open profile/settings, then **Storage**. Connect Google Drive and complete the Google OAuth flow. RefHub requests the `drive.file` scope, keeps Google credentials on the backend, and writes PDFs into a managed RefHub folder.

After connecting, make sure the RefHub Drive folder is ready in the storage panel. Once linked, publication and vault paper dialogs can store uploaded PDFs or Drive PDF links against the paper.

### how do i set up the browser extension?

Use the browser extension card in RefHub to install the extension for Chrome/Edge or Firefox, or open the extension repository from the same card. The extension is designed to send papers from the page you are already reading into RefHub.

If the extension asks for RefHub access, use an API key from profile/settings. Prefer the narrowest scopes and vault restrictions that fit the workflow.

### how do i integrate agent or script workflows?

Use API keys for external tools, local scripts, or agents. Recommended setup:

1. Create a dedicated key per workflow, for example `literature_watch_bot` or `vault_export_script`.
2. Choose only the scopes needed: read for retrieval, write for adding/updating papers/tags/relations, export for export workflows, admin only for vault management.
3. Restrict the key to selected vaults when possible.
4. Store the secret in the tool's local secret store or environment, not in a shared prompt, note, or repository.
5. Revoke and rotate the key from profile/settings when a workflow is retired or a secret may have leaked.

For agent workflows, keep paper-level metadata separate from vault curation: bibliographic fixes belong on the publication; tags, notes, and collection-specific context belong in the vault.
