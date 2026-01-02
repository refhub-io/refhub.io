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
