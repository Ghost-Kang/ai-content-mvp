import { describe, expect, it } from 'vitest';

import { formatEvent, serializeSnapshot, type Snapshot } from './sse-snapshot';

function makeSnapshot(over: Partial<Snapshot['run']> = {}): Snapshot {
  return {
    run: {
      id:              'run-1',
      topic:           '默认主题',
      status:          'running',
      totalCostFen:    0,
      totalVideoCount: 0,
      errorMsg:        null,
      createdAt:       '2026-05-06T08:00:00.000Z',
      startedAt:       '2026-05-06T08:00:01.000Z',
      completedAt:     null,
      updatedAt:       '2026-05-06T08:00:01.000Z',
      seedInput:       null,
      ...over,
    },
    steps: [],
  };
}

describe('Snapshot type — origin badge regression', () => {
  it('carries seedInput so SSE-pushed cache writes do not erase the origin badge', () => {
    // The bug we're guarding: SSE setQueryData OVERWRITES the entire
    // workflow.get cache value. If seedInput is missing from the Snapshot
    // type, every SSE tick wipes the field, deriveRunOrigin returns null,
    // and the "来自热门选题 · 抖音" / "来自快速创作" badge silently disappears.
    const snap = makeSnapshot({
      seedInput: {
        sourceMeta: { platform: 'dy', opusId: 'abc123', rank: 1 },
      },
    });

    expect(snap.run.seedInput).toEqual({
      sourceMeta: { platform: 'dy', opusId: 'abc123', rank: 1 },
    });
  });

  it('allows null seedInput for legacy / manual runs', () => {
    const snap = makeSnapshot({ seedInput: null });
    expect(snap.run.seedInput).toBeNull();
  });
});

describe('serializeSnapshot — change-detect key', () => {
  it('does NOT include seedInput in the change-detect key (it is static after creation; including it would not bring new info but would couple the wire format to a static field)', () => {
    const a = makeSnapshot({ seedInput: { formula: 'provocation' } });
    const b = makeSnapshot({ seedInput: { sourceMeta: { platform: 'dy' } } });

    // Different seedInput, but everything else identical → same key.
    // This guards against a refactor that adds seedInput to the wire format
    // and then triggers an SSE push every tick (wasting bandwidth).
    expect(serializeSnapshot(a)).toBe(serializeSnapshot(b));
  });

  it('changes when run status changes', () => {
    const a = makeSnapshot({ status: 'running' });
    const b = makeSnapshot({ status: 'done' });
    expect(serializeSnapshot(a)).not.toBe(serializeSnapshot(b));
  });

  it('intentionally excludes updatedAt to avoid false "content changed" pushes from CAS no-ops', () => {
    const a = makeSnapshot({ updatedAt: '2026-05-06T08:00:00.000Z' });
    const b = makeSnapshot({ updatedAt: '2026-05-06T09:00:00.000Z' });
    expect(serializeSnapshot(a)).toBe(serializeSnapshot(b));
  });
});

describe('formatEvent — SSE wire format', () => {
  it('terminates each event with \\n\\n so the client flushes a single message', () => {
    const out = formatEvent('snapshot', { ok: true });
    expect(out.endsWith('\n\n')).toBe(true);
    expect(out.startsWith('event: snapshot\n')).toBe(true);
    expect(out).toContain('data: {"ok":true}');
  });
});
