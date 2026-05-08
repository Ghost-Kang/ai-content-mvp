// W3-06 — Cascade rules (pure, client-safe).
//
// Lives separately from `cascade.ts` because the latter imports `db` and
// drizzle at module top — that's server-only. Pulling either into a
// 'use client' component bundle blows up the Next.js build.
//
// This module contains ONLY the deterministic predicate logic. It's
// imported by:
//   • the server tRPC router (workflow.ts) — to enforce permissions
//   • the client NodeActionBar           — to decide which buttons to render
//
// Both call sites use the SAME function, so the UI never offers an action
// the server would reject. The `cascade.ts` server module re-exports these
// for back-compat with code that imported them via `@/lib/workflow/cascade`.

import type { NodeType, StepStatus } from './types';

export const EDITABLE_NODES: ReadonlySet<NodeType> = new Set(['script', 'storyboard']);

export const RETRYABLE_STEP_STATUSES: ReadonlySet<StepStatus> = new Set([
  'failed',
  'dirty',
]);

export const SKIPPABLE_STEP_STATUSES: ReadonlySet<StepStatus> = new Set([
  'failed',
  'dirty',
]);

/**
 * Edit is the only action allowed on a `done` step (you're saying "I want
 * to keep this position in the pipeline, but with different content"). On
 * `dirty` / `failed` we steer the user to retry first — editing a known-
 * broken output is rarely what they want, and complicates the cascade
 * accounting (we'd need to clear errorMsg, etc).
 */
export const EDITABLE_STEP_STATUSES: ReadonlySet<StepStatus> = new Set([
  'done',
]);

export type CascadeAction = 'edit' | 'retry' | 'skip';

export interface StepActionGuardInput {
  nodeType:   NodeType;
  stepStatus: StepStatus;
  runStatus:  'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  action:     CascadeAction;
}

export interface StepActionGuardResult {
  allowed: boolean;
  /** Stable code so the client can localize / branch UI. */
  reason?:
    | 'RUN_RUNNING'
    | 'NODE_NOT_EDITABLE'
    | 'STATUS_NOT_EDITABLE'
    | 'STATUS_NOT_RETRYABLE'
    | 'STATUS_NOT_SKIPPABLE';
}

/**
 * Pure validator. Does NOT touch the DB — call BEFORE issuing any write.
 * Used by the tRPC mutation (server source-of-truth) AND by NodeCard UI
 * (to grey out / hide buttons preemptively).
 */
export function evaluateStepAction(input: StepActionGuardInput): StepActionGuardResult {
  if (input.runStatus === 'running') {
    return { allowed: false, reason: 'RUN_RUNNING' };
  }

  switch (input.action) {
    case 'edit':
      if (!EDITABLE_NODES.has(input.nodeType)) {
        return { allowed: false, reason: 'NODE_NOT_EDITABLE' };
      }
      if (!EDITABLE_STEP_STATUSES.has(input.stepStatus)) {
        return { allowed: false, reason: 'STATUS_NOT_EDITABLE' };
      }
      return { allowed: true };

    case 'retry':
      if (!RETRYABLE_STEP_STATUSES.has(input.stepStatus)) {
        return { allowed: false, reason: 'STATUS_NOT_RETRYABLE' };
      }
      return { allowed: true };

    case 'skip':
      if (!SKIPPABLE_STEP_STATUSES.has(input.stepStatus)) {
        return { allowed: false, reason: 'STATUS_NOT_SKIPPABLE' };
      }
      return { allowed: true };
  }
}

// ─── stepIndex lookup ─────────────────────────────────────────────────────────
// Hard-coded mirror of the orchestrator's NodeDescriptor.stepIndex so the
// cascade engine doesn't depend on instantiating NodeRunners.

const NODE_STEP_INDEX: Record<NodeType, number> = {
  topic:      0,
  script:     1,
  storyboard: 2,
  video:      3,
  export:     4,
};

export function stepIndexOf(nodeType: NodeType): number {
  return NODE_STEP_INDEX[nodeType];
}

// ─── Checkpoint nodes ─────────────────────────────────────────────────────────
// Nodes whose runner reads `workflow_steps.outputJson` as a *resume seed*
// before overwriting it. For these, `markDownstreamDirty` must clear
// outputJson + costFen alongside the dirty flag — otherwise an upstream edit
// cascades status='dirty' but the runner short-circuits to "already done"
// using the stale prior output and silently re-uses old frames / outputs.
//
// Currently only `video` (see lib/workflow/nodes/video.ts:loadCheckpoint —
// it returns existing frames straight from outputJson and `pendingFrames`
// filters them out, so a non-empty checkpoint = "skip rendering"). Other
// nodes (script / storyboard / export) overwrite outputJson unconditionally
// on every execution, so leaving prior values is harmless and even useful
// (UI can still preview the stale output between cascade and re-run).
//
// ANY future runner that calls `loadCheckpoint`-style logic against its
// own outputJson MUST be added here, or upstream edits will be silently
// invisible at that stage.
export const CHECKPOINT_NODES: ReadonlySet<NodeType> = new Set(['video']);

export function shouldClearCheckpointOnCascade(
  nodeType:        NodeType,
  anchorStepIndex: number,
): boolean {
  return CHECKPOINT_NODES.has(nodeType) && stepIndexOf(nodeType) > anchorStepIndex;
}
