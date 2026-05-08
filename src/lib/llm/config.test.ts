import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProviderConfig } from './config';
import { ProviderConfigError, type ProviderName } from './types';

// Regression: 2026-05-08 prod incident. requireEnv used to throw plain
// Error when an API key was missing. fallback.ts checks `instanceof
// ProviderConfigError` to distinguish "deployment problem" from "runtime
// failure" — a plain Error sailed past that check and tripped the
// circuit breaker permanently. After the fix, missing-key throws
// ProviderConfigError so the breaker stays cool and the chain keeps
// trying the provider on subsequent calls.

const KEY_ENV: Record<ProviderName, string> = {
  openai:    'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  ernie:     'ERNIE_API_KEY',
  qwen:      'QWEN_API_KEY',
  kimi:      'KIMI_API_KEY',
  deepseek:  'DEEPSEEK_API_KEY',
};

describe('getProviderConfig — missing key throws ProviderConfigError, not Error', () => {
  // Snapshot all 6 keys, blank them in beforeEach, restore in afterEach.
  // We can't use process.env.X = undefined reliably across nodes, so save
  // + delete + restore.
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const env of Object.values(KEY_ENV)) {
      originals[env] = process.env[env];
      delete process.env[env];
    }
  });

  afterEach(() => {
    for (const [env, val] of Object.entries(originals)) {
      if (val === undefined) delete process.env[env];
      else process.env[env] = val;
    }
  });

  const providers = Object.keys(KEY_ENV) as ProviderName[];
  for (const providerName of providers) {
    const envKey = KEY_ENV[providerName];
    it(`${providerName}: missing ${envKey} throws ProviderConfigError`, () => {
      try {
        getProviderConfig(providerName);
        throw new Error('expected getProviderConfig to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderConfigError);
        expect((err as ProviderConfigError).provider).toBe(providerName);
        expect((err as ProviderConfigError).message).toContain(envKey);
      }
    });
  }
});

describe('getProviderConfig — present key returns config', () => {
  it('returns apiKey/baseUrl/model when env is set', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-config-roundtrip';
    const cfg = getProviderConfig('deepseek');
    expect(cfg.apiKey).toBe('sk-test-config-roundtrip');
    expect(cfg.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(cfg.model).toBe('deepseek-chat');
    delete process.env.DEEPSEEK_API_KEY;
  });
});
