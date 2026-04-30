import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // Pure-logic tests only for now. Anything that needs DB / Clerk / Vercel
    // env stays in scripts/probe-*.ts and runs manually. The purpose of this
    // suite is to catch regressions in deterministic logic (cascade rules,
    // is-admin parsing, monthly cap math, redaction) without spinning up a
    // database. Integration tests come later.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    // Stub env vars that modules read at import time so unit tests don't
    // need a real Supabase. Keep this minimal — anything that actually
    // needs the value belongs in scripts/probe-*.ts, not here.
    env: {
      DATABASE_URL: 'postgres://stub:stub@localhost:5432/stub?sslmode=disable',
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_stub_for_tests',
    },
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/db/**', 'src/server/**'],
    },
  },
});
