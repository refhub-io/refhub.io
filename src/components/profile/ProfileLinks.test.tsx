import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProfileLinks } from './ProfileLinks';

describe('ProfileLinks', () => {
  it('links http(s) profile URLs', () => {
    render(<ProfileLinks profile={{ github_url: 'https://github.com/ada', linkedin_url: 'https://www.linkedin.com/in/ada' }} />);
    expect(screen.getByTitle('GitHub')).toHaveAttribute('href', 'https://github.com/ada');
    expect(screen.getByTitle('LinkedIn')).toHaveAttribute('href', 'https://www.linkedin.com/in/ada');
    expect(screen.queryByTitle('Bluesky')).toBeNull();
  });

  it('leaves out a link that is not http(s)', () => {
    const { container } = render(
      <ProfileLinks profile={{ github_url: 'javascript:alert(1)', linkedin_url: 'JAVASCRIPT:alert(1)', bluesky_url: 'data:text/html,x' }} />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('keeps a click from reaching a clickable parent when asked to', () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <ProfileLinks profile={{ github_url: 'https://github.com/ada' }} stopPropagation />
      </div>,
    );
    fireEvent.click(screen.getByTitle('GitHub'));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
