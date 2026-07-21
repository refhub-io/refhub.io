import type { Publication } from '@/types/database';
import type { SortField, SortDirection } from '@/hooks/useViewSettingsPersistence';

const READING_STATE_ORDER: Record<Publication['reading_state'], number> = {
  unread: 0,
  skimmed: 1,
  read: 2,
};

export function comparePublications(
  a: Publication,
  b: Publication,
  sortBy: SortField,
  sortDirection: SortDirection,
): number {
  const dir = sortDirection === 'asc' ? 1 : -1;
  switch (sortBy) {
    case 'title':
      return dir * a.title.localeCompare(b.title);
    case 'authors': {
      const aFirst = a.authors[0] || '';
      const bFirst = b.authors[0] || '';
      return dir * aFirst.localeCompare(bFirst);
    }
    case 'year':
      return dir * ((a.year || 0) - (b.year || 0));
    case 'journal': {
      const aJ = a.journal || '';
      const bJ = b.journal || '';
      return dir * aJ.localeCompare(bJ);
    }
    case 'type': {
      const aT = a.publication_type || '';
      const bT = b.publication_type || '';
      return dir * aT.localeCompare(bT);
    }
    case 'reading_state':
      return dir * (READING_STATE_ORDER[a.reading_state] - READING_STATE_ORDER[b.reading_state]);
    case 'important':
      return dir * (Number(a.important) - Number(b.important));
    case 'created':
    default:
      return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
}

export const SORT_FIELD_OPTIONS: { field: SortField; label: string; defaultDirection: SortDirection }[] = [
  { field: 'created', label: 'recently_added', defaultDirection: 'desc' },
  { field: 'title', label: 'title', defaultDirection: 'asc' },
  { field: 'authors', label: 'authors', defaultDirection: 'asc' },
  { field: 'year', label: 'publication_year', defaultDirection: 'desc' },
  { field: 'journal', label: 'journal', defaultDirection: 'asc' },
  { field: 'type', label: 'type', defaultDirection: 'asc' },
  { field: 'reading_state', label: 'reading_state', defaultDirection: 'asc' },
  { field: 'important', label: 'important', defaultDirection: 'desc' },
];
