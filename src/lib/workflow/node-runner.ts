// W1-02-V3 — Abstract NodeRunner base class.
//
// State machine: pending → running → done | failed
// Persistence: each transition writes to workflow_steps.
// Retry: subclass-defined max + exponential backoff (200ms × 2^attempt, capped 5s).
// Cost tracking: subclass returns costFen + optional videoCount per attempt.
//
// Subclass responsibility: implement only `execute()`. Everything else is in the base.
// Concrete impls live in `./nodes/*.ts`.

import { eq } from 'drizzle-orm';
import { db, workflowSteps } from '@/db';
import type {
  NodeContext,
  NodeDescriptor,
  NodeResult,
  StepStatus,
} from './types';
import { NodeError } from './types';
import {
  fireWorkflowNodeCompleted,
  fireWorkflowNodeFailed,
  fireWorkflowNodeRetried,
} from '@/lib/analytics/server';

const RETRY_BACKOFF_BASE_MS = 200;
const RETRY_BACKOFF_CAP_MS  = 5_000;

export abstract class NodeRunner<I = unknown, O = unknown> {
  /** Subclass identity + retry policy. */
  abstract readonly descriptor: NodeDescriptor;

  /**
   * Subclass implementation: do the actual work.
   * Throw NodeError to signal failure (set `retryable: true` to allow retry).
   */
  protected abstract execute(input: I, ctx: NodeContext): Promise<NodeResult<O>>;

  /**
   * Subclass override: derive `I` from the run topic + upstream outputs.
   * Default reads `upstreamOutputs[upstreamRequired[0]]` if present, else `topic`.
   */
  protected buildInput(ctx: NodeContext): I {
    const reqs = this.descriptor.upstreamRequired;
    if (reqs.length === 0) {
      return { topic: ctx.topic } as unknown as I;
    }
    const last = reqs[reqs.length - 1];
    const upstream = ctx.upstreamOutputs[last];
    if (upstream === undefined) {
      throw new NodeError(
        'UPSTREAM_MISSING',
        `Node ${this.descriptor.nodeType} requires upstream ${last} output but it is missing`,
        false,
      );
    }
    return upstream as I;
  }

  /**
   * Public entry point called by the orchestrator.
   * Owns the full state machine + DB writes + retry loop.
   */
  async run(ctx: NodeContext): Promise<NodeResult<O>> {
    const t0 = Date.now();
    const stepRow = await this.upsertStepRow(ctx, 'running');

    let lastErr: NodeError | undefined;

    for (let attempt = 0; attempt <= this.descriptor.maxRetries; attempt++) {
      const attemptStart = Date.now();
      try {
        const input = this.buildInput(ctx);
        const result = await this.execute(input, ctx);

        await db
          .update(workflowSteps)
          .set({
            status:       'done' as StepStatus,
            outputJson:   result.output as object,
            costFen:      result.costFen,
            errorMsg:     null,
            retryCount:   attempt,
            completedAt:  new Date(),
          })
          .where(eq(workflowSteps.id, stepRow.id));

        safeFire(() =>
          fireWorkflowNodeCompleted(ctx.userId, {
            tenantId:     ctx.tenantId,
            region:       ctx.region,
            plan:         ctx.plan,
            runId:        ctx.runId,
            nodeType:     this.descriptor.nodeType,
            stepIndex:    this.descriptor.stepIndex,
            costFen:      result.costFen,
            videoCount:   result.videoCount ?? 0,
            retryCount:   attempt,
            durationMs:   Date.now() - t0,
            qualityIssue: result.qualityIssue ?? null,
          }),
        );

        return result;
      } catch (e) {
        const ne = e instanceof NodeError
          ? e
          : new NodeError('UNKNOWN', e instanceof Error ? e.message : String(e), false, e);
        lastErr = ne;

        const isLastAttempt = attempt >= this.descriptor.maxRetries;
        const shouldRetry = ne.retryable && !isLastAttempt;

        if (!shouldRetry) {
          await db
            .update(workflowSteps)
            .set({
              status:      'failed' as StepStatus,
              errorMsg:    `${ne.code}: ${ne.message}`,
              retryCount:  attempt,
              completedAt: new Date(),
            })
            .where(eq(workflowSteps.id, stepRow.id));
          safeFire(() =>
            fireWorkflowNodeFailed(ctx.userId, {
              tenantId:   ctx.tenantId,
              region:     ctx.region,
              plan:       ctx.plan,
              runId:      ctx.runId,
              nodeType:   this.descriptor.nodeType,
              stepIndex:  this.descriptor.stepIndex,
              errorCode:  ne.code,
              errorMsg:   ne.message,
              retryCount: attempt,
              durationMs: Date.now() - attemptStart,
            }),
          );
          throw ne;
        }

        const wait = Math.min(
          RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt),
          RETRY_BACKOFF_CAP_MS,
        );
        safeFire(() =>
          fireWorkflowNodeRetried(ctx.userId, {
            tenantId:   ctx.tenantId,
            region:     ctx.region,
            plan:       ctx.plan,
            runId:      ctx.runId,
            nodeType:   this.descriptor.nodeType,
            stepIndex:  this.descriptor.stepIndex,
            attempt,
            errorCode:  ne.code,
            errorMsg:   ne.message,
            backoffMs:  wait,
          }),
        );
        await sleep(wait);
      }
    }

    throw lastErr ?? new NodeError('UNKNOWN', 'NodeRunner exited retry loop without resolution', false);
  }

  /**
   * Upsert a workflow_steps row for (runId, nodeType). The composite UNIQUE
   * index `uq_steps_run_node` guarantees one row per pair. Returns its id.
   * Idempotent: re-running a node updates the existing row's status & startedAt.
   */
  private async upsertStepRow(
    ctx: NodeContext,
    initialStatus: StepStatus,
  ): Promise<{ id: string }> {
    const found = await this.findExistingStep(ctx);
    if (found) {
      await db
        .update(workflowSteps)
        .set({
          status:    initialStatus,
          startedAt: new Date(),
          errorMsg:  null,
        })
        .where(eq(workflowSteps.id, found.id));
      return found;
    }

    const [created] = await db
      .insert(workflowSteps)
      .values({
        runId:      ctx.runId,
        tenantId:   ctx.tenantId,
        nodeType:   this.descriptor.nodeType,
        stepIndex:  this.descriptor.stepIndex,
        status:     initialStatus,
        startedAt:  new Date(),
      })
      .returning({ id: workflowSteps.id });
    return { id: created.id };
  }

  private async findExistingStep(ctx: NodeContext): Promise<{ id: string } | null> {
    const rows = await db
      .select({ id: workflowSteps.id, nodeType: workflowSteps.nodeType })
      .from(workflowSteps)
      .where(eq(workflowSteps.runId, ctx.runId));
    const hit = rows.find((r) => r.nodeType === this.descriptor.nodeType);
    return hit ? { id: hit.id } : null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFire(fn: () => void): void {
  try { fn(); } catch (e) {
    console.warn('[node.analytics] fire failed', e);
  }
}
