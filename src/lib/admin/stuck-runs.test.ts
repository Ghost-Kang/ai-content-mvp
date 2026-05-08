import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @/db so the lib can run without a live Postgres. Each test seeds
// the SELECT result rows; the apply path's UPDATE chain returns the rows
// it "wrote" so fix counters can be asserted.
const executeRows: Record<string, Array<Record<string, unknown>>> = {
  steps:   [],
  runs:    [],
  ghosts:  [],
  corrupt: [],
};
const updateCalls: Array<{ table: string; id: string }> = [];

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  eq:  vi.fn((field: unknown, value: unknown) => ({ field, value })),
  sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
    raw: (s: string) => s,
  }),
}));

vi.mock('@/db', () => ({
  workflowRuns:  { id: 'workflow_runs.id', status: 'workflow_runs.status' },
  workflowSteps: { id: 'workflow_steps.id', status: 'workflow_steps.status' },
  db: {
    execute: vi.fn(async (q: string) => {
      // Match by structural cues in the SQL string. Order-sensitive so
      // step query (mentions 'workflow_steps' AND status='running') is
      // checked before corrupt query (mentions 'completed_at <').
      const text = String(q);
      if (text.includes('completed_at IS NOT NULL') && text.includes('completed_at < started_at')) {
        return executeRows.corrupt;
      }
      if (text.includes('NOT EXISTS') && text.includes('workflow_steps')) {
        return executeRows.ghosts;
      }
      if (text.includes('workflow_steps') && text.includes("status = 'running'")) {
        return executeRows.steps;
      }
      if (text.includes('workflow_runs') && text.includes("status = 'running'")) {
        return executeRows.runs;
      }
      return [];
    }),
    update: vi.fn((table: { id: string }) => ({
      set: vi.fn(() => ({
        where: vi.fn((clause: { args?: unknown[] }) => {
          // Pull the eq(id, value) pair out of the and() args so we can
          // record which row was "updated" without a real DB.
          const args = clause.args ?? [];
          const idClause = args.find((a) => {
            const obj = a as { field?: unknown };
            return typeof obj?.field === 'string' && (obj.field === 'workflow_runs.id' || obj.field === 'workflow_steps.id');
          }) as { field?: string; value?: string } | undefined;
          const id = idClause?.value ?? 'unknown';
          updateCalls.push({ table: table.id, id });
          return {
            returning: vi.fn(async () => [{ id }]),
          };
        }),
      })),
    })),
  },
}));

import { detectAndRecover } from './stuck-runs';

describe('detectAndRecover', () => {
  beforeEach(() => {
    executeRows.steps   = [];
    executeRows.runs    = [];
    executeRows.ghosts  = [];
    executeRows.corrupt = [];
    updateCalls.length  = 0;
  });

  it('reports each finding kind in dry-run without writing', async () => {
    executeRows.steps = [{
      run_id: 'r1', step_id: 's1', node_type: 'storyboard',
      started_at: '2026-05-08T09:38:26Z', age_min: '170',
    }];
    executeRows.runs = [{
      run_id: 'r1', started_at: '2026-05-08T09:36:34Z', age_min: '172',
    }];
    executeRows.ghosts = [{
      run_id: 'r-ghost', created_at: '2026-05-08T09:36:34Z', age_min: '176',
    }];
    executeRows.corrupt = [{
      run_id: 'r1', step_id: 's1', node_type: 'storyboard',
      started_at: '2026-05-08T09:38:26Z', completed_at: '2026-05-08T09:33:21Z',
    }];

    const result = await detectAndRecover({ apply: false });

    expect(result.apply).toBe(false);
    expect(result.findings.map((f) => f.kind).sort()).toEqual([
      'corrupt-step', 'ghost-run', 'run-stuck', 'step-stuck',
    ]);
    expect(updateCalls).toHaveLength(0);
    expect(result.fixes).toEqual([]);
  });

  it('on --apply, flips stuck steps + stuck runs + ghost runs but never corrupts', async () => {
    executeRows.steps = [
      { run_id: 'r1', step_id: 's1', node_type: 'storyboard', started_at: 't', age_min: '170' },
      { run_id: 'r2', step_id: 's2', node_type: 'video',       started_at: 't', age_min: '195' },
    ];
    executeRows.runs = [
      { run_id: 'r1', started_at: 't', age_min: '172' },
    ];
    executeRows.ghosts = [
      { run_id: 'r-ghost', created_at: 't', age_min: '176' },
    ];
    executeRows.corrupt = [
      { run_id: 'r1', step_id: 's1', node_type: 'storyboard', started_at: 't', completed_at: 't-prev' },
    ];

    const result = await detectAndRecover({ apply: true });

    // 2 step flips + 2 run/ghost flips = 4 UPDATE calls. Corrupt never writes.
    expect(updateCalls.filter((c) => c.table === 'workflow_steps.id').map((c) => c.id))
      .toEqual(['s1', 's2']);
    expect(updateCalls.filter((c) => c.table === 'workflow_runs.id').map((c) => c.id))
      .toEqual(['r1', 'r-ghost']);
    expect(result.fixes).toEqual([
      'flipped 2 stuck steps → failed',
      'flipped 2 stuck/ghost runs → failed',
    ]);
  });

  it('clean state: no findings, no fixes, no writes even with --apply', async () => {
    const result = await detectAndRecover({ apply: true });

    expect(result.findings).toEqual([]);
    expect(result.fixes).toEqual([]);
    expect(updateCalls).toEqual([]);
  });
});
