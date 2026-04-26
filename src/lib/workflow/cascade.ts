// W3-06 — Workflow cascade engine.
//
// When a node is edited / retried / skipped, every persisted step downstream
// of it becomes potentially stale. We mark those rows `dirty` so:
//   • the UI shows them as 「需重跑」(orange badge)
//   • the orchestrator re-executes them on the next dispatch (resume mode)
//   • the user knows their previous outputs no longer reflect the new upstream
//
// Cascade is computed by stepIndex (the canonical 5-node ordering). No DAG
// traversal needed — the workflow is strictly linear in v3 MVP-1.
//
// Status transitions (downstream rows only — the source row is handled by
// the calling mutation):
//
//   done     → dirty   ← needs rerun against the new upstream
//   skipped  → dirty   ← user previously chose to skip; revisit
//   failed   → dirty   ← previous failure is no longer authoritative
//   pending  → pending ← still queued, no change
//   running  → running ← we never cascade against an active run (caller guards)
//   dirty    → dirty   ← idempotent
//
// All writes are scoped to (runId, tenantId) so a tenant cannot mutate
// another tenant's steps even if they fabricate a runId.

import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { db, workflowSteps, workflowRuns } from '@/db';
import type { NodeType, StepStatus } from './types';
// Pure rules (client-safe) live in ./cascade-rules so 'use client' bundles
// don't pull in drizzle/db. Re-exported below for back-compat.
import { stepIndexOf } from './cascade-rules';

export {
  evaluateStepAction,
  stepIndexOf,
  EDITABLE_NODES,
  EDITABLE_STEP_STATUSES,
  RETRYABLE_STEP_STATUSES,
  SKIPPABLE_STEP_STATUSES,
  type CascadeAction,
  type StepActionGuardInput,
  type StepActionGuardResult,
} from './cascade-rules';

/**
 * Marks every step in `runId` whose `step_index` > the given anchor's
 * step_index AND whose status is one of {done, skipped, failed} as `dirty`.
 *
 * Returns the count of rows actually mutated (useful for tests + analytics).
 *
 * Tenant-scoped: callers MUST pass the authenticated tenantId so a forged
 * runId cannot bleed across tenants.
 */
export async function markDownstreamDirty(
  runId:    string,
  tenantId: string,
  anchorStepIndex: number,
): Promise<number> {
  const updated = await db
    .update(workflowSteps)
    .set({
      status:    'dirty' satisfies StepStatus,
      // NB: we deliberately don't reset outputJson / costFen here — the row
      // keeps its last-known good output until the resume actually overwrites
      // it. This means the UI can still preview the stale output if curious
      // and we don't lose data on accidental cascades.
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.tenantId, tenantId),
        gt(workflowSteps.stepIndex, anchorStepIndex),
        inArray(workflowSteps.status, ['done', 'skipped', 'failed']),
      ),
    )
    .returning({ id: workflowSteps.id });

  return updated.length;
}

/**
 * Resets the run-level fields that no longer apply once we're about to
 * resume. We DON'T zero totalCostFen / totalVideoCount — the orchestrator
 * recomputes those from the surviving (done) step rows on the next run.
 *
 * Caller is expected to dispatch immediately after — between this call and
 * dispatch, the run sits in a `pending` state visible to the canvas poller
 * (which renders it as "待启动 — 准备重跑").
 */
export async function resetRunForResume(
  runId:    string,
  tenantId: string,
): Promise<void> {
  await db
    .update(workflowRuns)
    .set({
      status:      'pending',
      errorMsg:    null,
      // Preserve startedAt so the UI shows the original start time. Reset
      // completedAt so the canvas knows we're not done yet. Cost/count are
      // recomputed from steps on next orchestrator pass.
      completedAt: null,
      updatedAt:   new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.tenantId, tenantId),
      ),
    );
}

/**
 * Convenience: rewrites a single step's status + outputJson AND cascades
 * downstream `dirty` markers AND resets run for resume — all in the
 * order the mutations need. Returns the number of downstream rows
 * cascaded (useful for analytics / test assertions).
 *
 * Concurrency: not transactional — between the step write and the cascade,
 * another worker could theoretically read mid-state. We accept this for
 * MVP-1 because:
 *   1. The run is guaranteed `!= running` (caller checks) so no orchestrator
 *      is reading these rows
 *   2. The CAS lock in the worker route prevents double-dispatch
 *   3. Even if we hit the rare interleaving, the worst case is "the canvas
 *      shows pending instead of dirty for ~50ms" — purely cosmetic
 */
