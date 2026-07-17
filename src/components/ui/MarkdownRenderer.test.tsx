import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer math support', () => {
  it('renders inline math as KaTeX markup', () => {
    const { container } = render(
      <MarkdownRenderer>{'Euler: $e^{i\\pi} + 1 = 0$'}</MarkdownRenderer>,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders block math as display-mode KaTeX', () => {
    const { container } = render(
      <MarkdownRenderer>{'$$\\int_0^1 x\\,dx$$'}</MarkdownRenderer>,
    );
    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('renders invalid TeX as error text instead of crashing', () => {
    const { container } = render(
      <MarkdownRenderer>{'$\\unknowncommand{x}$'}</MarkdownRenderer>,
    );
    // rehype-katex (throwOnError: false via errorColor) leaves the source visible
    expect(container.textContent).toContain('\\unknowncommand');
  });

  it('still strips raw HTML script tags (sanitize pipeline intact)', () => {
    const { container } = render(
      <MarkdownRenderer>{'<script>window.hacked = true;</script>ok'}</MarkdownRenderer>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('ok');
  });
});
