import { beforeEach, describe, expect, it } from 'vitest';

import {
  FINGERPRINT_RESUME_WINDOW_MS,
  areAllStepsStale,
  findReusableRun,
  staleThresholdMs,
  type ReusableCandidate,
  type RunningStepSummary,
} from './dedup-policy';

// ─── findReusableRun ──────────────────────────────────────────────────────────

function candidate(over: Partial<ReusableCandidate>): ReusableCandidate {
  return {
    id:        'run-x',
    topic:     '默认主题',
    status:    'pending',
    seedInput: null,
    ...over,
  };
}

describe('findReusableRun', () => {
  const requested = { topic: '同一个主题' };

  it('returns the matching candidate when status is reusable', () => {
    const c = candidate({ id: 'run-1', topic: '同一个主题', status: 'pending' });
    expect(findReusableRun([c], requested)?.id).toBe('run-1');
  });

  it('matches across pending / running / failed', () => {
    for (const status of ['pending', 'running', 'failed'] as const) {
      const c = candidate({ id: `run-${status}`, topic: '同一个主题', status });
      expect(findReusableRun([c], requested)?.id).toBe(`run-${status}`);
    }
  });

  it('skips done — re-clicking on a finished prompt means "give me a new take"', () => {
    const c = candidate({ id: 'run-done', topic: '同一个主题', status: 'done' });
    expect(findReusableRun([c], requested)).toBeNull();
  });

  it('skips cancelled — user already chose to abandon it', () => {
    const c = candidate({ id: 'run-cancelled', topic: '同一个主题', status: 'cancelled' });
    expect(findReusableRun([c], requested)).toBeNull();
  });

  it('returns null when no fingerprint matches', () => {
    const c = candidate({ id: 'run-other', topic: '完全不同的主题', status: 'pending' });
    expect(findReusableRun([c], requested)).toBeNull();
  });

  it('returns the FIRST match in iteration order (caller orders desc by createdAt)', () => {
    const newer = candidate({ id: 'run-new', topic: '同一个主题', status: 'pending' });
    const older = candidate({ id: 'run-old', topic: '同一个主题', status: 'failed' });
    expect(findReusableRun([newer, older], requested)?.id).toBe('run-new');
  });

  it('respects seedInput — different formula = different run', () => {
    const a = candidate({
      id: 'run-prov',
      topic: '同一个主题',
      seedInput: { formula: 'provocation', lengthMode: 'short' },
    });
    expect(findReusableRun(
      [a],
      { topic: '同一个主题', seedInput: { formula: 'insight', lengthMode: 'short' } },
    )).toBeNull();
  });

  it('respects seedInput — same payload, different whitespace = same run', () => {
    const a = candidate({
      id: 'run-claim',
      topic: '同一个主题',
      seedInput: { coreClaim: '少拍脑袋，多发布' },
    });
    expect(findReusableRun(
      [a],
      { topic: '同一个主题', seedInput: { coreClaim: ' 少拍脑袋，   多发布 ' } },
    )?.id).toBe('run-claim');
  });
});

// ─── staleThresholdMs ─────────────────────────────────────────────────────────

describe('staleThresholdMs', () => {
  // nodeTimeoutMs reads env at call time, so we mutate process.env directly.
  // Each test clears its own knob to avoid leaking into siblings.
  beforeEach(() => {
    delete process.env.WORKFLOW_SCRIPT_NODE_TIMEOUT_MS;
    delete process.env.WORKFLOW_STORYBOARD_NODE_TIMEOUT_MS;
    delete process.env.WORKFLOW_VIDEO_NODE_TIMEOUT_MS;
    delete process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION;
    delete process.env.WORKFLOW_NODE_TIMEOUT_MS;
  });

  it('is strictly greater than the per-node timeout — the inequality the recovery flow depends on', () => {
    process.env.WORKFLOW_SCRIPT_NODE_TIMEOUT_MS = '120000';
    expect(staleThresholdMs('script')).toBeGreaterThan(120_000);
  });

  it('honors the 4-minute floor even for very short timeouts', () => {
    process.env.WORKFLOW_SCRIPT_NODE_TIMEOUT_MS = '5000';
    // Floor = 4 * 60 * 1000 = 240_000
    expect(staleThresholdMs('script')).toBe(240_000);
  });

  it('scales above the floor when timeout + slack exceeds it', () => {
    process.env.WORKFLOW_VIDEO_NODE_TIMEOUT_MS = '600000'; // 10 min
    // 600s + 60s slack = 660_000, which is > 240_000 floor
    expect(staleThresholdMs('video')).toBe(660_000);
  });

  it('falls back to the generic timeout for unknown node types', () => {
    process.env.WORKFLOW_NODE_TIMEOUT_MS = '300000';
    // 300s + 60s = 360_000 > 240_000 floor
    expect(staleThresholdMs('something-new')).toBe(360_000);
  });
});

