import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VaultHealthGauge } from '../VaultHealthGauge';

describe('VaultHealthGauge', () => {
  it('renders the score, the complete/total stat, and a status label — never color alone', () => {
    render(<VaultHealthGauge scorePercent={92} completeCount={9} totalCount={10} />);
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('9_of_10_papers_complete')).toBeInTheDocument();
    // A text label always accompanies the status — color is never the only signal.
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('labels warning-range scores distinctly from good and critical', () => {
    render(<VaultHealthGauge scorePercent={65} completeCount={3} totalCount={10} />);
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('needs attention')).toBeInTheDocument();
  });

  it('labels low scores as critical', () => {
    render(<VaultHealthGauge scorePercent={20} completeCount={0} totalCount={10} />);
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('needs work')).toBeInTheDocument();
  });

  it('clamps out-of-range scores into [0, 100] for display', () => {
    render(<VaultHealthGauge scorePercent={140} completeCount={10} totalCount={10} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders no fill arc at 0% (only the track), without throwing on degenerate geometry', () => {
    render(<VaultHealthGauge scorePercent={0} completeCount={0} totalCount={5} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    // Track (muted) + no colored fill path: exactly one <path> in the SVG.
    const svg = screen.getByRole('img', { name: /vault health score/i });
    const paths = svg.querySelectorAll('path');
    expect(paths).toHaveLength(1);
  });

  it('renders both track and fill arcs for a mid-range score', () => {
    render(<VaultHealthGauge scorePercent={50} completeCount={5} totalCount={10} />);
    const svg = screen.getByRole('img', { name: /vault health score/i });
    expect(svg.querySelectorAll('path')).toHaveLength(2);
  });

  it('exposes an accessible name summarizing the score and status', () => {
    render(<VaultHealthGauge scorePercent={92} completeCount={9} totalCount={10} />);
    expect(screen.getByRole('img', { name: /92 percent, healthy/i })).toBeInTheDocument();
  });
});
