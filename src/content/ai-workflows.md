# ai agent workflows

refhub is built to be operated by ai agents as well as humans. this guide unfolds from zero — creating an api key and setting up the environment — through worked use cases: importing literature with notes and tags, administrating vaults, running literature discovery, and drafting a paper section grounded in your vault.

## the stack

the pieces fit together like this:

- **refhub api** — the canonical surface. everything below adapts it; nothing invents behavior the api does not support.
- **api key** — created in profile/settings, scoped and optionally vault-restricted. this is how agents authenticate.
- **[refhub cli](https://github.com/refhub-io/refhub-cli)** (`@refhub/cli`) — the execution layer. agents run `refhub ...` commands instead of raw http calls: consistent auth, json output, and error handling.
- **[refhub-skill](https://github.com/refhub-io/refhub-skill)** — an agent skill that teaches claude code, codex, gemini cli, opencode, cursor, and other harnesses the refhub workflows and exact route contracts.
- **[refhub-paper-drafter](https://github.com/refhub-io/refhub-paper-drafter)** — a skill on top of both for drafting hci/visualization research papers from a vault and local notes.

the **resources** tab in this help center links every refhub repository.

## setup

### 1. create an api key

open profile/settings from the sidebar user menu, then **api keys**. create a key with:

- a clear label per workflow, for example `claude_literature_agent`.
- only the scopes needed: `vaults:read` for retrieval, `vaults:write` for adding/updating papers, tags, and relations, `vaults:export` for export workflows, `vaults:admin` only for vault management.
- an optional expiration and optional vault restrictions.

copy the secret when it is created — refhub only shows the key prefix later. a lost secret should be revoked and replaced.

### 2. install the cli

requires node ≥ 18.

```bash
npm install -g @refhub/cli
refhub --help
```

output is json by default (pipe-friendly, e.g. into `jq`); add `--table` for human-readable tables. every command and subcommand answers `--help`.

### 3. give the key to the environment — not the chat

store the key in a local env file and let tools read `REFHUB_API_KEY` from the environment. never paste live keys into prompts, notes, or repositories.

```bash
mkdir -p ~/.config/refhub
cat > ~/.config/refhub/env <<'EOF'
export REFHUB_API_KEY='rhk_REPLACE_ME'
EOF
chmod 600 ~/.config/refhub/env
```

optional: wrap your agent launcher so the key loads automatically:

```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/claude-refhub <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source "$HOME/.config/refhub/env"
exec claude "$@"
EOF
chmod +x ~/.local/bin/claude-refhub
```

start the agent with `claude-refhub` (the same pattern works for `codex` or any other cli agent) and the key never appears in chat history.

### 4. install the refhub skill

[refhub-skill](https://github.com/refhub-io/refhub-skill) teaches the agent the workflows and route contracts.

**claude code**

```bash
claude plugin marketplace add https://github.com/refhub-io/refhub-skill
claude plugin install refhub-skill@refhub-skill
```

available in the next session; invoked automatically when you ask claude to work with refhub vaults or papers. the explicit https url matters: github shorthand clones over ssh, which fails on machines without a github ssh key.

**codex** — add to `~/.agents/plugins/marketplace.json` (or the project-level `.agents/plugins/marketplace.json`):

```json
{
  "name": "refhub-skill",
  "source": { "source": "github", "repo": "refhub-io/refhub-skill" },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

**gemini cli / opencode** — download `SKILL.md` into the harness's skills directory:

```bash
mkdir -p ~/.gemini/skills/refhub-skill   # opencode: ~/.config/opencode/skills/refhub-skill
curl -o ~/.gemini/skills/refhub-skill/SKILL.md \
  https://raw.githubusercontent.com/refhub-io/refhub-skill/main/skills/refhub-skill/SKILL.md
```

**cursor, windsurf, and other generic harnesses** — copy the repo's `AGENTS.md` into your project root or your agent's rules/settings ui:

```bash
curl -O https://raw.githubusercontent.com/refhub-io/refhub-skill/main/AGENTS.md
```

### 5. verify

```bash
refhub vaults list
```

exit codes: `0` success · `1` api error · `2` bad arguments · `3` auth error. a `3` means the key is missing or invalid — check the env file and that your launcher sources it.

## use case: add literature, notes, and tags

ask the agent:

> add these three dois to my visual-analytics vault, tag them evaluation > user-study, and note why each one matters for the related work section.

with the skill installed, the agent resolves the vault and runs commands like:

```bash
refhub vaults list                                  # find the vault id
refhub import doi --vault <id> --doi 10.1109/TVCG.2023.3327195
refhub tags create --vault <id> --name evaluation
refhub tags create --vault <id> --name user-study --parent <evaluationTagId>
refhub tags attach --vault <id> --item <itemId> --tags <tagId>
refhub items update --vault <id> <itemId> --notes "anchors the deep-dive comparison in related work"
```

bulk import works from bibtex or urls too: `refhub import bibtex --vault <id> --file refs.bib`.

afterwards, fill metadata gaps from semantic scholar:

```bash
refhub enrich --vault <id> --dry-run   # preview what would change
refhub enrich --vault <id>             # patch missing titles/authors/years/abstracts
```

**gotcha:** `items update --tags` fully replaces the item's tag list. use `tags attach` / `tags detach` to add or remove tags without clobbering the rest.

## use case: create and administrate vaults

> create a protected vault for the eurovis submission, invite my co-author as editor, and export the current bibliography.

```bash
refhub vaults create --name "eurovis-2027" --description "submission reading list" --visibility protected
refhub vaults shares add <vaultId> --email coauthor@university.edu --role editor
refhub export --vault <vaultId> --format bibtex > eurovis-2027.bib
refhub audit --vault <vaultId> --since 2026-07-01T00:00:00Z   # who changed what, when
```

when the collection is ready for the codex:

```bash
refhub vaults visibility <vaultId> --visibility public --slug eurovis-2027
```

destructive commands are guarded: `vaults delete` and `items delete` require `--confirm` and are hard deletes with no undo.

## use case: literature search and discovery

semantic scholar discovery runs through refhub with just `vaults:read`:

> find recent papers on progressive visual analytics, show me the ten most relevant, and add the ones i pick to my vault.

```bash
refhub discover search --query "progressive visual analytics" --limit 10
refhub discover recommendations --paper DOI:10.1109/TVCG.2019.2934283 --limit 10
refhub discover references --paper <paperId>     # what a paper cites
refhub discover cited-by --paper <paperId>       # who cites it
```

results are json; save the picks and upsert them into the vault:

```bash
refhub discover search --query "progressive visual analytics" | jq .data > picks.json
refhub discover add --vault <id> --file picks.json
```

open-access pdf links are mapped automatically where present. discovery requests may be queued or slowed — refhub stays within semantic scholar's rate limits, so this is normal. finish with `refhub enrich --vault <id>` to round out metadata.

## use case: write my section / paper

[refhub-paper-drafter](https://github.com/refhub-io/refhub-paper-drafter) drafts hci and visualization manuscripts from a refhub vault plus local notes. every claim traces to a source; nothing is invented.

**prerequisites:** the cli and refhub-skill installed and authenticated (setup above). minimum scopes: `vaults:read`, plus `vaults:export` if using `refhub export`.

**install (claude code):**

```bash
claude plugin marketplace add https://github.com/refhub-io/refhub-paper-drafter
claude plugin install refhub-paper-drafter@refhub-paper-drafter
```

then invoke it:

> /refhub-paper-drafter — draft the related work section for my eurovis paper from the eurovis-2027 vault and the notes in ./notes/.

the skill works in phases:

1. **collect** — reads local note files + queries the vault by tag hierarchy → builds a source map.
2. **scaffold** — interactive back-and-forth to lock framing, contributions, and argument structure before writing.
3. **draft** — prose from the source map only; ungrounded sentences are flagged `[NEEDS SOURCE: <claim>]`, never silently filled.
4. **quality** — strips ai giveaways, hollow intensifiers, filler transitions, and vague claims.
5. **review** — adversarial "reviewer 2" loop with severity-rated critiques (minor / major / fatal) and revision.
6. **output** — markdown or functional latex → session, local file, or overleaf via git bridge.

citations use each item's `bibtex_key`, and the exported `.bib` uses the same keys referenced by `\cite{}`. a manuscript is only marked submission-ready when the readiness gates pass: zero unresolved `[NEEDS SOURCE]` markers, no unresolved fatal reviewer findings, ethics/consent status, ai-use disclosure, reproducibility statement, and a figure/table inventory with alt text.

## good practices

- one dedicated key per workflow, minimal scopes, vault restrictions where possible. revoke and rotate from profile/settings when a workflow is retired or a secret may have leaked.
- keep bibliographic fixes on the publication; tags, notes, and collection-specific context belong in the vault.
- pdf upload (`refhub pdf upload --vault <id> --item <id> --file paper.pdf`) requires google drive connected in profile/settings → storage first; files up to 26 mb.
- pipe json output for scripting: `refhub items search --vault <id> --q "attention" | jq '.data[].title'`.
- see the **resources** tab for every refhub repository, and the **guide** tab's faq for api key and google drive setup details.
