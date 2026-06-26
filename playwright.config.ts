import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 8081);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: process.env.PLAYWRIGHT_AUTH_STORAGE,
  },
  outputDir: 'test-results/e2e',
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // Safe local placeholders are enough for unauthenticated shell/screenshot tests.
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://example.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY:
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'local-playwright-placeholder',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
