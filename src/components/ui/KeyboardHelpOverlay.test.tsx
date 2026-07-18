import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider, useKeyboardContext } from '@/contexts/KeyboardContext';
import { resources } from '@/config/resources';
import * as onboardingModule from '@/hooks/useOnboarding';
import { KeyboardHelpOverlay } from './KeyboardHelpOverlay';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    // jsdom doesn't implement ResizeObserver; Radix ScrollArea needs it to mount.
    // @ts-expect-error test-only polyfill
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function Harness({ tab }: { tab: 'keyboard' | 'guide' | 'resources' | 'ai-workflows' }) {
  const { openHelpOverlay } = useKeyboardContext();
  useEffect(() => {
    openHelpOverlay(tab);
  }, [openHelpOverlay, tab]);
  return <KeyboardHelpOverlay />;
}

describe('KeyboardHelpOverlay new tabs', () => {
  it('lists every configured resource with a working link on the resources tab', async () => {
    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="resources" />
        </KeyboardProvider>,
      );
    });

    expect(await screen.findByRole('tab', { name: /resources/i })).toHaveAttribute(
      'data-state',
      'active',
    );

    for (const resource of resources) {
      const link = screen.getByRole('link', { name: new RegExp(resource.name, 'i') });
      expect(link).toHaveAttribute('href', resource.url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('renders the ai agent workflows guide on the ai-workflows tab', async () => {
    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="ai-workflows" />
        </KeyboardProvider>,
      );
    });

    expect(await screen.findByRole('tab', { name: /ai.workflows/i })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(
      await screen.findByRole('heading', { name: /ai agent workflows/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('shows a restart_tour button only on the guide tab, which closes the overlay and restarts onboarding', async () => {
    const restartSpy = vi.spyOn(onboardingModule, 'restartOnboarding');

    let keyboardTabRender: ReturnType<typeof render>;
    await act(async () => {
      keyboardTabRender = render(
        <KeyboardProvider>
          <Harness tab="keyboard" />
        </KeyboardProvider>,
      );
    });
    expect(screen.queryByRole('button', { name: /restart_tour/i })).not.toBeInTheDocument();

    // Unmount before rendering the guide-tab harness so the still-open
    // keyboard-tab dialog from this render doesn't linger in the DOM
    // (render() mounts a fresh, independent React root each call).
    await act(async () => {
      keyboardTabRender.unmount();
    });

    await act(async () => {
      render(
        <KeyboardProvider>
          <Harness tab="guide" />
        </KeyboardProvider>,
      );
    });

    const restartButton = await screen.findByRole('button', { name: /restart_tour/i });
    await act(async () => {
      restartButton.click();
    });

    expect(restartSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a copy_guide button only on the ai-workflows tab that copies the guide markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    try {
      let keyboardTabRender: ReturnType<typeof render>;
      await act(async () => {
        keyboardTabRender = render(
          <KeyboardProvider>
            <Harness tab="keyboard" />
          </KeyboardProvider>,
        );
      });
      expect(screen.queryByRole('button', { name: /copy_guide/i })).not.toBeInTheDocument();

      await act(async () => {
        keyboardTabRender.unmount();
      });

      await act(async () => {
        render(
          <KeyboardProvider>
            <Harness tab="ai-workflows" />
          </KeyboardProvider>,
        );
      });

      const copyButton = await screen.findByRole('button', { name: /copy_guide/i });
      await act(async () => {
        copyButton.click();
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0][0]).toContain('# ai agent workflows');
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  });
});
