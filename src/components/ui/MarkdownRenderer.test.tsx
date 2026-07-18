import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
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

  it('does not promote a lone inline-math paragraph to display mode', () => {
    const { container } = render(
      <MarkdownRenderer>{'$x$'}</MarkdownRenderer>,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.querySelector('.katex-display')).toBeNull();
  });

  it('does not transform single-line $$...$$ inside a fenced code block', () => {
    const { container } = render(
      <MarkdownRenderer>{'```\n$$x$$\n```'}</MarkdownRenderer>,
    );
    const codeBlock = container.querySelector('pre code');
    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.querySelector('.katex')).toBeNull();
    expect(codeBlock?.textContent).toContain('$$x$$');
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

describe('MarkdownRenderer code blocks and links', () => {
  it('renders a copy button on fenced code blocks that copies the code text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const priorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    try {
      const { getByRole } = render(
        <MarkdownRenderer>{'```bash\nrefhub vaults list\n```'}</MarkdownRenderer>,
      );
      fireEvent.click(getByRole('button', { name: /copy code/i }));
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText).toHaveBeenCalledWith('refhub vaults list');
    } finally {
      if (priorDescriptor) {
        Object.defineProperty(navigator, 'clipboard', priorDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  });

  it('highlights cli entry points as built_in in bash blocks', () => {
    const { container } = render(
      <MarkdownRenderer>{'```bash\nrefhub vaults list\n```'}</MarkdownRenderer>,
    );
    const builtIns = [...container.querySelectorAll('pre code .hljs-built_in')].map(
      (el) => el.textContent,
    );
    expect(builtIns).toContain('refhub');
  });

  it('prefixes github.com links with an icon only when githubLinkIcons is set', () => {
    const md = '[refhub-cli](https://github.com/refhub-io/refhub-cli) and [docs](https://example.com)';
    const { container: plain } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    expect(plain.querySelector('a svg')).toBeNull();

    const { container: decorated } = render(
      <MarkdownRenderer githubLinkIcons>{md}</MarkdownRenderer>,
    );
    const links = [...decorated.querySelectorAll('a')];
    const github = links.find((a) => a.href.includes('github.com'));
    const external = links.find((a) => a.href.includes('example.com'));
    expect(github?.querySelector('svg')).not.toBeNull();
    expect(external?.querySelector('svg')).toBeNull();
  });
});
