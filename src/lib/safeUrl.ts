/**
 * Returns `value` as an absolute http(s) URL, or null for anything else.
 *
 * Use it for every link built from data that a user or another service supplies: profile links,
 * paper URLs, PDF and Drive links. React passes an href through unchanged, and a link to a
 * `javascript:` URL runs script on this origin when it's clicked. The value is parsed the way
 * browsers parse it, so mixed case, leading spaces or a tab inside the scheme don't get through.
 */
export function getValidHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
