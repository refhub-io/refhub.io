import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

describe('ThemeToggle', () => {
  it('switches the page and the icon together, and remembers the choice', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(screen.getByTitle('switch to light mode'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(screen.getByTitle('switch to dark mode')).toBeInTheDocument();
  });
});
