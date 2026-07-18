# refhub guide

refhub is a vault-based workspace for collecting papers, curating context, and sharing research collections.

jump to the [faq](#faq) for setup, sharing, markdown, api keys, github links, and agent workflow notes.

## vaults

a **vault** is a research collection. use vaults for a project, reading list, class, survey, lab theme, or public bibliography. a paper can appear in multiple vaults without losing the vault-specific notes, tags, and sharing context around it.

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
- **viewers** can read. **editors** can help curate where permissions allow it.
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

open the vault, then open vault settings from the gear button or press `o` while the vault is active. choose a visibility:

- **private** keeps the vault visible only to you.
- **protected** lets people request access and requires approval before they can view the contents.
- **public** publishes the vault through its public slug so it can appear in the codex.

for protected or public vaults, use the sharing section in vault settings to invite collaborators, approve access requests, and assign viewer or editor roles. viewers can read; editors can help curate where the vault permissions allow it.

### how do tags work?

tags are managed where the papers live.

- in `all_papers`, tags are personal tags attached to your library items.
- inside a vault, tags are vault-local curation. they can differ from the same paper's tags in another vault.
- tags can be hierarchical: create a parent tag, then create child tags under it.
- use `manage_tags` in the paper list/vault toolbar to rename or delete tags. deleting a tag removes that label from papers; it does not delete the papers.

when editing a paper, use the tag selector to assign or remove tags. in shared vaults, tag editing follows the same edit permissions as the rest of the vault.

### what markdown is supported in notes and help content?

refhub renders markdown through `react-markdown` with github-flavored markdown and extended plugins enabled: `remark-gfm`, `remark-breaks`, `remark-footnotes`, `rehype-slug`, `rehype-autolink-headings`, `rehype-highlight`, sanitized raw html, and heading anchors.

common and extended syntax works:

- headings, paragraphs, links, images, lists, blockquotes, and horizontal rules.
- task lists such as `- [ ] screen papers` and `- [x] export bibtex`.
- tables, for example `| tag | meaning |` followed by a normal markdown table body.
- footnotes such as `paper note[^1]` with `[^1]: longer context` later in the note.
- inline code and fenced code blocks with syntax highlighting, for example <code>```json</code>.
- soft line breaks are preserved.

raw html is sanitized before rendering, so prefer markdown syntax for portable notes instead of relying on embedded html.

### where do i get an api key?

open profile/settings from the sidebar user menu, then go to **api keys**. create a key with:

- a clear label and optional description.
- scopes such as `vaults:read`, `vaults:write`, `vaults:export`, or `vaults:admin`.
- an optional expiration.
- optional vault restrictions if the key should only reach selected vaults.

copy the secret when it is created. refhub only shows the key prefix later, so a lost secret should be revoked and replaced.

### how do i connect google drive?

open profile/settings, then **storage**. connect google drive and complete the google oauth flow. refhub requests the `drive.file` scope, keeps google credentials on the backend, and writes pdfs into a managed refhub folder.

after connecting, make sure the refhub drive folder is ready in the storage panel. once linked, publication and vault paper dialogs can store uploaded pdfs or drive pdf links against the paper.

### how do i set up the browser extension?

use the browser extension card in refhub to install the extension for your browser. chrome and edge use the [Chrome Web Store listing](https://chromewebstore.google.com/detail/refhub/ggoophlbadcgkmcpnbnfjacknccpkmgc?authuser=0&hl=en); firefox uses the [Firefox Add-ons listing](https://addons.mozilla.org/en-US/firefox/addon/refhub/). you can also open the [refhub extensions repository](https://github.com/refhub-io/refhub-extensions) from the same card. the extension is designed to send papers from the page you are already reading into refhub.

if the extension asks for refhub access, use an api key from profile/settings. prefer the narrowest scopes and vault restrictions that fit the workflow.

### where can i find the refhub repositories?

open the **resources** tab in this help center (the `?` menu) for the full, current list of refhub repositories with descriptions and links. it covers the frontend, backend, cli, mcp/agent integrations, and browser extensions.

### how do i integrate agent or script workflows?

use api keys for external tools, local scripts, or agents. recommended setup:

1. create a dedicated key per workflow, for example `literature_watch_bot` or `vault_export_script`.
2. choose only the scopes needed: read for retrieval, write for adding/updating papers/tags/relations, export for export workflows, admin only for vault management.
3. restrict the key to selected vaults when possible.
4. store the secret in the tool's local secret store or environment, not in a shared prompt, note, or repository.
5. revoke and rotate the key from profile/settings when a workflow is retired or a secret may have leaked.

for agentic workflows, the refhub cli is the cleanest execution layer when available. install it with `npm i @refhub/cli`. it reads `REFHUB_API_KEY` from the environment, also supports a one-off `--api-key` flag, returns json by default, and exposes help through `refhub --help` and command-group help such as `refhub vaults --help`. use it before direct http calls so agents get consistent authentication, output, and error handling.

for full setup and worked examples — importing literature with notes and tags, vault administration, literature discovery, and grounded paper drafting — open the **ai_workflows** tab in this help center.

keep paper-level metadata separate from vault curation: bibliographic fixes belong on the publication; tags, notes, and collection-specific context belong in the vault.
