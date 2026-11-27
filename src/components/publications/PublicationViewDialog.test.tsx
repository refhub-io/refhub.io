import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Publication } from '@/types/database';
import { PublicationViewDialog } from './PublicationViewDialog';

// Papers in public vaults are read by people other than whoever entered their links.
const paper = {
  id: 'vp-1', user_id: 'user-1', title: 'A Paper', authors: ['Ada Lovelace'], year: 2024, doi: null,
  url: 'javascript:alert(1)', pdf_url: 'https://example.org/paper.pdf', publication_type: 'article',
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
} as unknown as Publication;

const linkTargets = () => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

describe('PublicationViewDialog links', () => {
  it('links the paper URL, PDF and Drive copy only when they are http(s)', () => {
    render(
      <PublicationViewDialog
        open onOpenChange={vi.fn()} publication={paper} tags={[]} allTags={[]} driveUrl="javascript:alert(2)"
      />,
    );

    expect(linkTargets()).toContain('https://example.org/paper.pdf');
    expect(linkTargets().filter((href) => /^\s*javascript:/i.test(href))).toEqual([]);
  });

  it('links a Drive copy with an https URL', () => {
    render(
      <PublicationViewDialog
        open onOpenChange={vi.fn()} publication={{ ...paper, pdf_url: null }} tags={[]} allTags={[]}
        driveUrl="https://drive.google.com/file/d/abc/view"
      />,
    );

    expect(linkTargets()).toContain('https://drive.google.com/file/d/abc/view');
  });
});
