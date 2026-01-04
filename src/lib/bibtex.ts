import { Publication } from "@/types/database";

export function generateBibtexKey(pub: Publication): string {
  if (pub.bibtex_key) return pub.bibtex_key;
  
  const firstAuthor = pub.authors[0] || 'Unknown';
  const lastName = firstAuthor.split(' ').pop()?.toLowerCase() || 'unknown';
  const year = pub.year || 'n.d.';
  const titleWord = pub.title.split(' ')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'untitled';
  
  return `${lastName}${year}${titleWord}`;
}

export function publicationToBibtex(pub: Publication): string {
  const key = generateBibtexKey(pub);
  const type = pub.publication_type || 'article';
  
  const fields: string[] = [];
  
  fields.push(`  title = {${pub.title}}`);
  
  if (pub.authors.length > 0) {
    fields.push(`  author = {${pub.authors.join(' and ')}}`);
  }
  
  if (pub.year) {
    fields.push(`  year = {${pub.year}}`);
  }
  
  if (pub.journal) {
    fields.push(`  journal = {${pub.journal}}`);
  }
  
  if (pub.volume) {
    fields.push(`  volume = {${pub.volume}}`);
  }
  
  if (pub.issue) {
    fields.push(`  number = {${pub.issue}}`);
  }
  
  if (pub.pages) {
    fields.push(`  pages = {${pub.pages}}`);
  }
  
  if (pub.doi) {
    fields.push(`  doi = {${pub.doi}}`);
  }
  
  if (pub.url) {
    fields.push(`  url = {${pub.url}}`);
  }
  
  if (pub.abstract) {
    fields.push(`  abstract = {${pub.abstract}}`);
  }
  
  return `@${type}{${key},\n${fields.join(',\n')}\n}`;
}

export function exportMultipleToBibtex(publications: Publication[]): string {
  return publications.map(publicationToBibtex).join('\n\n');
}

