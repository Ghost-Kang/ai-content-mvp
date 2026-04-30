import { describe, it, expect } from 'vitest';
import { resolveProviderChain } from './router';
import type { LLMRequest, LLMRegion, ProviderName } from './types';

// resolveProviderChain only reads region/intent/preferredProvider, but the
// public LLMRequest interface requires messages/tenantId for parity with
// real callers. Build a minimal stub for the routing tests.
function req(opts: {
  region: LLMRegion;
  intent: LLMRequest['intent'];
  preferredProvider?: ProviderName;
}): LLMRequest {
  return {
    messages: [{ role: 'user', content: 'unused in routing tests' }],
    tenantId: '00000000-0000-0000-0000-000000000000',
    region: opts.region,
    intent: opts.intent,
    preferredProvider: opts.preferredProvider,
  };
}

describe('CN compliance — no foreign provider can sneak in', () => {
  it('CN strategy chain has no openai/anthropic', () => {
    const chain = resolveProviderChain(req({ region: 'CN', intent: 'strategy' }));
    expect(chain).not.toContain('openai');
    expect(chain).not.toContain('anthropic');
  });

  it('CN draft chain has no openai/anthropic', () => {
    const chain = resolveProviderChain(req({ region: 'CN', intent: 'draft' }));
    expect(chain).not.toContain('openai');
    expect(chain).not.toContain('anthropic');
  });

  it('CN channel_adapt chain has no openai/anthropic', () => {
    const chain = resolveProviderChain(req({ region: 'CN', intent: 'channel_adapt' }));
    expect(chain).not.toContain('openai');
    expect(chain).not.toContain('anthropic');
  });

  it('CN diff_annotate chain has no openai/anthropic', () => {
    const chain = resolveProviderChain(req({ region: 'CN', intent: 'diff_annotate' }));
    expect(chain).not.toContain('openai');
    expect(chain).not.toContain('anthropic');
  });
});

describe('CN fallback chain (audit #5)', () => {
  it('starts with kimi and includes qwen + ernie', () => {
    const chain = resolveProviderChain(req({ region: 'CN', intent: 'draft' }));
    expect(chain[0]).toBe('kimi');
    expect(chain).toContain('qwen');
    expect(chain).toContain('ernie');
  });
});

describe('preferredProvider override', () => {
  it('CN: silently drops a foreign preferredProvider', () => {
    const chain = resolveProviderChain(req({
      region: 'CN', intent: 'draft', preferredProvider: 'openai',
    }));
    expect(chain).not.toContain('openai');
    expect(chain[0]).toBe('kimi');
  });

  it('CN: honors a domestic preferredProvider', () => {
    const chain = resolveProviderChain(req({
      region: 'CN', intent: 'draft', preferredProvider: 'qwen',
    }));
    expect(chain[0]).toBe('qwen');
    expect(chain).toContain('kimi');
  });

  it('INTL: honors openai preference', () => {
    const chain = resolveProviderChain(req({
      region: 'INTL', intent: 'draft', preferredProvider: 'openai',
    }));
    expect(chain[0]).toBe('openai');
  });
});
