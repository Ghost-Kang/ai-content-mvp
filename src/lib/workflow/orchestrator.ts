// W1-03-V3 — Workflow Orchestrator.
//
// Loads a workflow_run, walks its registered NodeRunners in step_index order,
// hydrates upstream outputs, calls each node, persists run-level aggregates
// (status / total_cost_fen / monthly_usage), and stops on first failure.
//
// The set of nodes is injected at construction time. W1 ships with just
// [ScriptNodeRunner]; W2/W3/W4 add storyboard / video / export / topic.

import { eq, sql } from 'drizzle-orm';
import { db, workflowRuns, workflowSteps, monthlyUsage } from '@/db';
import { parseRunExportOverrides } from './parse-export-overrides';
import type { NodeRunner } from './node-runner';
import type {
  NodeContext,
  NodeType,
  StepStatus,
  WorkflowStatus,
} from './types';
import { NodeError } from './types';
import { isContinuationMarker } from './continuation';
import { checkMonthlyCap, SpendCapError } from './spend-cap';
import {
  fireWorkflowRunStarted,
  fireWorkflowRunCompleted,
  fireWorkflowRunFailed,
  fireMonthlyCapBlocked,
} from '@/lib/analytics/server';

export interface RunResult {
  runId: string;
  status: WorkflowStatus;
  totalCostFen: number;
  totalVideoCount: number;
  errorMsg?: string;
  nodeOutputs: Partial<Record<NodeType, unknown>>;
  qualityIssues: Partial<Record<NodeType, string>>;
}