// ─── areAllStepsStale ─────────────────────────────────────────────────────────

describe('areAllStepsStale', () => {
  beforeEach(() => {
    // Make script timeout deterministic so the threshold is predictable.
    process.env.WORKFLOW_SCRIPT_NODE_TIMEOUT_MS = '120000'; // → threshold = 240_000 (floor)
  });

  const now = 10_000_000;
  const longAgo  = new Date(now - 999_999_999);
  const justNow  = new Date(now - 1_000);

  it('treats an empty step list as stale (worker likely died before first row)', () => {
    expect(areAllStepsStale([], now)).toBe(true);
  });

  it('returns false when ANY step has a fresh updatedAt', () => {
    const steps: RunningStepSummary[] = [
      { nodeType: 'script',     updatedAt: longAgo, startedAt: longAgo },
      { nodeType: 'storyboard', updatedAt: justNow, startedAt: longAgo },
    ];
    expect(areAllStepsStale(steps, now)).toBe(false);
  });

  it('returns true when EVERY step is past its threshold', () => {
    const steps: RunningStepSummary[] = [
      { nodeType: 'script',     updatedAt: longAgo, startedAt: longAgo },
      { nodeType: 'storyboard', updatedAt: longAgo, startedAt: longAgo },
    ];
    expect(areAllStepsStale(steps, now)).toBe(true);
  });

  it('falls back to startedAt when updatedAt is null', () => {
    const fresh: RunningStepSummary = {
      nodeType: 'script', updatedAt: null, startedAt: justNow,
    };
    expect(areAllStepsStale([fresh], now)).toBe(false);
  });

  it('treats null updatedAt AND null startedAt as stale (no signal)', () => {
    const noSignal: RunningStepSummary = {
      nodeType: 'script', updatedAt: null, startedAt: null,
    };
    expect(areAllStepsStale([noSignal], now)).toBe(true);
  });

  it('parses ISO string timestamps the same as Date objects', () => {
    const fresh: RunningStepSummary = {
      nodeType: 'script', updatedAt: new Date(now - 1_000).toISOString(), startedAt: null,
    };
    expect(areAllStepsStale([fresh], now)).toBe(false);
  });

  it('uses per-node thresholds independently — fresh script + stale video → not stale', () => {
    process.env.WORKFLOW_VIDEO_NODE_TIMEOUT_MS = '900000'; // → threshold ~= 960_000
    const steps: RunningStepSummary[] = [
      // 5 min old script: > 240_000 script threshold → stale
      { nodeType: 'script', updatedAt: new Date(now - 5 * 60 * 1000), startedAt: null },
      // 5 min old video: < 960_000 video threshold → fresh
      { nodeType: 'video',  updatedAt: new Date(now - 5 * 60 * 1000), startedAt: null },
    ];
    // ANY fresh step → not stale
    expect(areAllStepsStale(steps, now)).toBe(false);
  });
});

// ─── FINGERPRINT_RESUME_WINDOW_MS ─────────────────────────────────────────────

describe('FINGERPRINT_RESUME_WINDOW_MS', () => {
  it('is 24 hours — the SQL filter in workflow.create depends on this exact value', () => {
    expect(FINGERPRINT_RESUME_WINDOW_MS).toBe(24 * 60 * 60 * 1_000);
  });
});