export function downloadBibtex(content: string, filename: string = 'references.bib') {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Parse a single BibTeX entry
interface ParsedEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

function parseField(content: string): string {
  // Remove surrounding braces or quotes
  let value = content.trim();
  if ((value.startsWith('{') && value.endsWith('}')) || 
      (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  // Handle nested braces
  return value.replace(/\{([^}]*)\}/g, '$1').trim();
}

function parseBibtexEntry(entry: string): ParsedEntry | null {
  // Match entry type and key: @article{key,
  const headerMatch = entry.match(/@(\w+)\s*\{\s*([^,\s]+)\s*,/i);
  if (!headerMatch) return null;

  const type = headerMatch[1].toLowerCase();
  const key = headerMatch[2];
  
  // Extract the content after the key
  const contentStart = entry.indexOf(',') + 1;
  const contentEnd = entry.lastIndexOf('}');
  if (contentStart <= 0 || contentEnd <= contentStart) return null;
  
  const content = entry.slice(contentStart, contentEnd);
  
  const fields: Record<string, string> = {};
  
  // Parse fields - handle nested braces
  let currentField = '';
  let currentValue = '';
  let braceDepth = 0;
  let inValue = false;
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (!inValue) {
      if (char === '=') {
        inValue = true;
        currentField = currentField.trim().toLowerCase();
      } else {
        currentField += char;
      }
    } else {
      if (char === '{' && !inQuotes) {
        braceDepth++;
        if (braceDepth > 1) currentValue += char;
      } else if (char === '}' && !inQuotes) {
        braceDepth--;
        if (braceDepth > 0) currentValue += char;
        if (braceDepth === 0) {
          fields[currentField] = parseField(currentValue);
          currentField = '';
          currentValue = '';
          inValue = false;
        }
      } else if (char === '"' && braceDepth === 0) {
        if (!inQuotes) {
          inQuotes = true;
        } else {
          inQuotes = false;
          fields[currentField] = parseField(currentValue);
          currentField = '';
          currentValue = '';
          inValue = false;
        }
      } else if (char === ',' && braceDepth === 0 && !inQuotes) {
        if (currentValue.trim()) {
          fields[currentField] = parseField(currentValue);
        }
        currentField = '';
        currentValue = '';
        inValue = false;
      } else if (braceDepth > 0 || inQuotes) {
        currentValue += char;
      } else if (char.trim()) {
        currentValue += char;
      }
    }
  }
  
  // Handle last field if any
  if (currentField && currentValue.trim()) {
    fields[currentField] = parseField(currentValue);
  }
  
  return { type, key, fields };
}

export function parseBibtex(bibtexContent: string): Partial<Publication>[] {
  const publications: Partial<Publication>[] = [];
  
  // Split into entries by finding balanced braces after @type{
  const entries: string[] = [];
  let i = 0;
  const content = bibtexContent;
  
  while (i < content.length) {
    // Find next @ that starts an entry type
    const atIndex = content.indexOf('@', i);
    if (atIndex === -1) break;
    
    // Check if it's a valid entry start (@ followed by word characters)
    const afterAt = content.slice(atIndex + 1);
    const typeMatch = afterAt.match(/^(\w+)\s*\{/);
    if (!typeMatch) {
      i = atIndex + 1;
      continue;
    }
    
    // Find the opening brace
    const braceStart = atIndex + 1 + typeMatch[0].indexOf('{');
    
    // Find matching closing brace
    let braceDepth = 0;
    let entryEnd = -1;
    for (let j = braceStart; j < content.length; j++) {
      if (content[j] === '{') {
        braceDepth++;
      } else if (content[j] === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          entryEnd = j + 1;
          break;
        }
      }
    }
    
    if (entryEnd > atIndex) {
      entries.push(content.slice(atIndex, entryEnd));
      i = entryEnd;
    } else {
      i = atIndex + 1;
    }
  }
  
  for (const entry of entries) {
    const parsed = parseBibtexEntry(entry);
    if (!parsed) continue;
    
    const { type, key, fields } = parsed;
    
    // Parse authors - split by " and "
    const authors = fields.author
      ? fields.author.split(/\s+and\s+/i).map(a => a.trim())
      : [];
    
    // Parse year
    const year = fields.year ? parseInt(fields.year, 10) : undefined;
    
    // Map BibTeX type to our types
    let publicationType = type;
    if (type === 'inproceedings' || type === 'conference') {
      publicationType = 'inproceedings';
    } else if (type === 'phdthesis' || type === 'mastersthesis') {
      publicationType = 'thesis';
    } else if (type === 'techreport') {
      publicationType = 'report';
    } else if (!['article', 'book', 'thesis', 'report', 'misc'].includes(type)) {
      publicationType = 'misc';
    }
    
    publications.push({
      title: fields.title || 'Untitled',
      authors,
      year: isNaN(year!) ? undefined : year,
      journal: fields.journal || fields.booktitle || undefined,
      volume: fields.volume || undefined,
      issue: fields.number || undefined,
      pages: fields.pages || undefined,
      doi: fields.doi || undefined,
      url: fields.url || undefined,
      abstract: fields.abstract || undefined,
      bibtex_key: key,
      publication_type: publicationType,
    });
  }
  
  return publications;
}

// DOI lookup using CrossRef API
export interface DOIMetadata {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi: string;
  url?: string;
  abstract?: string;
  type?: string;
}

export async function fetchDOIMetadata(doi: string): Promise<DOIMetadata> {
  // Clean up DOI - extract just the DOI part
  let cleanDoi = doi.trim();
  
  // Handle various DOI formats
  if (cleanDoi.startsWith('https://doi.org/')) {
    cleanDoi = cleanDoi.replace('https://doi.org/', '');
  } else if (cleanDoi.startsWith('http://doi.org/')) {
    cleanDoi = cleanDoi.replace('http://doi.org/', '');
  } else if (cleanDoi.startsWith('doi:')) {
    cleanDoi = cleanDoi.replace('doi:', '');
  } else if (cleanDoi.startsWith('https://dx.doi.org/')) {
    cleanDoi = cleanDoi.replace('https://dx.doi.org/', '');
  }
  
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('DOI not found or invalid');
  }
  
  const data = await response.json();
  const work = data.message;
  
  // Extract authors
  const authors = (work.author || []).map((a: any) => {
    if (a.given && a.family) {
      return `${a.given} ${a.family}`;
    }
    return a.name || 'Unknown Author';
  });
  
  // Extract year from published date
  let year: number | undefined;
  if (work['published-print']?.['date-parts']?.[0]?.[0]) {
    year = work['published-print']['date-parts'][0][0];
  } else if (work['published-online']?.['date-parts']?.[0]?.[0]) {
    year = work['published-online']['date-parts'][0][0];
  } else if (work['created']?.['date-parts']?.[0]?.[0]) {
    year = work['created']['date-parts'][0][0];
  }
  
  // Map CrossRef type to our types
  let publicationType = 'article';
  if (work.type === 'book' || work.type === 'book-chapter') {
    publicationType = 'book';
  } else if (work.type === 'proceedings-article') {
    publicationType = 'inproceedings';
  } else if (work.type === 'dissertation') {
    publicationType = 'thesis';
  } else if (work.type === 'report') {
    publicationType = 'report';
  }
  
  return {
    title: Array.isArray(work.title) ? work.title[0] : work.title || 'Untitled',
    authors,
    year,
    journal: work['container-title']?.[0] || undefined,
    volume: work.volume || undefined,
    issue: work.issue || undefined,
    pages: work.page || undefined,
    doi: cleanDoi,
    url: work.URL || `https://doi.org/${cleanDoi}`,
    abstract: work.abstract?.replace(/<[^>]*>/g, '') || undefined, // Strip HTML tags
    type: publicationType,
  };
}
