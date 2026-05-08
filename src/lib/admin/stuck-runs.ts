// Shared detection + recovery logic for stuck workflow_runs and
// workflow_steps. Used by:
//   - scripts/recover-stuck-runs.ts  (manual / local)
//   - api/admin/watchdog/route.ts    (Vercel Cron)
//
// Detection windows (keep in sync with scripts/recover-stuck-runs.ts):
//   - step stuck         : status='running' for > 12 minutes
//   - run stuck (zombie) : status='running' for > 45 minutes
//   - ghost run          : status='running', 0 workflow_steps, age > 5 min
//   - data-corrupt step  : completed_at < started_at  (alert only)
//
// All windows chosen so a normal long video run with QStash continuation
// chain (max 17 frames × 3 invocations × ~90s) won't trip a false positive.

import { and, eq, sql } from 'drizzle-orm';
import { db, workflowRuns, workflowSteps } from '@/db';

export const STEP_STUCK_MINUTES = 12;
export const RUN_STUCK_MINUTES  = 45;
export const GHOST_RUN_MINUTES  = 5;

export interface StuckStep {
  kind:      'step-stuck';
  runId:     string;
  stepId:    string;
  nodeType:  string;
  startedAt: string;
  ageMin:    number;
}
export interface StuckRun {
  kind:      'run-stuck';
  runId:     string;
  startedAt: string;
  ageMin:    number;
}
export interface GhostRun {
  kind:      'ghost-run';
  runId:     string;
  createdAt: string;
  ageMin:    number;
}
export interface CorruptStep {
  kind:        'corrupt-step';
  runId:       string;
  stepId:      string;
  nodeType:    string;
  startedAt:   string;
  completedAt: string;
}
export type Finding = StuckStep | StuckRun | GhostRun | CorruptStep;

export interface WatchdogResult {
  ts:       string;
  apply:    boolean;
  findings: Finding[];
  fixes:    string[];
}

export async function detectAndRecover(opts: { apply: boolean }): Promise<WatchdogResult> {
  const findings: Finding[] = [];
  const fixes: string[] = [];

  // 1) steps stuck in running > threshold
  const stuckStepRows = await db.execute(sql`
    SELECT
      run_id::text       AS run_id,
      id::text           AS step_id,
      node_type::text    AS node_type,
      started_at::text   AS started_at,
      EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 AS age_min
    FROM workflow_steps
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < NOW() - (${STEP_STUCK_MINUTES} * INTERVAL '1 minute')
  `);
  for (const r of stuckStepRows as Array<Record<string, unknown>>) {
    findings.push({
      kind:      'step-stuck',
      runId:     String(r.run_id),
      stepId:    String(r.step_id),
      nodeType:  String(r.node_type),
      startedAt: String(r.started_at),
      ageMin:    Math.round(Number(r.age_min)),
    });
  }

  // 2) runs stuck in running > threshold
  const stuckRunRows = await db.execute(sql`
    SELECT
      id::text                                                  AS run_id,
      COALESCE(started_at, created_at)::text                    AS started_at,
      EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at))) / 60
                                                                AS age_min
    FROM workflow_runs
    WHERE status = 'running'
      AND COALESCE(started_at, created_at) < NOW() - (${RUN_STUCK_MINUTES} * INTERVAL '1 minute')
  `);
  for (const r of stuckRunRows as Array<Record<string, unknown>>) {
    findings.push({
      kind:      'run-stuck',
      runId:     String(r.run_id),
      startedAt: String(r.started_at),
      ageMin:    Math.round(Number(r.age_min)),
    });
  }

  // 3) ghost runs — running > 5min but no steps inserted
  const ghostRunRows = await db.execute(sql`
    SELECT
      r.id::text                                          AS run_id,
      r.created_at::text                                  AS created_at,
      EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 60     AS age_min
    FROM workflow_runs r
    WHERE r.status = 'running'
      AND r.created_at < NOW() - (${GHOST_RUN_MINUTES} * INTERVAL '1 minute')
      AND NOT EXISTS (SELECT 1 FROM workflow_steps s WHERE s.run_id = r.id)
  `);
  for (const r of ghostRunRows as Array<Record<string, unknown>>) {
    findings.push({
      kind:      'ghost-run',
      runId:     String(r.run_id),
      createdAt: String(r.created_at),
      ageMin:    Math.round(Number(r.age_min)),
    });
  }

  // 4) corrupt steps — alert only
  const corruptRows = await db.execute(sql`
    SELECT
      run_id::text          AS run_id,
      id::text              AS step_id,
      node_type::text       AS node_type,
      started_at::text      AS started_at,
      completed_at::text    AS completed_at
    FROM workflow_steps
    WHERE completed_at IS NOT NULL
      AND started_at IS NOT NULL
      AND completed_at < started_at
  `);
  for (const r of corruptRows as Array<Record<string, unknown>>) {
    findings.push({
      kind:        'corrupt-step',
      runId:       String(r.run_id),
      stepId:      String(r.step_id),
      nodeType:    String(r.node_type),
      startedAt:   String(r.started_at),
      completedAt: String(r.completed_at),
    });
  }

  // ─── Apply (write path) ────────────────────────────────────────────────────
  if (opts.apply) {
    const stepErr = `WATCHDOG_TIMEOUT: step stuck > ${STEP_STUCK_MINUTES}min — likely Vercel maxDuration kill or worker crash`;
    const runErr  = `WATCHDOG_TIMEOUT: run stuck > ${RUN_STUCK_MINUTES}min — likely Vercel maxDuration kill or worker crash`;

    let stepFlips = 0;
    for (const f of findings) {
      if (f.kind !== 'step-stuck') continue;
      const updated = await db
        .update(workflowSteps)
        .set({
          status:      'failed',
          errorMsg:    stepErr,
          completedAt: new Date(),
          updatedAt:   new Date(),
        })
        .where(
          and(
            eq(workflowSteps.id, f.stepId),
            eq(workflowSteps.status, 'running'),
          ),
        )
        .returning({ id: workflowSteps.id });
      stepFlips += updated.length;
    }
    if (stepFlips > 0) fixes.push(`flipped ${stepFlips} stuck steps → failed`);

    let runFlips = 0;
    for (const f of findings) {
      if (f.kind !== 'run-stuck' && f.kind !== 'ghost-run') continue;
      const updated = await db
        .update(workflowRuns)
        .set({
          status:      'failed',
          errorMsg:    runErr,
          completedAt: new Date(),
          updatedAt:   new Date(),
        })
        .where(
          and(
            eq(workflowRuns.id, f.runId),
            eq(workflowRuns.status, 'running'),
          ),
        )
        .returning({ id: workflowRuns.id });
      runFlips += updated.length;
    }
    if (runFlips > 0) fixes.push(`flipped ${runFlips} stuck/ghost runs → failed`);
  }

  return {
    ts:    new Date().toISOString(),
    apply: opts.apply,
    findings,
    fixes,
  };
}
