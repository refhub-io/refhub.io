export interface Publication {
  id: string;
  user_id: string;
  vault_id: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface Vault {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  is_shared: boolean;
  is_public: boolean;
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
  'Machine Learning',
  'Computer Vision',
  'Natural Language Processing',
  'Robotics',
  'Physics',
  'Biology',
  'Chemistry',
  'Mathematics',
  'Economics',
  'Psychology',
  'Neuroscience',
  'Medicine',
  'Engineering',
  'Environmental Science',
  'Social Sciences',
  'Other',
] as const;

export type VaultCategory = typeof VAULT_CATEGORIES[number];

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface PublicationTag {
  id: string;
  publication_id: string;
  tag_id: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultShare {
  id: string;
  vault_id: string;
  shared_with_email: string;
  shared_by: string;
  permission: string;
  created_at: string;
}

export type PublicationType = 
  | 'article'
  | 'book'
  | 'inproceedings'
  | 'conference'
  | 'thesis'
  | 'report'
  | 'misc';

export const PUBLICATION_TYPES: { value: PublicationType; label: string }[] = [
  { value: 'article', label: 'Journal Article' },
  { value: 'book', label: 'Book' },
  { value: 'inproceedings', label: 'Conference Paper' },
  { value: 'conference', label: 'Conference' },
  { value: 'thesis', label: 'Thesis' },
  { value: 'report', label: 'Technical Report' },
  { value: 'misc', label: 'Miscellaneous' },
];
