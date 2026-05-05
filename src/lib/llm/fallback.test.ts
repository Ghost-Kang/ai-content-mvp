import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LLMError, ProviderConfigError } from './types';
import type { LLMRequest, LLMResponse, ProviderName } from './types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Simple in-memory chain. Tests override per-case.
const mockChain: ProviderName[] = ['kimi', 'qwen', 'ernie'];

vi.mock('./router', () => ({
  resolveProviderChain: vi.fn(() => mockChain.slice()),
}));

// Spend cap always allows by default; one test flips it to refuse.
const spendCapState = { allowed: true };
vi.mock('./spend-tracker', () => ({
  checkSpendCap: vi.fn(async () => ({
    allowed:        spendCapState.allowed,
    reason:         spendCapState.allowed ? undefined : 'tenant_cap',
    tenantSpentFen: 0,
    tenantCapFen:   0,
    globalSpentFen: 0,
    globalCapFen:   0,
  })),
  recordSpend: vi.fn(async () => undefined),
}));

// Per-provider scriptable behavior. Each test sets `providerScript` to a
// function returning the response (or throwing) for a given provider.
const providerScript: Record<string, () => Promise<LLMResponse> | LLMResponse> = {};
const providerCalls: ProviderName[] = [];

vi.mock('./factory', () => ({
  getProvider: vi.fn((name: ProviderName) => ({
    complete: vi.fn(async (_req: LLMRequest): Promise<LLMResponse> => {
      providerCalls.push(name);
      const script = providerScript[name];
      if (!script) throw new Error(`no script for ${name}`);
      return script();
    }),
  })),
}));

// Per-provider breaker mock. We capture recordFailure calls so tests can
// assert whether a provider's reliability score was touched.
interface BreakerFake {
  isOpen:          () => boolean;
  msUntilReset:    () => number;
  recordSuccess:   () => void;
  recordFailure:   (err: LLMError) => void;
  failures:        LLMError[];
  successes:       number;
  forceOpen:       boolean;
}
const breakerFakes: Record<string, BreakerFake> = {};

function getOrMakeBreaker(name: ProviderName): BreakerFake {
  if (!breakerFakes[name]) {
    breakerFakes[name] = {
      forceOpen:     false,
      failures:      [],
      successes:     0,
      isOpen:        () => breakerFakes[name].forceOpen,
      msUntilReset:  () => 30_000,
      recordSuccess: () => { breakerFakes[name].successes++; },
      recordFailure: (err) => { breakerFakes[name].failures.push(err); },
    };
  }
  return breakerFakes[name];
}

vi.mock('./circuit-breaker', () => ({
  getCircuitBreaker: vi.fn((name: ProviderName) => getOrMakeBreaker(name)),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { executeWithFallback } from './fallback';

function req(): LLMRequest {
  return {
    messages: [{ role: 'user', content: 'hi' }],
    intent:   'draft',
    region:   'CN',
    tenantId: '00000000-0000-0000-0000-000000000000',
  };
}

function okResponse(name: ProviderName): LLMResponse {
  return {
    content:   'ok',
    provider:  name,
    model:     `${name}-test`,
    usage:     { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latencyMs: 100,
    requestId: 'req-1',
  };
}

beforeEach(() => {
  spendCapState.allowed = true;
  for (const k of Object.keys(providerScript)) delete providerScript[k];
  providerCalls.length = 0;
  for (const k of Object.keys(breakerFakes)) {
    breakerFakes[k].forceOpen = false;
    breakerFakes[k].failures.length = 0;
    breakerFakes[k].successes = 0;
  }
});

// ─── ProviderConfigError handling ─────────────────────────────────────────────

describe('executeWithFallback — ProviderConfigError handling', () => {
  it('skips an unconfigured provider WITHOUT touching its circuit breaker', async () => {
    providerScript.kimi = () => { throw new ProviderConfigError('kimi', 'Kimi API key not configured'); };
    providerScript.qwen = () => okResponse('qwen');

    const res = await executeWithFallback(req());
    expect(res.provider).toBe('qwen');

    // Critical regression: a missing key must not burn the breaker's budget.
    expect(getOrMakeBreaker('kimi').failures).toHaveLength(0);

    // qwen succeeded — breaker should record success.
    expect(getOrMakeBreaker('qwen').successes).toBe(1);
  });

  it('falls all the way through the chain if every provider is unconfigured', async () => {
    providerScript.kimi  = () => { throw new ProviderConfigError('kimi',  'no key'); };
    providerScript.qwen  = () => { throw new ProviderConfigError('qwen',  'no key'); };
    providerScript.ernie = () => { throw new ProviderConfigError('ernie', 'no key'); };

    await expect(executeWithFallback(req())).rejects.toMatchObject({
      code:      'PROVIDER_UNAVAILABLE',
      retryable: false,
    });

    // Each provider attempted exactly once.
    expect(providerCalls).toEqual(['kimi', 'qwen', 'ernie']);

    // None of them tripped a breaker.
    expect(getOrMakeBreaker('kimi').failures).toHaveLength(0);
    expect(getOrMakeBreaker('qwen').failures).toHaveLength(0);
    expect(getOrMakeBreaker('ernie').failures).toHaveLength(0);
  });

  it('continues past ProviderConfigError instead of throwing immediately (regression: pre-fix behavior threw on non-retryable LLMError shape)', async () => {
    // First provider unconfigured, second works.
    providerScript.kimi = () => { throw new ProviderConfigError('kimi', 'no key'); };
    providerScript.qwen = () => okResponse('qwen');

    const res = await executeWithFallback(req());
    expect(res.provider).toBe('qwen');
    expect(providerCalls).toEqual(['kimi', 'qwen']);
  });
});

// ─── Real LLMError still trips the breaker (regression guard) ─────────────────

describe('executeWithFallback — runtime errors still feed the breaker', () => {
  it('records failure on the breaker for a real RATE_LIMITED LLMError', async () => {
    providerScript.kimi = () => {
      throw new LLMError('RATE_LIMITED', 'kimi', 'rate limited', true);
    };
    providerScript.qwen = () => okResponse('qwen');

    await executeWithFallback(req());

    expect(getOrMakeBreaker('kimi').failures).toHaveLength(1);
    expect(getOrMakeBreaker('kimi').failures[0].code).toBe('RATE_LIMITED');
  });

  it('throws immediately on non-retryable LLMError (CONTENT_FILTERED)', async () => {
    providerScript.kimi = () => {
      throw new LLMError('CONTENT_FILTERED', 'kimi', 'blocked by safety', false);
    };
    providerScript.qwen = () => okResponse('qwen');

    await expect(executeWithFallback(req())).rejects.toMatchObject({
      code: 'CONTENT_FILTERED',
    });

    // qwen was NEVER called — non-retryable surfaces immediately.
    expect(providerCalls).toEqual(['kimi']);
  });
});

// ─── Spend cap gate (regression — pre-existing behavior) ──────────────────────

describe('executeWithFallback — spend cap gate', () => {
  it('refuses before spending a single token when cap is exceeded', async () => {
    spendCapState.allowed = false;

    await expect(executeWithFallback(req())).rejects.toMatchObject({
      code: 'SPEND_CAP_EXCEEDED',
    });

    // No provider should have been called.
    expect(providerCalls).toHaveLength(0);
  });
});
