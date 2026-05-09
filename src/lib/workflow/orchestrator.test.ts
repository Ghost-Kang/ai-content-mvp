// Unit coverage for hydrate-stat helpers in orchestrator.ts.
//
// Why this exists: workflow_runs.total_video_count was silently sticking at
// 0 for QStash chunked-dispatch runs (probe-today on 2026-05-09 caught it
// — run 7fed5e72 had cost=834 fen but count=0). The hydrate-and-skip branch
// re-accrued cost from the persisted step row but ignored videoCount.
// `hydratedVideoCount` is the recovery shim so that branch can rebuild
// the count from the persisted output_json without a schema migration.

import { describe, it, expect } from 'vitest';
import { hydratedVideoCount } from './orchestrator';

describe('hydratedVideoCount', () => {
  it('returns 0 for non-video node types even with frames in output', () => {
    // Defensive: only the video node contributes to videoCount. A storyboard
    // node persisting a `frames` array (which it does) must not be counted.
    expect(hydratedVideoCount('storyboard', { frames: [{}, {}, {}] })).toBe(0);
    expect(hydratedVideoCount('script', { frames: [{}] })).toBe(0);
    expect(hydratedVideoCount('topic', { frames: [{}] })).toBe(0);
    expect(hydratedVideoCount('export', { frames: [{}] })).toBe(0);
  });

  it('returns 0 when output is null / undefined / non-object', () => {
    expect(hydratedVideoCount('video', null)).toBe(0);
    expect(hydratedVideoCount('video', undefined)).toBe(0);
    expect(hydratedVideoCount('video', 'string')).toBe(0);
    expect(hydratedVideoCount('video', 42)).toBe(0);
  });

  it('returns 0 when frames is missing or non-array', () => {
    expect(hydratedVideoCount('video', {})).toBe(0);
    expect(hydratedVideoCount('video', { frames: null })).toBe(0);
    expect(hydratedVideoCount('video', { frames: 'not-array' })).toBe(0);
    expect(hydratedVideoCount('video', { frames: { length: 5 } })).toBe(0);
  });

  it('returns frames.length for a video step with rendered frames', () => {
    // Mirrors the shape persisted by VideoNode: `output_json.frames` is an
    // array of rendered-frame records (jobId, videoUrl, etc.).
    const output = {
      provider: 'seedance',
      model: 'doubao-seedance-1-0-pro-250528',
      frames: [
        { index: 1, jobId: 'cgt-aaa', videoUrl: 'https://x/a.mp4' },
        { index: 2, jobId: 'cgt-bbb', videoUrl: 'https://x/b.mp4' },
        { index: 3, jobId: 'cgt-ccc', videoUrl: 'https://x/c.mp4' },
      ],
    };
    expect(hydratedVideoCount('video', output)).toBe(3);
  });

  it('returns 0 for a video step with an empty frames array', () => {
    // Edge case: video step persisted output before any frame succeeded
    // (e.g. checkpoint write on first batch). Should not crash, just 0.
    expect(hydratedVideoCount('video', { frames: [] })).toBe(0);
  });
});
