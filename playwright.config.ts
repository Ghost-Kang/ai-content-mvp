import { defineConfig, devices } from '@playwright/test';

// Minimal e2e config for the AI content workflow app. Only chromium for now —
// add firefox/webkit projects later if cross-browser parity becomes a goal.
//
// `webServer` lets `pnpm test:e2e` spin up `next dev` automatically; if a dev
// server is already running on :3000 (typical during local hacking), it's
// reused instead of duplicate-launched.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
