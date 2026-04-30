import { describe, it, expect } from 'vitest';
import { SpendCapError } from './spend-cap';

// readMonthlyUsage / projectedCapCheck / assertCapAllows all hit the DB and
// belong in scripts/probe-*.ts. Here we verify only the pure parts:
//
//   - SpendCapError carries its snapshot through to consumers
//   - serialised message format matches what the orchestrator log + admin
//     dashboard parser assume

describe('SpendCapError', () => {
  it('exposes the snapshot for downstream branching', () => {
    const snapshot = {
      monthKey: '2026-04',
      videoCount: 60,
      workflowRunCount: 12,
      totalCostFen: 50_000,
      costCapFen: 50_000,
      videoCapCount: 60,
      allowed: false,
      reason: 'cost_cap_exceeded' as const,
    };
    const err = new SpendCapError(snapshot);
    expect(err.snapshot).toBe(snapshot);
    expect(err.snapshot.reason).toBe('cost_cap_exceeded');
  });

  it('formats a stable message including the cap dimensions', () => {
    const snapshot = {
      monthKey: '2026-04',
      videoCount: 30,
      workflowRunCount: 7,
      totalCostFen: 12_345,
      costCapFen: 50_000,
      videoCapCount: 60,
      allowed: false,
      reason: 'video_cap_exceeded' as const,
    };
    const err = new SpendCapError(snapshot);
    expect(err.message).toContain('video_cap_exceeded');
    expect(err.message).toContain('12345/50000');
    expect(err.message).toContain('30/60');
  });

  it('error name is SpendCapError so instanceof checks survive bundlers', () => {
    const err = new SpendCapError({
      monthKey: '2026-04', videoCount: 0, workflowRunCount: 0,
      totalCostFen: 0, costCapFen: 1, videoCapCount: 1,
      allowed: false, reason: 'cost_cap_exceeded',
    });
    expect(err.name).toBe('SpendCapError');
    expect(err instanceof SpendCapError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
