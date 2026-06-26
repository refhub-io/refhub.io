import { test, expect } from '@playwright/test';

test('renders the unauthenticated app shell and captures a screenshot', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /refhub\.io/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue_with_google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue_with_github/i })).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath('auth-shell.png'),
    fullPage: true,
  });
});

test.describe('Quoterm feedback anchoring scaffold', () => {
  test.skip('edit-paper Save/Sync feedback visual check requires authenticated fixture data', async () => {
    // Follow-up for PR #139: set PLAYWRIGHT_AUTH_STORAGE and add stable
    // PLAYWRIGHT_TEST_VAULT_ID / item fixture data before exercising the edit-paper
    // Save/Sync feedback anchoring interaction. The local setup now supports the
    // browser, storageState, and screenshot capture needed for that test.
  });
});
