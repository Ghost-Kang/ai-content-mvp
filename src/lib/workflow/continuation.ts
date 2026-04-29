// W2-07c UX fix — clean state hand-off between chained worker invocations.
//
// The video node throws `VIDEO_CONTINUE_REQUIRED` when it has rendered
// its per-invocation chunk and needs another worker run to keep going.
// At the moment that throws, the orchestrator has already written:
//   - workflow_runs.status     = 'failed' + errorMsg = 'video: PROVIDER_FAILED VIDEO_CONTINUE_REQUIRED ...'
//   - workflow_steps[video].status = 'failed' + errorMsg = same
//
// The worker route catches the marker, enqueues the next QStash message,
// and returns 200. But there's a 1–5s gap until QStash delivers the next
// message. During that gap the SSE stream is happily pushing the `failed`
// state to the user's browser → red error banner + red node card →
// user thinks the run died and either panics or hits "重试".
//
// Two-axis fix:
//   1. UX: state during the gap should NOT be `failed` (it's not failed,
//      it's mid-continuation).
//   2. Lock contract: worker route's CAS gate only acquires lock when
//      status ∈ ('pending', 'failed'). If we reset to `running`, the
//      next continuation message lands, hits CAS, finds status='running',
//      treats lock as held by a phantom worker, and silently drops.
//      This would BREAK the chain.
//
// Both axes resolved by resetting to `pending`:
//   - SSE pushes `pending` → grey calm chip, not red ❌
//   - CAS gate accepts `pending`, lock acquisition succeeds for next
//     invocation
//
// Step row reset: same reasoning; we also clear errorMsg so the friendly
// error banner doesn't show a "VIDEO_CONTINUE_REQUIRED" surface to the user.
// completedAt cleared so node-runner's startedAt math doesn't show a
// nonsensical "took 0s" on the next invocation.

import { and, eq } from 'drizzle-orm';

import { db, workflowRuns, workflowSteps } from '@/db';
import type { NodeType } from './types';

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
