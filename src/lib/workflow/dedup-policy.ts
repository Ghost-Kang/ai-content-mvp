// Pure-logic helpers for workflow.create's "duplicate submit" handling.
// Extracted from src/server/routers/workflow.ts so the decisions are
// testable without spinning up tRPC/DB. The router still owns the SQL
// query (time-window filter, tenant scoping) and the dispatch-mode
// gating; this module owns the deterministic policy.

import { buildWorkflowRunFingerprint } from './run-fingerprint';
import { nodeTimeoutMs } from './node-runner';

// Window in which a fingerprint match counts as a "duplicate submit"
// worth resuming. Beyond this, treat the same prompt as a deliberate
// fresh run. Used by the router as a SQL `createdAt > NOW() - WINDOW`
// guard, NOT re-checked here — the router-side filter is authoritative.
export const FINGERPRINT_RESUME_WINDOW_MS = 24 * 60 * 60 * 1_000;

// Stale-step thresholds. Strictly greater than the per-node timeout in
// node-runner.ts — otherwise we'd race the orchestrator's own timeout
// path and recover a still-progressing run, causing a double-dispatch.
const STALE_RECOVERY_SLACK_MS = 60 * 1_000;
const STALE_RECOVERY_FLOOR_MS = 4 * 60 * 1_000;

export type ReusableRunStatus =
  | 'pending'
  | 'running'
  | 'failed'
  | 'done'
  | 'cancelled';

export interface ReusableCandidate {
  id:        string;
  topic:     string;
  status:    ReusableRunStatus;
  seedInput: unknown;
}

/**
 * Picks the first candidate (caller orders by createdAt desc) whose
 * fingerprint matches AND whose status is eligible for resume.
 *
 * `done` and `cancelled` are excluded:
 *  - `done`: re-clicking "create" on an already-completed prompt clearly
 *    means "give me a new take", not "open the old result".
 *  - `cancelled`: the user already chose to abandon it.
 *
 * `pending` / `running` / `failed` are reusable.
 */
export function findReusableRun(
  candidates: ReadonlyArray<ReusableCandidate>,
  requested:  { topic: string; seedInput?: unknown },
): ReusableCandidate | null {
  const requestedHash = buildWorkflowRunFingerprint(requested).hash;
  for (const run of candidates) {
    if (run.status === 'done' || run.status === 'cancelled') continue;
    const candidateHash = buildWorkflowRunFingerprint({
      topic:     run.topic,
      seedInput: run.seedInput,
    }).hash;
    if (candidateHash === requestedHash) return run;
  }
  return null;
}

/**
 * How long a step in `running` status can go without a DB write before
 * we treat its worker as dead. Tied to the node's own timeout so the
 * inequality `staleThreshold > nodeTimeout` always holds — otherwise
 * recovery and the node-runner's withTimeout race.
 */
export function staleThresholdMs(nodeType: string): number {
  return Math.max(STALE_RECOVERY_FLOOR_MS, nodeTimeoutMs(nodeType) + STALE_RECOVERY_SLACK_MS);
}

export interface RunningStepSummary {
  nodeType:  string;
  updatedAt: Date | string | null | undefined;
  startedAt: Date | string | null | undefined;
}

/**
 * True iff every running step looks abandoned (no DB write within its
 * per-node stale threshold). An empty list is treated as stale because
 * the run row says `running` but no step is actively executing — most
 * likely the worker died before writing the first row.
 */
export function areAllStepsStale(
  steps: ReadonlyArray<RunningStepSummary>,
  now:   number = Date.now(),
): boolean {
  if (steps.length === 0) return true;
  return steps.every((step) => isOlderThan(
    step.updatedAt ?? step.startedAt,
    staleThresholdMs(step.nodeType),
    now,
  ));
}

function isOlderThan(
  value:       Date | string | null | undefined,
  thresholdMs: number,
  now:         number,
): boolean {
  if (!value) return true;
  const ms = (typeof value === 'string' ? new Date(value) : value).getTime();
  if (!Number.isFinite(ms)) return true;
  return now - ms > thresholdMs;
}