export class WorkflowOrchestrator {
  constructor(private readonly nodes: ReadonlyArray<NodeRunner>) {
    if (nodes.length === 0) {
      throw new Error('WorkflowOrchestrator requires at least one node');
    }
    // Enforce step_index ordering at construction time
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i].descriptor.stepIndex <= nodes[i - 1].descriptor.stepIndex) {
        throw new Error(
          `Nodes must be sorted by step_index (got ${nodes[i - 1].descriptor.nodeType}@${nodes[i - 1].descriptor.stepIndex} → ${nodes[i].descriptor.nodeType}@${nodes[i].descriptor.stepIndex})`,
        );
      }
    }
  }

  async run(runId: string): Promise<RunResult> {
    const t0 = Date.now();
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);
    if (!run) throw new Error(`workflow_run ${runId} not found`);

    // ─── Preflight: monthly spend cap ──────────────────────────────────────
    const cap = await checkMonthlyCap(run.tenantId, run.createdBy);
    if (!cap.allowed) {
      await db
        .update(workflowRuns)
        .set({
          status:      'failed' as WorkflowStatus,
          errorMsg:    `SPEND_CAP_EXCEEDED: ${cap.reason}`,
          completedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));
      safeFire(() =>
        fireMonthlyCapBlocked(run.createdBy, {
          tenantId:      run.tenantId,
          region:        'CN',
          plan:          'solo',
          runId,
          reason:        cap.reason!,
          totalCostFen:  cap.totalCostFen,
          costCapFen:    cap.costCapFen,
          videoCount:    cap.videoCount,
          videoCapCount: cap.videoCapCount,
          monthKey:      cap.monthKey,
        }),
      );
      return {
        runId,
        status: 'failed',
        totalCostFen: 0,
        totalVideoCount: 0,
        errorMsg: `SPEND_CAP_EXCEEDED: ${cap.reason}`,
        nodeOutputs: {},
        qualityIssues: {},
      };
    }

    await db
      .update(workflowRuns)
      .set({ status: 'running' as WorkflowStatus, startedAt: new Date() })
      .where(eq(workflowRuns.id, runId));

    safeFire(() =>
      fireWorkflowRunStarted(run.createdBy, {
        tenantId: run.tenantId,
        region:   'CN',
        plan:     'solo',
        runId,
        topic:    run.topic,
      }),
    );

    const ctx: NodeContext = {
      runId,
      tenantId: run.tenantId,
      userId:   run.createdBy,
      region:   'CN', // v3 MVP-1: CN-only. Extend when introducing INTL plans.
      plan:     'solo',
      topic:    run.topic,
      upstreamOutputs: {},
      exportOverrides: parseRunExportOverrides(run.exportOverrides) ?? undefined,
    };

    // ─── Resume mode (W3-06): hydrate previously-completed step outputs ────
    // For each node, peek at its persisted step row. If status is `done`
    // or `skipped`, we skip the node and treat its outputJson as the
    // upstream payload for downstream nodes. This is what makes "edit one
    // node + dispatch" cheap — we don't re-run script + storyboard just
    // to get to a new video render.
    //
    // `dirty`/`failed`/`pending`/`running` step rows are re-executed by
    // the NodeRunner (it already upserts the row to `running` and overwrites
    // status on the way back).
    //
    // We also fold persisted costs into the totals so the run's reported
    // totalCostFen reflects the WHOLE run, not just nodes executed during
    // this dispatch.
    const persistedSteps = await db
      .select({
        nodeType:   workflowSteps.nodeType,
        status:     workflowSteps.status,
        outputJson: workflowSteps.outputJson,
        costFen:    workflowSteps.costFen,
      })
      .from(workflowSteps)
      .where(eq(workflowSteps.runId, runId));
    const stepByNode = new Map<NodeType, {
      status:     StepStatus;
      outputJson: unknown;
      costFen:    number;
    }>();
    for (const s of persistedSteps) {
      stepByNode.set(s.nodeType as NodeType, {
        status:     s.status as StepStatus,
        outputJson: s.outputJson,
        costFen:    s.costFen,
      });
    }

    // Two separate ledgers (audit #4, 2026-04-30):
    //   - totalCostFen / totalVideoCount: WHAT TO DISPLAY on the run row.
    //     Includes hydrated step costs so the user-facing total reflects
    //     the lifetime of the run, not just this dispatch.
    //   - newSpendFen / newSpendVideoCount: WHAT TO BUMP into monthly_usage.
    //     ONLY accrues from steps actually executed in this dispatch. Each
    //     executed step is bumped exactly once across the lifetime of the
    //     run (the prior dispatch bumped its own executed steps already
    //     via this same path, on success or failure). Without this split
    //     a retried run double-counts every hydrated step's cost into the
    //     monthly cap and the user falsely hits the cap N× faster.
    let totalCostFen = 0;
    let totalVideoCount = 0;
    let newSpendFen = 0;
    let newSpendVideoCount = 0;
    const nodeOutputs: Partial<Record<NodeType, unknown>> = {};
    const qualityIssues: Partial<Record<NodeType, string>> = {};

    for (const node of this.nodes) {
      const persisted = stepByNode.get(node.descriptor.nodeType);

      // Hydrate-and-skip path: node already finished cleanly on a prior
      // dispatch. We keep its output in upstreamOutputs so downstream
      // nodes see the same payload they would have on a fresh run.
      if (persisted && (persisted.status === 'done' || persisted.status === 'skipped')) {
        if (persisted.outputJson !== null && persisted.outputJson !== undefined) {
          ctx.upstreamOutputs[node.descriptor.nodeType] = persisted.outputJson;
          nodeOutputs[node.descriptor.nodeType]         = persisted.outputJson;
        }
        // Display total reflects full run lifetime; monthly bump does NOT
        // re-accrue (the prior dispatch already bumped this step's cost).
        totalCostFen += persisted.costFen ?? 0;
        continue;
      }

      try {
        const result = await node.run(ctx);

        ctx.upstreamOutputs[node.descriptor.nodeType] = result.output;
        nodeOutputs[node.descriptor.nodeType] = result.output;
        if (result.qualityIssue) qualityIssues[node.descriptor.nodeType] = result.qualityIssue;

        const costFen = result.costFen ?? 0;
        const videoCount = result.videoCount ?? 0;
        totalCostFen   += costFen;
        totalVideoCount += videoCount;
        newSpendFen        += costFen;
        newSpendVideoCount += videoCount;
      } catch (e) {
        // SpendCapError raised mid-run by a heavy node (e.g. VideoGenNode in W2)
        const isCap = e instanceof SpendCapError;
        const ne = e instanceof NodeError
          ? e
          : isCap
            ? new NodeError('SPEND_CAP_EXCEEDED', (e as SpendCapError).message, false, e)
            : new NodeError('UNKNOWN', e instanceof Error ? e.message : String(e), false, e);

        // Continuation marker (video chunk hand-off) is NOT a real failure.
        // Write `pending` so SSE never pushes red `failed` to the browser
        // between chained worker invocations. We still return a non-`done`
        // result containing the marker so the worker route can detect it
        // and enqueue the next QStash message.
        if (isContinuationMarker(ne)) {
          await db
            .update(workflowRuns)
            .set({
              status:       'pending' as WorkflowStatus,
              errorMsg:     null,
              totalCostFen,
              totalVideoCount,
              completedAt:  null,
            })
            .where(eq(workflowRuns.id, runId));

          // Skip monthly_usage bump + analytics fire — neither apply to a
          // mid-flight checkpoint. The truly-final invocation will bump
          // and fire on success path below.
          return {
            runId,
            // Status here is the in-memory return value the worker reads;
            // the DB row says `pending`. Worker uses `errorMsg.includes(
            // VIDEO_CONTINUE_REQUIRED)` to detect the marker, so we leave
            // status as `failed` for backward compat with that probe even
            // though the persisted state is correctly `pending`.
            status: 'failed',
            totalCostFen,
            totalVideoCount,
            errorMsg: `${node.descriptor.nodeType}: ${ne.message}`,
            nodeOutputs,
            qualityIssues,
          };
        }

        await db
          .update(workflowRuns)
          .set({
            status:       'failed' as WorkflowStatus,
            errorMsg:     `${node.descriptor.nodeType}: ${ne.code} ${ne.message}`,
            totalCostFen,
            totalVideoCount,
            completedAt:  new Date(),
          })
          .where(eq(workflowRuns.id, runId));

        // Even on partial failure: bump monthly_usage with the spend that
        // actually happened in THIS dispatch. Hydrated step costs are
        // excluded — the dispatch that originally executed them already
        // bumped via the same path. See the totalCostFen/newSpendFen
        // comment at the top of the loop for the full rationale.
        if (newSpendFen > 0 || newSpendVideoCount > 0) {
          await this.bumpMonthlyUsage(ctx.tenantId, ctx.userId, newSpendFen, newSpendVideoCount);
        }

        if (isCap) {
          const snap = (e as SpendCapError).snapshot;
          safeFire(() =>
            fireMonthlyCapBlocked(ctx.userId, {
              tenantId:      ctx.tenantId,
              region:        ctx.region,
              plan:          ctx.plan,
              runId,
              reason:        snap.reason!,
              totalCostFen:  snap.totalCostFen,
              costCapFen:    snap.costCapFen,
              videoCount:    snap.videoCount,
              videoCapCount: snap.videoCapCount,
              monthKey:      snap.monthKey,
            }),
          );
        }

        safeFire(() =>
          fireWorkflowRunFailed(ctx.userId, {
            tenantId:        ctx.tenantId,
            region:          ctx.region,
            plan:            ctx.plan,
            runId,
            failedNode:      node.descriptor.nodeType,
            errorCode:       ne.code,
            errorMsg:        ne.message,
            totalCostFen,
            totalVideoCount,
            durationMs:      Date.now() - t0,
          }),
        );

        return {
          runId,
          status: 'failed',
          totalCostFen,
          totalVideoCount,
          errorMsg: `${node.descriptor.nodeType}: ${ne.message}`,
          nodeOutputs,
          qualityIssues,
        };
      }
    }

    // All nodes done — finalize run + bump monthly_usage aggregate
    await db
      .update(workflowRuns)
      .set({
        status:           'done' as WorkflowStatus,
        totalCostFen,
        totalVideoCount,
        completedAt:      new Date(),
      })
      .where(eq(workflowRuns.id, runId));

    // Bump only the new spend from THIS dispatch (audit #4). Hydrated
    // step costs were bumped by the dispatch that first executed them.
    if (newSpendFen > 0 || newSpendVideoCount > 0) {
      await this.bumpMonthlyUsage(ctx.tenantId, ctx.userId, newSpendFen, newSpendVideoCount);
    }

    safeFire(() =>
      fireWorkflowRunCompleted(ctx.userId, {
        tenantId:        ctx.tenantId,
        region:          ctx.region,
        plan:            ctx.plan,
        runId,
        totalCostFen,
        totalVideoCount,
        durationMs:      Date.now() - t0,
        nodeCount:       this.nodes.length,
      }),
    );

    return {
      runId,
      status: 'done',
      totalCostFen,
      totalVideoCount,
      nodeOutputs,
      qualityIssues,
    };
  }

  /**
   * Increment per-user monthly usage counters. Uses Postgres ON CONFLICT for
   * atomic upsert (matches uq_monthly_usage_user_month).
   */
  private async bumpMonthlyUsage(
    tenantId: string,
    userId: string,
    costFen: number,
    videoCount: number,
  ): Promise<void> {
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM (UTC; CST diff < 1 day, fine for cap accounting)

    await db
      .insert(monthlyUsage)
      .values({
        tenantId,
        userId,
        monthKey,
        videoCount,
        workflowRunCount: 1,
        totalCostFen:     costFen,
      })
      .onConflictDoUpdate({
        target: [monthlyUsage.userId, monthlyUsage.monthKey],
        set: {
          videoCount:        sql`${monthlyUsage.videoCount} + ${videoCount}`,
          workflowRunCount:  sql`${monthlyUsage.workflowRunCount} + 1`,
          totalCostFen:      sql`${monthlyUsage.totalCostFen} + ${costFen}`,
          lastUpdatedAt:     new Date(),
        },
      });
  }
}

// Analytics never breaks user flow — wrap every fire in this guard.
function safeFire(fn: () => void): void {
  try { fn(); } catch (e) {
    console.warn('[workflow.analytics] fire failed', e);
  }
}
