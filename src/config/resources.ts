/**
 * Static list of public RefHub GitHub repositories, shown in the Help
 * Center's Resources tab. Update when a repo is added, archived, or renamed.
 */

export interface RefHubResource {
  name: string;
  description: string;
  url: string;
}

export const resources: RefHubResource[] = [
  {
    name: 'refhub.io',
    description: 'the frontend product and help center — this app.',
    url: 'https://github.com/refhub-io/refhub.io',
  },
  {
    name: '.netlify',
    description: 'serverless backend / api layer.',
    url: 'https://github.com/refhub-io/.netlify',
  },
  {
    name: 'refhub-skill',
    description: 'mcp skill for agents to read, write, and manage refhub vaults.',
    url: 'https://github.com/refhub-io/refhub-skill',
  },
  {
    name: 'refhub-mcp',
    description: 'mcp server implementation backing the refhub agent integrations.',
    url: 'https://github.com/refhub-io/refhub-mcp',
  },
  {
    name: 'refhub-extensions',
    description: 'browser extensions (chrome, edge, firefox) for sending pages into refhub.',
    url: 'https://github.com/refhub-io/refhub-extensions',
  },
  {
    name: 'refhub-cli',
    description: 'command-line client for scripting and agent workflows (npm i @refhub/cli).',
    url: 'https://github.com/refhub-io/refhub-cli',
  },
  {
    name: 'refhub-qr',
    description: 'qr code generation for sharing vaults and publications.',
    url: 'https://github.com/refhub-io/refhub-qr',
  },
  {
    name: 'refhub-ascii',
    description: 'ascii/terminal art for refhub branding (e.g. fastfetch).',
    url: 'https://github.com/refhub-io/refhub-ascii',
  },
  {
    name: 'refhub-paper-drafter',
    description: 'agent skill for drafting hci/visualization research papers from a vault and local notes.',
    url: 'https://github.com/refhub-io/refhub-paper-drafter',
  },
];
