export const normalizeVaultPublicSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    .replace(/-$/g, '');

export const createVaultPublicSlugCandidate = (name: string) => {
  const fromName = normalizeVaultPublicSlug(name);
  if (fromName) return fromName;

  // Vault names may be arbitrary Unicode/emoji strings. Public URLs still need
  // a stable ASCII identifier, so derive one internally instead of rejecting
  // the user-facing name.
  const randomPart = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
    ? Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    : Math.random().toString(36).slice(2, 10);

  return `vault-${randomPart}`;
};
