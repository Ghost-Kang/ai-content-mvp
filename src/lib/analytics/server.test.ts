import { describe, it, expect } from 'vitest';
import { redactUserContent } from './server';

describe('redactUserContent', () => {
  it('returns empty string for null/undefined', () => {
    expect(redactUserContent(null)).toBe('');
    expect(redactUserContent(undefined)).toBe('');
    expect(redactUserContent('')).toBe('');
  });

  it('produces redacted:N:hash format', () => {
    const r = redactUserContent('hello world');
    // shape: redacted:<length>:<12-hex>
    expect(r).toMatch(/^redacted:\d+:[a-f0-9]{12}$/);
  });

  it('encodes the actual length (not redacted length)', () => {
    const r = redactUserContent('hi');
    expect(r.startsWith('redacted:2:')).toBe(true);
  });

  it('truncates input over maxLen but reports truncated length', () => {
    const long = 'a'.repeat(100);
    const r = redactUserContent(long, 64);
    // Length reported should be the truncated length (64), not the original
    expect(r.startsWith('redacted:64:')).toBe(true);
  });

  it('different content produces different hashes', () => {
    const a = redactUserContent('topic A');
    const b = redactUserContent('topic B');
    expect(a).not.toBe(b);
  });

  it('same content produces same hash (allows funnel grouping)', () => {
    const a = redactUserContent('repeat me');
    const b = redactUserContent('repeat me');
    expect(a).toBe(b);
  });

  it('reveals no plaintext content', () => {
    const sensitive = '我的产品名: SecretSaaS';
    const r = redactUserContent(sensitive);
    expect(r).not.toContain('SecretSaaS');
    expect(r).not.toContain('产品名');
  });
});
