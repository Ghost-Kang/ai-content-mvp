// W2-07b — Pure helpers used by the SSE route.
//
// Extracted into its own module so we can integration-test the snapshot
// loader and serialize() change-detection logic without faking the
// Clerk/Next request lifecycle.

import { and, eq } from 'drizzle-orm';
import { db, workflowRuns, workflowSteps } from '@/db';

export interface Snapshot {
  run: {
    id:               string;
    topic:            string;
    status:           string;
    totalCostFen:     number;
    totalVideoCount:  number;
    errorMsg:         string | null;
    createdAt:        Date | string;
    startedAt:        Date | string | null;
    completedAt:      Date | string | null;
    updatedAt:        Date | string;
  };
  steps: ReadonlyArray<{
    id:          string;
    nodeType:    string;
    stepIndex:   number;
    status:      string;
    outputJson:  unknown;
    costFen:     number;
    retryCount:  number;
    errorMsg:    string | null;
    startedAt:   Date | string | null;
    completedAt: Date | string | null;
  }>;
}

/**
 * Read a workflow run + its steps, scoped to a tenant.
 * Returns null when the run doesn't exist OR doesn't belong to the tenant
 * (don't differentiate — leak-resistant for the SSE 404 path).
 */
export async function loadSnapshot(runId: string, tenantId: string): Promise<Snapshot | null> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.tenantId, tenantId)))
    .limit(1);
  if (!run) return null;

  const steps = await db
    .select()
    .from(workflowSteps)
    .where(and(eq(workflowSteps.runId, runId), eq(workflowSteps.tenantId, tenantId)))
    .orderBy(workflowSteps.stepIndex);

  return {
    run: {
      id:              run.id,
      topic:           run.topic,
      status:          run.status,
      totalCostFen:    run.totalCostFen,
      totalVideoCount: run.totalVideoCount,
      errorMsg:        run.errorMsg,
      createdAt:       run.createdAt,
      startedAt:       run.startedAt,
      completedAt:     run.completedAt,
      updatedAt:       run.updatedAt,
    },
    steps: steps.map((s) => ({
      id:          s.id,
      nodeType:    s.nodeType,
      stepIndex:   s.stepIndex,
      status:      s.status,
      outputJson:  s.outputJson,
      costFen:     s.costFen,
      retryCount:  s.retryCount,
      errorMsg:    s.errorMsg,
      startedAt:   s.startedAt,
      completedAt: s.completedAt,
    })),
  };
}

/**
 * SSE wire format. Each event must end with `\n\n` to flush a single message.
 * We always JSON.stringify the payload, so we never produce intra-record
 * newlines that would require multi-line `data:` framing.
 */
export function formatEvent(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Stable string key used to detect "did anything change since last tick".
 *
 * Intentionally excludes `updatedAt` — every UPDATE bumps that column even
 * when the content is identical (e.g. CAS retry that no-ops). We want true
 * content-level change detection so we don't waste bandwidth pushing empty
 * snapshots every second.
 */
export function serializeSnapshot(snap: Snapshot): string {
  return JSON.stringify({
    runStatus:       snap.run.status,
    runError:        snap.run.errorMsg,
    runCost:         snap.run.totalCostFen,
    runVideoCount:   snap.run.totalVideoCount,
    runCompletedAt:  snap.run.completedAt,
    steps: snap.steps.map((s) => ({
      n:    s.nodeType,
      s:    s.status,
      c:    s.costFen,
      r:    s.retryCount,
      e:    s.errorMsg,
      o:    s.outputJson,
      done: s.completedAt,
    })),
  });
}
