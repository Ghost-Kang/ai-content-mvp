import { describe, expect, it } from 'vitest';

import { buildWorkflowRunFingerprint } from './run-fingerprint';

function fp(input: Parameters<typeof buildWorkflowRunFingerprint>[0]) {
  return buildWorkflowRunFingerprint(input).hash;
}

describe('buildWorkflowRunFingerprint', () => {
  it('normalizes topic whitespace for manual runs', () => {
    expect(fp({ topic: '  同一个   主题\n视频  ' })).toBe(fp({ topic: '同一个 主题 视频' }));
  });

  it('changes when the topic changes', () => {
    expect(fp({ topic: '主题 A' })).not.toBe(fp({ topic: '主题 B' }));
  });

  it('uses stable Quick Create fields', () => {
    const base = {
      topic: '面向市场负责人的产品：少拍脑袋',
      seedInput: {
        formula:        'provocation',
        lengthMode:     'short',
        productName:    'AI 内容工作流',
        targetAudience: 'B2B 市场负责人',
        coreClaim:      '少拍脑袋，多发布',
      },
    } as const;

    expect(fp(base)).toBe(fp({
      ...base,
      seedInput: {
        ...base.seedInput,
        coreClaim: ' 少拍脑袋，   多发布 ',
      },
    }));

    expect(fp(base)).not.toBe(fp({
      ...base,
      seedInput: {
        ...base.seedInput,
        coreClaim: '少猜方向，多发布',
      },
    }));
  });

  it('resumes the same trending opus even if non-identity metadata changes', () => {
    const first = fp({
      topic: '热点标题',
      seedInput: {
        sourceMeta: {
          platform:       'dy',
          opusId:         'abc123',
          rank:           5,
          url:            'https://example.com/one',
          authorNickname: 'Creator A',
        },
      },
    });

    const second = fp({
      topic: '热点标题',
      seedInput: {
        sourceMeta: {
          platform:       'dy',
          opusId:         'abc123',
          rank:           12,
          url:            'https://example.com/two',
          authorNickname: 'Creator B',
        },
      },
    });

    expect(second).toBe(first);
  });

  it('falls back to topic for trending sourceMeta without platform and opusId', () => {
    expect(fp({
      topic: '热点标题',
      seedInput: { sourceMeta: { rank: 5 } },
    })).toBe(fp({
      topic: ' 热点标题 ',
      seedInput: { sourceMeta: { rank: 9 } },
    }));
  });
});
