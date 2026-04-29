// W2-07c UX fix — clean state hand-off between chained worker invocations.
//
// The video node throws a NodeError carrying `VIDEO_CONTINUE_REQUIRED` in
// its message when it has rendered its per-invocation chunk and needs
// another worker run to keep going. From the system's POV this is NOT a
// failure — it's a mid-flight checkpoint hand-off.
//
// Without special handling, both NodeRunner and Orchestrator catch the
// throw and write `status='failed'` to workflow_steps and workflow_runs.
// SSE picks that up and pushes `failed` to the user's browser → red ❌
// error banner + red node card → user thinks the run died and either
// panics or hits "重试" unnecessarily.
//
// The fix is a marker convention. Any layer that catches a NodeError
// asks `isContinuationMarker(err)` and, when true:
//   - writes `pending` (not `failed`)
//   - clears errorMsg + completedAt
//   - skips analytics + monthly-usage bumps
// SSE then sees `pending` → grey "等待中" chip → no flicker.
//
// Why `pending`, not `running`?
//   The next worker invocation's CAS lock gate (in /api/workflow/run)
//   only acquires when status ∈ ('pending', 'failed'). If we wrote
//   `running` the next QStash continuation message would silently drop
//   and break the chain entirely.
//
// `resetRunForContinuation` is a defensive fallback used by the worker
// route in case the NodeRunner / Orchestrator layers above didn't
// already write pending. Keeping it minimizes the impact of any
// future drift in either of those layers.

import { and, eq } from 'drizzle-orm';

import { db, workflowRuns, workflowSteps } from '@/db';
import { NodeError, type NodeType } from './types';

/** String constant duplicated from `nodes/video.ts` to avoid a circular import. */
export const VIDEO_CONTINUE_REQUIRED_MARKER = 'VIDEO_CONTINUE_REQUIRED';

// Returns plain `boolean` (not a type predicate) on purpose — `ne` is
// already typed as `NodeError` at the only call sites, so a predicate
// would incorrectly narrow `ne` to `never` in the else branch.
export function isContinuationMarker(err: unknown): boolean {
  if (!(err instanceof NodeError)) return false;
  return typeof err.message === 'string' && err.message.includes(VIDEO_CONTINUE_REQUIRED_MARKER);
}

export function isContinuationErrorMessage(msg: string | null | undefined): boolean {
  return typeof msg === 'string' && msg.includes(VIDEO_CONTINUE_REQUIRED_MARKER);
}

export async function resetRunForContinuation(
  runId: string,
  failedNodeType: NodeType,
): Promise<void> {
  await db
    .update(workflowRuns)
    .set({ status: 'pending', errorMsg: null, completedAt: null })
    .where(eq(workflowRuns.id, runId));

  await db
    .update(workflowSteps)
    .set({ status: 'pending', errorMsg: null, completedAt: null })
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.nodeType, failedNodeType),
      ),
    );
}
