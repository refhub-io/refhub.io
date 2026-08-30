import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Publication } from '@/types/database';
import { VaultHealthCheckDialog } from '../VaultHealthCheckDialog';
import { runVaultHealthEnrichment, VaultHealthEnrichmentResult } from '@/lib/vaultHealthCheck';

vi.mock('@/lib/vaultHealthCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vaultHealthCheck')>();
  return {
    ...actual,
    runVaultHealthEnrichment: vi.fn(),
  };
});

const mockedRunVaultHealthEnrichment = vi.mocked(runVaultHealthEnrichment);

function makePublication(overrides: Partial<Publication>): Publication {
  return {
    id: 'pub-default',
    user_id: 'u1',
    title: 'Default Title',
    authors: ['Ada Lovelace'],
    year: 2020,
    journal: 'Journal of Testing',
    volume: '12',
    issue: '3',
    pages: '1-10',
    doi: '10.1000/default',
    url: 'https://example.com/default',
    abstract: 'An abstract.',
    pdf_url: 'https://example.com/default.pdf',
    bibtex_key: 'Default2020',
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
    keywords: ['testing'],
    reading_state: 'unread',
    important: false,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

// A publication missing almost everything -- triggers most field-level issue types.
const brokenPub = makePublication({
  id: 'broken-1',
  title: '',
  authors: [],
  year: null,
  journal: null,
  booktitle: null,
  abstract: null,
  url: null,
  doi: null,
  bibtex_key: null,
  pdf_url: null,
});

// A fully-populated, DOI-bearing publication so enrichment has something eligible to run on.
const healthyPub = makePublication({
  id: 'healthy-1',
  title: 'A Well-Formed Paper About Testing',
  doi: '10.1000/healthy',
  bibtex_key: 'Healthy2021',
});

describe('VaultHealthCheckDialog', () => {
  it('renders the report phase with grouped issue counts matching scanVaultHealth output', () => {
    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[brokenPub, healthyPub]}
        onApplyDiffs={vi.fn()}
      />,
    );

    // brokenPub triggers exactly one issue of each of these types.
    expect(screen.getByText('// missing_doi (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_title (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_authors (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_venue (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_year (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_abstract (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_url (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_bibtex_key (1)')).toBeInTheDocument();
    expect(screen.getByText('// missing_pdf (1)')).toBeInTheDocument();

    // healthyPub should not contribute any issues.
    expect(screen.queryByText('// malformed_bibtex_key (1)')).not.toBeInTheDocument();
  });

  it('shows the healthy empty state when scanVaultHealth finds no issues', () => {
    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub]}
        onApplyDiffs={vi.fn()}
      />,
    );

    expect(screen.getByText('// vault_looks_healthy')).toBeInTheDocument();
  });

  it('disables run_enrichment when no publication has a DOI', () => {
    const noDoiPub = makePublication({ id: 'no-doi', doi: null, url: 'https://example.com/x' });
    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[noDoiPub]}
        onApplyDiffs={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /run_enrichment/i })).toBeDisabled();
  });

  it('calls onApplyDiffs with the correct patch shape once a diff is enriched, checked, and applied', async () => {
    const enrichmentResult: VaultHealthEnrichmentResult = {
      publication: healthyPub,
      diffs: [
        { field: 'title', label: 'title', current: healthyPub.title, incoming: 'An Updated Title' },
      ],
    };
    mockedRunVaultHealthEnrichment.mockResolvedValue({ results: [enrichmentResult], skippedCount: 0 });

    const onApplyDiffs = vi.fn().mockResolvedValue(undefined);

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub]}
        onApplyDiffs={onApplyDiffs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));

    await waitFor(() => {
      expect(screen.getByText('title')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /apply_selected/i }));

    await waitFor(() => {
      expect(onApplyDiffs).toHaveBeenCalledTimes(1);
    });

    expect(onApplyDiffs).toHaveBeenCalledWith([
      { publicationId: 'healthy-1', patch: { title: 'An Updated Title' } },
    ]);
  });

  it('scopes checkbox selection per publication via composite keys (no cross-publication bleed)', async () => {
    const pubTwo = makePublication({ id: 'healthy-2', title: 'Second Paper', doi: '10.1000/second', bibtex_key: 'Second2021' });
    const results: VaultHealthEnrichmentResult[] = [
      { publication: healthyPub, diffs: [{ field: 'title', label: 'title', current: healthyPub.title, incoming: 'Title A Updated' }] },
      { publication: pubTwo, diffs: [{ field: 'title', label: 'title', current: pubTwo.title, incoming: 'Title B Updated' }] },
    ];
    mockedRunVaultHealthEnrichment.mockResolvedValue({ results, skippedCount: 0 });

    const onApplyDiffs = vi.fn().mockResolvedValue(undefined);

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub, pubTwo]}
        onApplyDiffs={onApplyDiffs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));
    await waitFor(() => {
      // "Second Paper" appears both as the pub-two heading and as the diff's
      // unchanged "current" value, so just assert the heading shows up.
      expect(screen.getByRole('heading', { name: 'Second Paper' })).toBeInTheDocument();
    });

    // Uncheck only the first publication's diff row (each publication has exactly
    // one diff/checkbox here, and results render in the same order as `publications`,
    // so the first checkbox in the DOM belongs to healthyPub).
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    fireEvent.click(screen.getByRole('button', { name: /apply_selected/i }));

    await waitFor(() => {
      expect(onApplyDiffs).toHaveBeenCalledTimes(1);
    });

    // Only pubTwo's diff should remain selected -- unchecking pub one's row must not affect pub two's.
    expect(onApplyDiffs).toHaveBeenCalledWith([
      { publicationId: 'healthy-2', patch: { title: 'Title B Updated' } },
    ]);
  });

  it('returns to the review phase (not stuck) if onApplyDiffs rejects', async () => {
    mockedRunVaultHealthEnrichment.mockResolvedValue({
      results: [{ publication: healthyPub, diffs: [{ field: 'title', label: 'title', current: healthyPub.title, incoming: 'Updated' }] }],
      skippedCount: 0,
    });
    const onApplyDiffs = vi.fn().mockRejectedValue(new Error('save failed'));

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub]}
        onApplyDiffs={onApplyDiffs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));
    await waitFor(() => {
      expect(screen.getByText('title')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /apply_selected/i }));

    await waitFor(() => {
      expect(onApplyDiffs).toHaveBeenCalledTimes(1);
    });

    // Still on the review phase (diff row still visible), and apply is re-enabled for retry.
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply_selected/i })).toBeEnabled();
  });

  it('surfaces failed lookups instead of silently reporting "no changes found"', async () => {
    mockedRunVaultHealthEnrichment.mockResolvedValue({
      results: [{ publication: healthyPub, diffs: [], error: 'Semantic Scholar is rate limiting requests. Try again shortly.' }],
      skippedCount: 0,
    });

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub]}
        onApplyDiffs={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));

    await waitFor(() => {
      expect(screen.getByText('// 1_lookups_failed')).toBeInTheDocument();
    });

    // The first failure's message is shown so a rate limit / outage is diagnosable.
    expect(
      screen.getByText('Semantic Scholar is rate limiting requests. Try again shortly.'),
    ).toBeInTheDocument();
    // The empty-diff state still renders alongside it, but it is no longer the only signal.
    expect(screen.getByText('// no_metadata_changes_found')).toBeInTheDocument();
  });

  it('counts every failed lookup and shows only the first error message', async () => {
    const pubTwo = makePublication({ id: 'healthy-2', doi: '10.1000/second', bibtex_key: 'Second2021' });
    const pubThree = makePublication({ id: 'healthy-3', doi: '10.1000/third', bibtex_key: 'Third2021' });
    mockedRunVaultHealthEnrichment.mockResolvedValue({
      results: [
        { publication: healthyPub, diffs: [], error: 'first failure' },
        { publication: pubTwo, diffs: [{ field: 'title', label: 'title', current: pubTwo.title, incoming: 'Updated' }] },
        { publication: pubThree, diffs: [], error: 'second failure' },
      ],
      skippedCount: 0,
    });

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub, pubTwo, pubThree]}
        onApplyDiffs={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));

    await waitFor(() => {
      expect(screen.getByText('// 2_lookups_failed')).toBeInTheDocument();
    });

    expect(screen.getByText('first failure')).toBeInTheDocument();
    expect(screen.queryByText('second failure')).not.toBeInTheDocument();
    // Failures are reported without hiding the diffs that did come back.
    expect(screen.getByRole('button', { name: /apply_selected \(1\)/i })).toBeInTheDocument();
  });

  it('does not render a failure banner when every lookup succeeded', async () => {
    mockedRunVaultHealthEnrichment.mockResolvedValue({ results: [{ publication: healthyPub, diffs: [] }], skippedCount: 0 });

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub]}
        onApplyDiffs={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));

    await waitFor(() => {
      expect(screen.getByText('// no_metadata_changes_found')).toBeInTheDocument();
    });
    expect(screen.queryByText(/_lookups_failed/)).not.toBeInTheDocument();
  });

  it('keeps apply disabled when disabled=true regardless of phase, even with checked diffs', async () => {
    mockedRunVaultHealthEnrichment.mockResolvedValue({
      results: [{ publication: healthyPub, diffs: [{ field: 'title', label: 'title', current: healthyPub.title, incoming: 'Updated' }] }],
      skippedCount: 0,
    });

    render(
      <VaultHealthCheckDialog
        open
        onOpenChange={() => {}}
        publications={[healthyPub]}
        onApplyDiffs={vi.fn()}
        disabled
      />,
    );

    // Report phase: no apply button is present yet, but run_enrichment is still allowed to run.
    expect(screen.queryByRole('button', { name: /apply_selected/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /run_enrichment/i }));

    await waitFor(() => {
      expect(screen.getByText('title')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /apply_selected/i })).toBeDisabled();
  });
});
