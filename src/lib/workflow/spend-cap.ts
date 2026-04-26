// W1-07-V3 — Monthly spend + video-count cap framework.
//
// Each user has two caps that gate workflow execution:
//   1. monthly cost cap (分): defends gross margin (D23 ARPU ¥1000 × 50% margin → ¥500/mo)
//   2. monthly video count cap: defends Seedance burn (D23 = 60 clips/mo @ ¥6 = ¥360)
//
// Reads from monthly_usage table (populated atomically by Orchestrator).
// Caps configurable via env so internal-test users can be widened safely.
//
// Used by Orchestrator BEFORE node execution. Heavy nodes (VideoGenNodeRunner
// in W2) call `assertCapAllowsVideos(n)` before each clip to halt mid-run.

import { and, eq } from 'drizzle-orm';
import { db, monthlyUsage } from '@/db';

// ─── Tunables ─────────────────────────────────────────────────────────────────

function monthlyCostCapFen(): number {
  // D23 baseline: ¥500/month gross-margin ceiling.
  const cny = Number(process.env.WORKFLOW_MONTHLY_COST_CAP_CNY ?? 500);
  return Math.round(cny * 100);
}

function monthlyVideoCapCount(): number {
  // D23: 60 clips × ¥6 = ¥360 baseline.
  return Number(process.env.WORKFLOW_MONTHLY_VIDEO_CAP_COUNT ?? 60);
}

function currentMonthKey(): string {
  // YYYY-MM in UTC. Matches Orchestrator.bumpMonthlyUsage to keep the same row.
  return new Date().toISOString().slice(0, 7);
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type SpendCapReason =
  | 'cost_cap_exceeded'
  | 'video_cap_exceeded';

export interface MonthlyUsageSnapshot {
  monthKey:           string;
  videoCount:         number;
  workflowRunCount:   number;
  totalCostFen:       number;
  costCapFen:         number;
  videoCapCount:      number;
}

export interface SpendCheckResult extends MonthlyUsageSnapshot {
  allowed: boolean;
  reason?: SpendCapReason;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read this user's current monthly aggregate. Returns zero-row snapshot if
 * the user hasn't run anything this month.
 */
export async function readMonthlyUsage(
  tenantId: string,
  userId: string,
): Promise<MonthlyUsageSnapshot> {
  const monthKey = currentMonthKey();
  const [row] = await db
    .select()
    .from(monthlyUsage)
    .where(
      and(
        eq(monthlyUsage.tenantId, tenantId),
        eq(monthlyUsage.userId, userId),
        eq(monthlyUsage.monthKey, monthKey),
      ),
    )
    .limit(1);

  return {
    monthKey,
    videoCount:        row?.videoCount        ?? 0,
    workflowRunCount:  row?.workflowRunCount  ?? 0,
    totalCostFen:      row?.totalCostFen      ?? 0,
    costCapFen:        monthlyCostCapFen(),
    videoCapCount:     monthlyVideoCapCount(),
  };
}

/**
 * Cheap "is this user already over the limit?" check.
 * Called by the Orchestrator BEFORE the run starts (zero new spend assumed).
 */
export async function checkMonthlyCap(
  tenantId: string,
  userId: string,
): Promise<SpendCheckResult> {
  return projectedCapCheck(tenantId, userId, { addCostFen: 0, addVideos: 0 });
}

/**
 * Will the user exceed any cap if we add `addCostFen` cost and `addVideos`
 * video clips? Use before EVERY heavy operation (Seedance call etc.) so the
 * run halts mid-stream rather than discovering the violation post-hoc.
 */
export async function projectedCapCheck(
  tenantId: string,
  userId: string,
  delta: { addCostFen: number; addVideos: number },
): Promise<SpendCheckResult> {
  const snap = await readMonthlyUsage(tenantId, userId);
  const projectedCost   = snap.totalCostFen + delta.addCostFen;
  const projectedVideos = snap.videoCount   + delta.addVideos;

  if (projectedCost > snap.costCapFen) {
    return { ...snap, allowed: false, reason: 'cost_cap_exceeded' };
  }
  if (projectedVideos > snap.videoCapCount) {
    return { ...snap, allowed: false, reason: 'video_cap_exceeded' };
  }
  return { ...snap, allowed: true };
}

/**
 * Throwing variant for use inside NodeRunner.execute() — saves the caller from
 * branching on `.allowed` every time.
 */
export async function assertCapAllows(
  tenantId: string,
  userId: string,
  delta: { addCostFen: number; addVideos: number },
): Promise<void> {
  const r = await projectedCapCheck(tenantId, userId, delta);
  if (!r.allowed) {
    throw new SpendCapError(r);
  }
}

export class SpendCapError extends Error {
  constructor(public snapshot: SpendCheckResult) {
    super(
      `Monthly cap exceeded: ${snapshot.reason} ` +
      `(cost ${snapshot.totalCostFen}/${snapshot.costCapFen} fen, ` +
      `videos ${snapshot.videoCount}/${snapshot.videoCapCount})`,
    );
    this.name = 'SpendCapError';
  }
}