export async function applyStepEdit(args: {
  runId:      string;
  tenantId:   string;
  nodeType:   NodeType;
  outputJson: unknown;
}): Promise<{ cascadedCount: number }> {
  const idx = stepIndexOf(args.nodeType);

  // Update the step itself — keep status `done` (the user explicitly accepted
  // their edit) but bump updatedAt so the UI shows the new timestamp.
  await db
    .update(workflowSteps)
    .set({
      outputJson: args.outputJson as object,
      // Clear any stale error from the previous failure path
      errorMsg:   null,
      updatedAt:  new Date(),
    })
    .where(
      and(
        eq(workflowSteps.runId, args.runId),
        eq(workflowSteps.tenantId, args.tenantId),
        eq(workflowSteps.nodeType, args.nodeType),
      ),
    );

  const cascadedCount = await markDownstreamDirty(args.runId, args.tenantId, idx);
  await resetRunForResume(args.runId, args.tenantId);
  return { cascadedCount };
}

/**
 * Marks a step as `pending` so the orchestrator re-executes it on next
 * dispatch (resume mode). Cascades downstream + resets run.
 */
export async function applyStepRetry(args: {
  runId:    string;
  tenantId: string;
  nodeType: NodeType;
}): Promise<{ cascadedCount: number }> {
  const idx = stepIndexOf(args.nodeType);

  await db
    .update(workflowSteps)
    .set({
      status:    'pending' satisfies StepStatus,
      errorMsg:  null,
      // NB: keep retryCount intact — the NodeRunner increments it again
      // on the next attempt, and we want the cumulative history visible.
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowSteps.runId, args.runId),
        eq(workflowSteps.tenantId, args.tenantId),
        eq(workflowSteps.nodeType, args.nodeType),
      ),
    );

  const cascadedCount = await markDownstreamDirty(args.runId, args.tenantId, idx);
  await resetRunForResume(args.runId, args.tenantId);
  return { cascadedCount };
}

/**
 * Marks a step as `skipped`. The orchestrator's resume mode treats `skipped`
 * exactly like `done` (skip + don't hydrate upstream — downstream nodes
 * must tolerate missing input via NodeRunner.buildInput defaults, OR they'll
 * fail with UPSTREAM_MISSING which the user will see and learn from).
 *
 * For MVP-1 we ONLY allow skipping `export` (it has no downstream). Skipping
 * `video` would leave `export` unable to bundle clips; skipping `storyboard`
 * would break `video` etc. The mutation enforces this.
 */
export async function applyStepSkip(args: {
  runId:    string;
  tenantId: string;
  nodeType: NodeType;
}): Promise<{ cascadedCount: number }> {
  const idx = stepIndexOf(args.nodeType);

  await db
    .update(workflowSteps)
    .set({
      status:    'skipped' satisfies StepStatus,
      errorMsg:  null,
      // We don't bump completedAt — the step was never legitimately done
      // and the UI uses null/non-null on completedAt to decide "render the
      // body summary" vs. "render the empty state".
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowSteps.runId, args.runId),
        eq(workflowSteps.tenantId, args.tenantId),
        eq(workflowSteps.nodeType, args.nodeType),
      ),
    );

  // Skip still cascades downstream — those nodes might need to reconsider
  // (e.g. export bundling logic might want to fall back to JSON-only if the
  // video node is skipped).
  const cascadedCount = await markDownstreamDirty(args.runId, args.tenantId, idx);
  await resetRunForResume(args.runId, args.tenantId);
  return { cascadedCount };
}

// ─── Sanity helper for tests ──────────────────────────────────────────────────

/** Counts of step rows by status, ordered by stepIndex. Test convenience. */
export async function snapshotRunSteps(
  runId:    string,
  tenantId: string,
): Promise<ReadonlyArray<{ nodeType: NodeType; stepIndex: number; status: StepStatus }>> {
  const rows = await db
    .select({
      nodeType:  workflowSteps.nodeType,
      stepIndex: workflowSteps.stepIndex,
      status:    workflowSteps.status,
    })
    .from(workflowSteps)
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.tenantId, tenantId),
      ),
    )
    .orderBy(sql`${workflowSteps.stepIndex} ASC`);

  return rows as ReadonlyArray<{ nodeType: NodeType; stepIndex: number; status: StepStatus }>;
}
