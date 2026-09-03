import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatchProvenanceList from '../MatchProvenanceList';
import type { TopicMatch } from '@/lib/codexDiscovery';
import type { Publication, Vault } from '@/types/database';

const vault: Vault = {
  id: 'v1',
  user_id: 'u1',
  name: 'Vault One',
  description: null,
  color: '#123456',
  visibility: 'public',
  public_slug: 'vault-one',
  category: null,
  abstract: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function makePublication(id: string, title: string): Publication {
  return {
    id,
    user_id: 'u1',
    title,
    authors: ['A. Author'],
    year: 2026,
    journal: null,
    volume: null,
    issue: null,
    pages: null,
    doi: null,
    url: null,
    abstract: null,
    pdf_url: null,
    bibtex_key: null,
    publication_type: 'article',
    notes: null,
    booktitle: null,
    chapter: null,
    edition: null,
    editor: null,
    howpublished: null,
    institution: null,
    number: null,
    organization: null,
    publisher: null,
    school: null,
    series: null,
    type: null,
    eid: null,
    isbn: null,
    issn: null,
    keywords: null,
    reading_state: 'unread',
    important: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function openDisclosure() {
  fireEvent.click(screen.getByRole('button', { name: /why_these_matched/ }));
}

describe('MatchProvenanceList', () => {
  it('renders an empty state / nothing for an empty match list', () => {
    const { container } = render(<MatchProvenanceList matches={[]} onOpenPublication={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('defaults to closed, showing a pill with the match count but not the match rows', () => {
    const match: TopicMatch = {
      publication: makePublication('p1', 'Paper One'),
      vault,
      signals: [{ type: 'tag', value: 'graph drawing' }],
    };
    render(<MatchProvenanceList matches={[match]} onOpenPublication={() => {}} />);
    expect(screen.getByText('// why_these_matched')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('Paper One')).not.toBeInTheDocument();
  });

  it('renders the publication title and a single badge for a match with one signal, once opened', () => {
    const match: TopicMatch = {
      publication: makePublication('p1', 'Paper One'),
      vault,
      signals: [{ type: 'tag', value: 'graph drawing' }],
    };
    render(<MatchProvenanceList matches={[match]} onOpenPublication={() => {}} />);
    openDisclosure();
    expect(screen.getByText('Paper One')).toBeInTheDocument();
    expect(screen.getByText('tag: graph drawing')).toBeInTheDocument();
  });

  it('renders ALL signal badges for a match with multiple signals, not just the first', () => {
    const match: TopicMatch = {
      publication: makePublication('p1', 'Paper One'),
      vault,
      signals: [
        { type: 'tag', value: 'graph drawing' },
        { type: 'keyword', value: 'graph drawing' },
        { type: 'notes', snippet: 'a very long note about graph drawing techniques, history, and applications across many fields' },
      ],
    };
    render(<MatchProvenanceList matches={[match]} onOpenPublication={() => {}} />);
    openDisclosure();
    expect(screen.getByText('tag: graph drawing')).toBeInTheDocument();
    expect(screen.getByText('keyword: graph drawing')).toBeInTheDocument();
    expect(screen.getByText('mentioned in notes')).toBeInTheDocument();
  });

  it('renders a short label for a notes-type signal, never the raw snippet text', () => {
    const longSnippet = 'a very long note about graph drawing techniques, history, and applications across many fields';
    const match: TopicMatch = {
      publication: makePublication('p1', 'Paper One'),
      vault,
      signals: [{ type: 'notes', snippet: longSnippet }],
    };
    render(<MatchProvenanceList matches={[match]} onOpenPublication={() => {}} />);
    openDisclosure();
    expect(screen.getByText('mentioned in notes')).toBeInTheDocument();
    expect(screen.queryByText(longSnippet)).not.toBeInTheDocument();
    expect(screen.queryByText(/graph drawing techniques/)).not.toBeInTheDocument();
  });

  it('renders a generic label for a citation signal, without resolving viaPublicationId to a title', () => {
    const match: TopicMatch = {
      publication: makePublication('p2', 'Cited Paper'),
      vault,
      signals: [{ type: 'citation', viaPublicationId: 'p1' }],
    };
    render(<MatchProvenanceList matches={[match]} onOpenPublication={() => {}} />);
    openDisclosure();
    expect(screen.getByText('cited by a related match')).toBeInTheDocument();
    expect(screen.queryByText(/p1/)).not.toBeInTheDocument();
  });

  it('calls onOpenPublication with the match publication when its title is activated', () => {
    const onOpenPublication = vi.fn();
    const publication = makePublication('p1', 'Paper One');
    const match: TopicMatch = { publication, vault, signals: [{ type: 'keyword', value: 'graph drawing' }] };
    render(<MatchProvenanceList matches={[match]} onOpenPublication={onOpenPublication} />);
    openDisclosure();
    fireEvent.click(screen.getByText('Paper One'));
    expect(onOpenPublication).toHaveBeenCalledWith(publication);
  });

  it('renders multiple matches, each with their own signals', () => {
    const matches: TopicMatch[] = [
      { publication: makePublication('p1', 'Paper One'), vault, signals: [{ type: 'tag', value: 'graph drawing' }] },
      { publication: makePublication('p2', 'Paper Two'), vault, signals: [{ type: 'keyword', value: 'graph drawing' }] },
    ];
    render(<MatchProvenanceList matches={matches} onOpenPublication={() => {}} />);
    openDisclosure();
    expect(screen.getByText('Paper One')).toBeInTheDocument();
    expect(screen.getByText('Paper Two')).toBeInTheDocument();
  });
});
