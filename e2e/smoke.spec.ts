import { test, expect } from '@playwright/test';

// Minimal smoke tests for unauthenticated public surface. The authenticated
// workflow surface (NodeCard / EditNodeDialog / PerFrameEditor) needs a
// signed-in session + a real run, so it lives in a separate spec gated on
// e2e test credentials — TODO once those exist.

test('landing renders without runtime error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
  expect(errors, `pageerror events: ${errors.join('\n')}`).toHaveLength(0);
});

test('sign-in page renders without runtime error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  const res = await page.goto('/sign-in');
  expect(res?.status(), 'sign-in HTTP status').toBeLessThan(500);
  expect(errors, `pageerror events: ${errors.join('\n')}`).toHaveLength(0);
});
