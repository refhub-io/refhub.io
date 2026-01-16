import { Publication } from "@/types/database";

export function generateBibtexKey(pub: Publication): string {
  if (pub.bibtex_key) return pub.bibtex_key;
  
  const firstAuthor = pub.authors[0] || 'Unknown';
  const lastName = firstAuthor.split(' ').pop()?.toLowerCase() || 'unknown';
  const year = pub.year || 'n.d.';
  const titleWord = pub.title.split(' ')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'untitled';
  
  return `${lastName}${year}${titleWord}`;
}

export type BibtexField = 'title' | 'author' | 'year' | 'journal' | 'volume' | 'number' | 'pages' | 'doi' | 'url' | 'abstract' | 
  'booktitle' | 'chapter' | 'edition' | 'editor' | 'howpublished' | 'institution' | 'organization' | 'publisher' | 'school' | 
  'series' | 'type' | 'eid' | 'isbn' | 'issn' | 'keywords';

const ALL_FIELDS: BibtexField[] = ['title', 'author', 'year', 'journal', 'volume', 'number', 'pages', 'doi', 'url', 'abstract',
  'booktitle', 'chapter', 'edition', 'editor', 'howpublished', 'institution', 'organization', 'publisher', 'school',
  'series', 'type', 'eid', 'isbn', 'issn', 'keywords'];

export function publicationToBibtex(pub: Publication, includedFields?: BibtexField[]): string {
  const key = generateBibtexKey(pub);
  const type = pub.publication_type || 'article';
  const fields: string[] = [];
  
  const fieldsToInclude = includedFields || ALL_FIELDS;
  
  if (fieldsToInclude.includes('title')) {
    fields.push(`  title = {${pub.title}}`);
  }
  
  if (fieldsToInclude.includes('author') && pub.authors.length > 0) {
    fields.push(`  author = {${pub.authors.join(' and ')}}`);
  }
  
  if (fieldsToInclude.includes('year') && pub.year) {
    fields.push(`  year = {${pub.year}}`);
  }
  
  if (fieldsToInclude.includes('journal') && pub.journal) {
    fields.push(`  journal = {${pub.journal}}`);
  }
  
  if (fieldsToInclude.includes('volume') && pub.volume) {
    fields.push(`  volume = {${pub.volume}}`);
  }
  
  if (fieldsToInclude.includes('number') && pub.issue) {
    fields.push(`  number = {${pub.issue}}`);
  }
  
  if (fieldsToInclude.includes('pages') && pub.pages) {
    fields.push(`  pages = {${pub.pages}}`);
  }
  
  if (fieldsToInclude.includes('doi') && pub.doi) {
    fields.push(`  doi = {${pub.doi}}`);
  }
  
  if (fieldsToInclude.includes('url') && pub.url) {
    fields.push(`  url = {${pub.url}}`);
  }
  
  if (fieldsToInclude.includes('abstract') && pub.abstract) {
    fields.push(`  abstract = {${pub.abstract}}`);
  }

  // Additional BibTeX fields
  if (fieldsToInclude.includes('booktitle') && pub.booktitle) {
    fields.push(`  booktitle = {${pub.booktitle}}`);
  }

  if (fieldsToInclude.includes('chapter') && pub.chapter) {
    fields.push(`  chapter = {${pub.chapter}}`);
  }

  if (fieldsToInclude.includes('edition') && pub.edition) {
    fields.push(`  edition = {${pub.edition}}`);
  }

  if (fieldsToInclude.includes('editor') && pub.editor && pub.editor.length > 0) {
    fields.push(`  editor = {${pub.editor.join(' and ')}}`);
  }

  if (fieldsToInclude.includes('howpublished') && pub.howpublished) {
    fields.push(`  howpublished = {${pub.howpublished}}`);
  }

  if (fieldsToInclude.includes('institution') && pub.institution) {
    fields.push(`  institution = {${pub.institution}}`);
  }

  if (fieldsToInclude.includes('organization') && pub.organization) {
    fields.push(`  organization = {${pub.organization}}`);
  }

  if (fieldsToInclude.includes('publisher') && pub.publisher) {
    fields.push(`  publisher = {${pub.publisher}}`);
  }

  if (fieldsToInclude.includes('school') && pub.school) {
    fields.push(`  school = {${pub.school}}`);
  }

  if (fieldsToInclude.includes('series') && pub.series) {
    fields.push(`  series = {${pub.series}}`);
  }

  if (fieldsToInclude.includes('type') && pub.type) {
    fields.push(`  type = {${pub.type}}`);
  }

  if (fieldsToInclude.includes('eid') && pub.eid) {
    fields.push(`  eid = {${pub.eid}}`);
  }

  if (fieldsToInclude.includes('isbn') && pub.isbn) {
    fields.push(`  isbn = {${pub.isbn}}`);
  }

  if (fieldsToInclude.includes('issn') && pub.issn) {
    fields.push(`  issn = {${pub.issn}}`);
  }

  if (fieldsToInclude.includes('keywords') && pub.keywords && pub.keywords.length > 0) {
    fields.push(`  keywords = {${pub.keywords.join(', ')}}`);
  }
  
  return `@${type}{${key},\n${fields.join(',\n')}\n}`;
}

