import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopicSummaryPanel from '../TopicSummaryPanel';

function renderPanel(props: Parameters<typeof TopicSummaryPanel>[0]) {
  return render(
    <MemoryRouter>
      <TopicSummaryPanel {...props} />
    </MemoryRouter>,
  );
}

describe('TopicSummaryPanel', () => {
  it('renders related topics as links to their own topic pages', () => {
    renderPanel({ relatedTopics: ['network visualization'], curators: [], newInLast30Days: 0 });
    const link = screen.getByRole('link', { name: 'network visualization' });
    expect(link).toHaveAttribute('href', '/codex/topic/network-visualization');
  });

  it('renders distinct curator names', () => {
    renderPanel({
      relatedTopics: [],
      curators: [{ display_name: 'Ada Lovelace', username: 'ada' }, { display_name: null, username: 'grace' }],
      newInLast30Days: 0,
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('grace')).toBeInTheDocument();
  });

  it('shows a placeholder when there are no related topics or curators', () => {
    renderPanel({ relatedTopics: [], curators: [], newInLast30Days: 0 });
    expect(screen.getByText('// no_related_topics_yet')).toBeInTheDocument();
    expect(screen.getByText('// no_curators_yet')).toBeInTheDocument();
  });

  it('shows the 30-day stat only when there is at least one new paper', () => {
    const { rerender } = renderPanel({ relatedTopics: [], curators: [], newInLast30Days: 0 });
    expect(screen.queryByText(/new_in_last_30_days/)).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <TopicSummaryPanel relatedTopics={[]} curators={[]} newInLast30Days={3} />
      </MemoryRouter>,
    );
    expect(screen.getByText('3_new_in_last_30_days')).toBeInTheDocument();
  });
});
