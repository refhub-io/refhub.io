import { describe, expect, it } from 'vitest';
import { getValidHttpUrl } from './safeUrl';

describe('getValidHttpUrl', () => {
  it('returns http(s) URLs, trimmed and normalized', () => {
    expect(getValidHttpUrl('https://github.com/ada')).toBe('https://github.com/ada');
    expect(getValidHttpUrl('  http://example.org/paper.pdf  ')).toBe('http://example.org/paper.pdf');
    expect(getValidHttpUrl('HTTPS://Example.org')).toBe('https://example.org/');
  });

  it('rejects script and other non-http schemes, however they are written', () => {
    for (const value of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'mailto:ada@example.org',
      'ftp://example.org/file',
    ]) {
      expect(getValidHttpUrl(value), value).toBeNull();
    }
  });

  it('rejects empty, missing and relative values', () => {
    for (const value of [null, undefined, '', '   ', 'github.com/ada', '/vault/abc', '//example.org']) {
      expect(getValidHttpUrl(value), String(value)).toBeNull();
    }
  });
});