export function exportMultipleToBibtex(publications: Publication[]): string {
  return publications.map(pub => publicationToBibtex(pub)).join('\n\n');
}

export function exportMultipleToBibtexWithFields(publications: Publication[], fields: BibtexField[]): string {
  return publications.map(pub => publicationToBibtex(pub, fields)).join('\n\n');
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
  
  // Use a more robust field extraction with regex
  // Match: fieldname = {value} or fieldname = "value"
  const fieldPattern = /(\w+)\s*=\s*(["{])/g;
  let match;
  const fieldStarts: Array<{ field: string; pos: number; delimiter: string }> = [];
  
  while ((match = fieldPattern.exec(content)) !== null) {
    fieldStarts.push({
      field: match[1].toLowerCase(),
      pos: match.index + match[0].length - 1, // Position of opening delimiter
      delimiter: match[2]
    });
  }
  
  // Extract value for each field
  for (let i = 0; i < fieldStarts.length; i++) {
    const { field, pos, delimiter } = fieldStarts[i];
    const nextFieldPos = i + 1 < fieldStarts.length ? fieldStarts[i + 1].pos : content.length;
    
    let value = '';
    let depth = 0;
    let j = pos + 1; // Start after opening delimiter
    
    if (delimiter === '{') {
      // Handle brace-delimited value
      depth = 1;
      while (j < nextFieldPos && depth > 0) {
        if (content[j] === '{') depth++;
        else if (content[j] === '}') depth--;
        
        if (depth > 0) {
          value += content[j];
        }
        j++;
      }
    } else {
      // Handle quote-delimited value
      while (j < nextFieldPos) {
        if (content[j] === '"' && (j === pos + 1 || content[j - 1] !== '\\')) {
          break; // Found closing quote (not escaped)
        }
        value += content[j];
        j++;
      }
    }
    
    if (value.trim()) {
      fields[field] = parseField(value);
    }
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

    // Parse editors - split by " and "
    const editor = fields.editor
      ? fields.editor.split(/\s+and\s+/i).map(e => e.trim())
      : [];

    // Parse keywords - split by comma
    const keywords = fields.keywords
      ? fields.keywords.split(',').map(k => k.trim())
      : [];
    
    // Parse year
    const year = fields.year ? parseInt(fields.year, 10) : undefined;
    
    // Keep publication type as-is from the BibTeX entry
    const publicationType = type;
    
    publications.push({
      title: fields.title?.trim() || 'Untitled',
      authors,
      year: isNaN(year!) ? undefined : year,
      journal: fields.journal || undefined,
      volume: fields.volume || undefined,
      issue: fields.number || undefined,
      pages: fields.pages || undefined,
      doi: fields.doi || undefined,
      url: fields.url || undefined,
      abstract: fields.abstract || undefined,
      bibtex_key: key,
      publication_type: publicationType,
      // Additional BibTeX fields
      booktitle: fields.booktitle || undefined,
      chapter: fields.chapter || undefined,
      edition: fields.edition || undefined,
      editor: editor.length > 0 ? editor : undefined,
      howpublished: fields.howpublished || undefined,
      institution: fields.institution || undefined,
      number: fields.number || undefined,
      organization: fields.organization || undefined,
      publisher: fields.publisher || undefined,
      school: fields.school || undefined,
      series: fields.series || undefined,
      type: fields.type || undefined,
      eid: fields.eid || undefined,
      isbn: fields.isbn || undefined,
      issn: fields.issn || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
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

function cleanDOI(doi: string): string {
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
  
  return cleanDoi;
}

async function fetchFromCrossRef(cleanDoi: string): Promise<DOIMetadata | null> {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const work = data.message;
    
    const authors = (work.author || []).map((a: { given?: string; family?: string; name?: string }) => {
      if (a.given && a.family) return `${a.given} ${a.family}`;
      return a.name || 'Unknown Author';
    });
    
    let year: number | undefined;
    if (work['published-print']?.['date-parts']?.[0]?.[0]) {
      year = work['published-print']['date-parts'][0][0];
    } else if (work['published-online']?.['date-parts']?.[0]?.[0]) {
      year = work['published-online']['date-parts'][0][0];
    } else if (work['created']?.['date-parts']?.[0]?.[0]) {
      year = work['created']['date-parts'][0][0];
    }
    
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
      abstract: work.abstract?.replace(/<[^>]*>/g, '') || undefined,
      type: publicationType,
    };
  } catch {
    return null;
  }
}

async function fetchFromOpenAlex(cleanDoi: string): Promise<DOIMetadata | null> {
  try {
    const response = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}`, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) return null;
    
    const work = await response.json();
    
    const authors = (work.authorships || []).map((a: { author?: { display_name?: string } }) => 
      a.author?.display_name || 'Unknown Author'
    );
    
    const year = work.publication_year || undefined;
    
    let publicationType = 'article';
    const type = work.type?.toLowerCase() || '';
    if (type.includes('book')) {
      publicationType = 'book';
    } else if (type.includes('proceedings') || type.includes('conference')) {
      publicationType = 'inproceedings';
    } else if (type.includes('dissertation') || type.includes('thesis')) {
      publicationType = 'thesis';
    } else if (type.includes('report')) {
      publicationType = 'report';
    }
    
    return {
      title: work.title || 'Untitled',
      authors,
      year,
      journal: work.primary_location?.source?.display_name || undefined,
      volume: work.biblio?.volume || undefined,
      issue: work.biblio?.issue || undefined,
      pages: work.biblio?.first_page && work.biblio?.last_page 
        ? `${work.biblio.first_page}-${work.biblio.last_page}` 
        : work.biblio?.first_page || undefined,
      doi: cleanDoi,
      url: work.doi ? `https://doi.org/${cleanDoi}` : work.id || undefined,
      abstract: work.abstract_inverted_index 
        ? reconstructAbstract(work.abstract_inverted_index)
        : undefined,
      type: publicationType,
    };
  } catch {
    return null;
  }
}

// OpenAlex stores abstracts as inverted index - reconstruct it
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map(w => w[0]).join(' ');
}

async function fetchFromSemanticScholar(cleanDoi: string): Promise<DOIMetadata | null> {
  try {
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=title,authors,year,venue,publicationVenue,abstract,externalIds,publicationTypes`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return null;
    
    const work = await response.json();
    
    const authors = (work.authors || []).map((a: { name?: string }) => a.name || 'Unknown Author');
    
    let publicationType = 'article';
    const types = work.publicationTypes || [];
    if (types.includes('Book') || types.includes('BookSection')) {
      publicationType = 'book';
    } else if (types.includes('Conference')) {
      publicationType = 'inproceedings';
    } else if (types.includes('Dissertation')) {
      publicationType = 'thesis';
    } else if (types.includes('Report')) {
      publicationType = 'report';
    }
    
    return {
      title: work.title || 'Untitled',
      authors,
      year: work.year || undefined,
      journal: work.venue || work.publicationVenue?.name || undefined,
      doi: cleanDoi,
      url: `https://doi.org/${cleanDoi}`,
      abstract: work.abstract || undefined,
      type: publicationType,
    };
  } catch {
    return null;
  }
}

export async function fetchDOIMetadata(doi: string): Promise<DOIMetadata> {
  const cleanDoi = cleanDOI(doi);
  
  // Try CrossRef first
  const crossRefResult = await fetchFromCrossRef(cleanDoi);
  if (crossRefResult) return crossRefResult;
  
  // Fallback to OpenAlex
  const openAlexResult = await fetchFromOpenAlex(cleanDoi);
  if (openAlexResult) return openAlexResult;
  
  // Fallback to Semantic Scholar
  const semanticScholarResult = await fetchFromSemanticScholar(cleanDoi);
  if (semanticScholarResult) return semanticScholarResult;
  
  throw new Error('DOI not found in CrossRef, OpenAlex, or Semantic Scholar');
}
