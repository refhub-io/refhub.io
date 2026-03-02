import { Publication, Tag } from '@/types/database';
import { getTagParentChain } from '@/lib/tagHierarchy';

/**
 * Format a publication as an APA 7th edition citation string.
 *
 * Pattern:
 *   Author, A. B., & Author, C. D. (Year). Title of article. Journal Name, Volume(Issue), Pages. https://doi.org/xxxxx
 *
 * Falls back gracefully when fields are missing.
 */
export function formatAPA(pub: Publication): string {
  const parts: string[] = [];

  // --- Authors ---
  if (pub.authors && pub.authors.length > 0) {
    const formatted = pub.authors.map(formatAPAAuthor);
    if (formatted.length === 1) {
      parts.push(formatted[0]);
    } else if (formatted.length === 2) {
      parts.push(`${formatted[0]}, & ${formatted[1]}`);
    } else if (formatted.length <= 20) {
      // APA 7th: list all up to 20 authors
      const allButLast = formatted.slice(0, -1).join(', ');
      parts.push(`${allButLast}, & ${formatted[formatted.length - 1]}`);
    } else {
      // 21+: first 19, ellipsis, last
      const first19 = formatted.slice(0, 19).join(', ');
      parts.push(`${first19}, ... ${formatted[formatted.length - 1]}`);
    }
  }

  // --- Year ---
  if (pub.year) {
    parts.push(`(${pub.year})`);
  } else {
    parts.push('(n.d.)');
  }

  // --- Title ---
  const title = pub.title?.trim();
  if (title) {
    // APA: article titles in sentence case (we keep as-is since we don't know original casing)
    parts.push(`${title}.`);
  }

  // --- Journal / Source ---
  const journalParts: string[] = [];
  if (pub.journal) {
    journalParts.push(`*${pub.journal}*`);
  } else if (pub.booktitle) {
    journalParts.push(`*${pub.booktitle}*`);
  }

  if (pub.volume) {
    if (pub.issue) {
      journalParts.push(`*${pub.volume}*(${pub.issue})`);
    } else {
      journalParts.push(`*${pub.volume}*`);
    }
  }

  if (pub.pages) {
    // Normalize page dash to en-dash
    journalParts.push(pub.pages.replace(/-+/g, '–'));
  } else if (pub.eid) {
    journalParts.push(`Article ${pub.eid}`);
  }

  if (journalParts.length > 0) {
    parts.push(journalParts.join(', ') + '.');
  }

  // --- Publisher (for books) ---
  if (pub.publisher && !pub.journal) {
    parts.push(`${pub.publisher}.`);
  }

  // --- DOI / URL ---
  if (pub.doi) {
    const doi = pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`;
    parts.push(doi);
  } else if (pub.url) {
    parts.push(pub.url);
  }

  return parts.join(' ');
}

/**
 * Format a single author name for APA.
 * Attempts to convert "First Middle Last" → "Last, F. M."
 * If already in "Last, First" format, abbreviate first name.
 */
function formatAPAAuthor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Unknown';

  // If already has a comma, assume "Last, First …"
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',').map(s => s.trim());
    const initials = rest
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(n => `${n[0].toUpperCase()}.`)
      .join(' ');
    return initials ? `${last}, ${initials}` : last;
  }

  // "First Middle Last" format
  const nameParts = trimmed.split(/\s+/);
  if (nameParts.length === 1) return nameParts[0];

  const last = nameParts[nameParts.length - 1];
  const initials = nameParts
    .slice(0, -1)
    .map(n => `${n[0].toUpperCase()}.`)
    .join(' ');

  return `${last}, ${initials}`;
}

/**
 * Format multiple publications as APA reference list.
 * Sorted alphabetically by first author, then by year.
 */
export function formatMultipleAPA(publications: Publication[]): string {
  const sorted = [...publications].sort((a, b) => {
    const authorA = (a.authors?.[0] || '').toLowerCase();
    const authorB = (b.authors?.[0] || '').toLowerCase();
    if (authorA !== authorB) return authorA.localeCompare(authorB);
    return (a.year || 0) - (b.year || 0);
  });

  return sorted.map(pub => formatAPA(pub)).join('\n\n');
}

/**
 * Build hierarchical tag path string, e.g. "Science > Biology > Genetics"
 */
export function getHierarchicalTagPath(tagId: string, allTags: Tag[]): string {
  const tag = allTags.find(t => t.id === tagId);
  if (!tag) return '';

  const chain = getTagParentChain(tag, allTags);
  const fullPath = [...chain, tag].map(t => t.name).join(' > ');
  return fullPath;
}

/**
 * Append hierarchical tags as BibTeX keywords field.
 */
export function buildTagKeywords(tagIds: string[], allTags: Tag[]): string {
  return tagIds
    .map(id => getHierarchicalTagPath(id, allTags))
    .filter(Boolean)
    .join(', ');
}

/**
 * Download a text file.
 */
export function downloadTextFile(content: string, filename: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
