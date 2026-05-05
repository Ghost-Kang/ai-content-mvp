import { describe, it, expect } from 'vitest';
import { parseRunSeedInput } from './parse-seed-input';

describe('parseRunSeedInput — empties', () => {
  it('returns undefined for null/undefined', () => {
    expect(parseRunSeedInput(null)).toBeUndefined();
    expect(parseRunSeedInput(undefined)).toBeUndefined();
  });

  it('returns undefined for non-objects', () => {
    expect(parseRunSeedInput('x')).toBeUndefined();
    expect(parseRunSeedInput(42)).toBeUndefined();
    expect(parseRunSeedInput([])).toBeUndefined();
  });

  it('returns undefined when no recognized keys', () => {
    expect(parseRunSeedInput({})).toBeUndefined();
    expect(parseRunSeedInput({ nope: 'value' })).toBeUndefined();
  });
});

describe('parseRunSeedInput — valid Quick Create payload', () => {
  it('passes through formula/lengthMode/strings', () => {
    const out = parseRunSeedInput({
      formula:        'provocation',
      lengthMode:     'short',
      productName:    '内容工作流 SaaS',
      targetAudience: '10-100 人 B2B 市场负责人',
      coreClaim:      'AI 没人看，不是 AI 不行，是缺品牌声音',
    });
    expect(out).toEqual({
      formula:        'provocation',
      lengthMode:     'short',
      productName:    '内容工作流 SaaS',
      targetAudience: '10-100 人 B2B 市场负责人',
      coreClaim:      'AI 没人看，不是 AI 不行，是缺品牌声音',
    });
  });

  it('preserves partial seed (only formula)', () => {
    const out = parseRunSeedInput({ formula: 'insight' });
    expect(out).toEqual({ formula: 'insight' });
  });
});

describe('parseRunSeedInput — fail-closed on bad values', () => {
  it('drops unknown formula/lengthMode silently', () => {
    const out = parseRunSeedInput({
      formula:    'evil',
      lengthMode: 'forever',
      productName: 'Real Product',
    });
    expect(out).toEqual({ productName: 'Real Product' });
  });

  it('drops empty/whitespace strings', () => {
    const out = parseRunSeedInput({
      productName:    '   ',
      targetAudience: '',
      coreClaim:      'has content',
    });
    expect(out).toEqual({ coreClaim: 'has content' });
  });

  it('clamps strings exceeding max length', () => {
    const longClaim = 'x'.repeat(500);
    const out = parseRunSeedInput({ coreClaim: longClaim });
    expect(out?.coreClaim?.length).toBe(300);
  });
});

describe('parseRunSeedInput — sourceMeta', () => {
  it('passes through valid sourceMeta', () => {
    const out = parseRunSeedInput({
      sourceMeta: {
        platform:       'dy',
        opusId:         'abc123',
        rank:           5,
        url:            'https://www.douyin.com/video/abc',
        authorNickname: 'Creator',
      },
    });
    expect(out?.sourceMeta).toEqual({
      platform:       'dy',
      opusId:         'abc123',
      rank:           5,
      url:            'https://www.douyin.com/video/abc',
      authorNickname: 'Creator',
    });
  });

  it('drops invalid sourceMeta fields, keeps the good ones', () => {
    const out = parseRunSeedInput({
      sourceMeta: {
        platform: 'unknown',
        opusId:   'good-id',
        rank:     0,                 // out of range, drops
        url:      'not-a-url',       // wrong scheme, drops
      },
    });
    expect(out?.sourceMeta).toEqual({ opusId: 'good-id' });
  });

  it('drops sourceMeta entirely if nothing valid inside', () => {
    const out = parseRunSeedInput({ sourceMeta: { platform: 'unknown' } });
    expect(out).toBeUndefined();
  });
});
