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
    renderPanel({ relatedTopics: ['network visualization'], newInLast30Days: 0 });
    const link = screen.getByRole('link', { name: 'network visualization' });
    expect(link).toHaveAttribute('href', '/codex/topic/network-visualization');
  });

  it('shows a placeholder when there are no related topics', () => {
    renderPanel({ relatedTopics: [], newInLast30Days: 0 });
    expect(screen.getByText('// no_related_topics_yet')).toBeInTheDocument();
  });

  it('shows the 30-day stat only when there is at least one new paper', () => {
    const { rerender } = renderPanel({ relatedTopics: [], newInLast30Days: 0 });
    expect(screen.queryByText(/new_in_last_30_days/)).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <TopicSummaryPanel relatedTopics={[]} newInLast30Days={3} />
      </MemoryRouter>,
    );
    expect(screen.getByText('3_new_in_last_30_days')).toBeInTheDocument();
  });
});
