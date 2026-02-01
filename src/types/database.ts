export interface Publication {
  id: string;
  user_id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  pdf_url: string | null;
  bibtex_key: string | null;
  publication_type: string;
  notes: string | null;
  // Additional BibTeX fields
  booktitle: string | null;
  chapter: string | null;
  edition: string | null;
  editor: string[] | null;
  howpublished: string | null;
  institution: string | null;
  number: string | null;
  organization: string | null;
  publisher: string | null;
  school: string | null;
  series: string | null;
  type: string | null;
  eid: string | null;
  isbn: string | null;
  issn: string | null;
  keywords: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Vault {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  visibility: 'private' | 'public' | 'protected';
  public_slug: string | null;
  category: string | null;
  abstract: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultStats {
  id: string;
  vault_id: string;
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}


export const VAULT_CATEGORIES = [
  "Mathematics",
  "Computer and Information Sciences",
  "Artificial Intelligence",
  "Data Science",
  "Visualization",
  "Physical Sciences",
  "Chemical Sciences",
  "Earth and Related Environmental Sciences",
  "Biological Sciences",
  "Engineering",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Materials Engineering",
  "Medical and Health Sciences",
  "Clinical Medicine",
  "Health Sciences",
  "Agricultural Sciences",
  "Veterinary Sciences",
  "Social Sciences",
  "Psychology",
  "Economics and Business",
  "Education",
  "Sociology",
  "Law",
  "Political Science",
  "Geography",
  "Media and Communications",
  "Humanities",
  "History",
  "Philosophy",
  "Languages and Literature",
  "Arts",
  "Religious Studies"
] as const;

export type VaultCategory = typeof VAULT_CATEGORIES[number];

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  parent_id: string | null;
  depth: number;
  created_at: string;
}

export interface PublicationTag {
  id: string;
  publication_id: string | null;
  vault_publication_id?: string | null;
  tag_id: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  username: string | null;
  bio: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  bluesky_url: string | null;
  is_setup: boolean;
  created_at: string;
  updated_at: string;
}

export interface VaultShare {
  id: string;
  vault_id: string;
  shared_with_email: string | null;
  shared_with_user_id: string | null;
  shared_with_name: string | null;
  shared_by: string;
  role: 'viewer' | 'editor' | 'owner' | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'vault_shared' | 'vault_forked' | 'vault_favorited' | 'publication_updated';
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface PublicationRelation {
  id: string;
  publication_id: string;
  related_publication_id: string;
  relation_type: string;
  created_at: string;
  created_by: string;
}

export interface VaultFavorite {
  id: string;
  vault_id: string;
  user_id: string;
  created_at: string;
}

export interface VaultFork {
  id: string;
  original_vault_id: string;
  forked_vault_id: string;
  forked_by: string;
  created_at: string;
}

export const RELATION_TYPES = [
  { value: 'cites', label: 'Cites' },
  { value: 'extends', label: 'Extends' },
  { value: 'builds_on', label: 'Builds On' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'reviews', label: 'Reviews' },
] as const;

export type RelationType = typeof RELATION_TYPES[number]['value'];

export type PublicationType = 
  | 'article'
  | 'book'
  | 'booklet'
  | 'conference'
  | 'inbook'
  | 'incollection'
  | 'inproceedings'
  | 'manual'
  | 'mastersthesis'
  | 'misc'
  | 'phdthesis'
  | 'proceedings'
  | 'techreport'
  | 'unpublished';

export const PUBLICATION_TYPES: { value: PublicationType; label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'book', label: 'Book' },
  { value: 'booklet', label: 'Booklet' },
  { value: 'conference', label: 'Conference' },
  { value: 'inbook', label: 'In Book' },
  { value: 'incollection', label: 'In Collection' },
  { value: 'inproceedings', label: 'In Proceedings' },
  { value: 'manual', label: 'Manual' },
  { value: 'mastersthesis', label: 'Master\'s Thesis' },
  { value: 'misc', label: 'Miscellaneous' },
  { value: 'phdthesis', label: 'PhD Thesis' },
  { value: 'proceedings', label: 'Proceedings' },
  { value: 'techreport', label: 'Technical Report' },
  { value: 'unpublished', label: 'Unpublished' },
];

export interface VaultAccessRequest {
  id: string;
  vault_id: string;
  requester_id: string | null;
  requester_email: string | null;
  requester_name: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}
