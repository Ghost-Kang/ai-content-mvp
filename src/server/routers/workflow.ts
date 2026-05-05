// W1-05-V3 — workflow tRPC router.
// W3-06 extension — editStep / retryStep / skipStep + cascade.
//
// Endpoints:
//   workflow.create     → mutation, inserts workflow_runs row, returns runId
//   workflow.run        → mutation, dispatches the run (QStash or inline)
//   workflow.runSync    → legacy synchronous runner (tests / CLI probes only)
//   workflow.get        → query, returns run + all steps + outputs
//   workflow.list       → query, paginated list of recent runs
//   workflow.editStep   → mutation, save edited node output + cascade dirty (W3-06)
//   workflow.retryStep  → mutation, mark step pending + cascade + dispatch (W3-06)
//   workflow.skipStep   → mutation, mark step skipped + cascade + dispatch (W3-06)

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt } from 'drizzle-orm';

import { router, tenantProcedure } from '../trpc';
import { db, workflowRuns, workflowSteps } from '@/db';
import {
  buildFullOrchestrator,
  applyStepEdit,
  applyStepRetry,
  applyStepSkip,
  evaluateStepAction,
  type StepActionGuardResult,
} from '@/lib/workflow';
import { dispatchRun, DispatchError, resolveDispatchMode } from '@/lib/workflow/dispatch';
import {
  FINGERPRINT_RESUME_WINDOW_MS,
  areAllStepsStale,
  findReusableRun,
  type ReusableRunStatus,
} from '@/lib/workflow/dedup-policy';
import type { NodeType, StepStatus, WorkflowStatus } from '@/lib/workflow';

// ─── Inputs ────────────────────────────────────────────────────────────────────

// Optional seed payload from richer entry points (Quick Create today;
// templates / strategy-first tomorrow). Persisted into
// workflow_runs.seed_input verbatim — the orchestrator re-validates via
// parseRunSeedInput so a malformed/forged value can never reach a runner.
// Zod validation here is just a fast 400 for the obvious shape errors.
const SeedInputSchema = z.object({
  formula:        z.enum(['provocation', 'insight']).optional(),
  lengthMode:     z.enum(['short', 'long']).optional(),
  productName:    z.string().min(1).max(100).optional(),
  targetAudience: z.string().min(1).max(200).optional(),
  coreClaim:      z.string().min(1).max(300).optional(),
  sourceMeta: z.object({
    platform:       z.enum(['dy', 'ks', 'xhs', 'bz']).optional(),
    opusId:         z.string().min(1).max(120).optional(),
    rank:           z.number().int().min(1).optional(),
    url:            z.string().url().max(500).optional(),
    authorNickname: z.string().max(60).optional(),
  }).optional(),
}).strict();

const CreateRunInput = z.object({
  topic:     z.string().min(2).max(300),
  seedInput: SeedInputSchema.optional(),
});

const RunInput = z.object({
  runId: z.string().uuid(),
});

const GetRunInput = z.object({
  runId: z.string().uuid(),
});

const ListRunsInput = z.object({
  limit:  z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ─── W3-06 inputs ──────────────────────────────────────────────────────────────
// `nodeType` is the public API surface for cascade actions. We narrow to
// the four NodeRunner-backed types — `topic` is reserved for W4 and has no
// step row to mutate.

const EditableNodeType = z.enum(['script', 'storyboard']);
const ActionableNodeType = z.enum(['script', 'storyboard', 'video', 'export']);

const EditStepInput = z.object({
  runId:    z.string().uuid(),
  nodeType: EditableNodeType,
  /**
   * Free-form output payload. Intentionally `unknown` at the tRPC layer —
   * the per-node validators below enforce the shape. Lets us evolve the
   * NodeOutput types without breaking the wire contract.
   */
  output:   z.unknown(),
});

const RetryStepInput = z.object({
  runId:    z.string().uuid(),
  nodeType: ActionableNodeType,
});

const SkipStepInput = z.object({
  runId:    z.string().uuid(),
  // For MVP-1 we ONLY allow skipping `export` — see cascade.ts comment for
  // why. The Zod-level enum gives a clean 400 rather than relying on the
  // server-side guard for the most common misuse.
  nodeType: z.enum(['export']),
});

// ─── Per-node payload validators (used by editStep) ───────────────────────────
// Schemas live in @/lib/workflow/edit-schemas so the W3-08 round-trip test
// can verify rebuilt frame outputs pass the same validation.

import { ScriptOutputEditSchema, StoryboardOutputEditSchema } from '@/lib/workflow/edit-schemas';

function validateEditPayload(nodeType: 'script' | 'storyboard', output: unknown): unknown {
  const schema = nodeType === 'script' ? ScriptOutputEditSchema : StoryboardOutputEditSchema;
  const parsed = schema.safeParse(output);
  if (!parsed.success) {
    // Surface up to the first 3 issues — tRPC error message lands in the
    // toast verbatim, so keep it short + scannable.
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `编辑内容格式不合规：${issues.join('；')}`,
    });
  }
  return parsed.data;
}

// ─── Shared loader: assert run + step exist + tenant matches ──────────────────

async function loadRunAndStep(args: {
  runId:    string;
  nodeType: NodeType;
  tenantId: string;
}) {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, args.runId),
        eq(workflowRuns.tenantId, args.tenantId),
      ),
    )
    .limit(1);
  if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: '未找到工作流' });

  const [step] = await db
    .select()
    .from(workflowSteps)
    .where(
      and(
        eq(workflowSteps.runId, args.runId),
        eq(workflowSteps.tenantId, args.tenantId),
        eq(workflowSteps.nodeType, args.nodeType),
      ),
    )
    .limit(1);
  if (!step) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `未找到节点 ${args.nodeType}（可能尚未执行过）`,
    });
  }

  return { run, step };
}

function assertActionAllowed(g: StepActionGuardResult, action: 'edit' | 'retry' | 'skip'): void {
  if (g.allowed) return;
  const reasonText: Record<NonNullable<StepActionGuardResult['reason']>, string> = {
    RUN_RUNNING:           '工作流正在运行，请等待结束或取消后再试',
    NODE_NOT_EDITABLE:     '该节点不支持编辑（仅脚本和分镜可编辑）',
    STATUS_NOT_EDITABLE:   '该节点不在可编辑状态（只有「已完成」的节点可编辑）',
    STATUS_NOT_RETRYABLE:  '该节点不在可重试状态（只有「失败」或「需重跑」的节点可重试）',
    STATUS_NOT_SKIPPABLE:  '该节点不在可跳过状态',
  };
  throw new TRPCError({
    code:    g.reason === 'RUN_RUNNING' ? 'CONFLICT' : 'BAD_REQUEST',
    message: `无法${actionVerb(action)}：${g.reason ? reasonText[g.reason] : '状态不允许该操作'}`,
  });
}

function actionVerb(a: 'edit' | 'retry' | 'skip'): string {
  return a === 'edit' ? '编辑' : a === 'retry' ? '重试' : '跳过';
}

/**
 * Tries to revive a `running` run whose worker is presumed dead.
 *
 * IMPORTANT: only safe in qstash mode, where /api/workflow/run's CAS lock
 * arbitrates between the (possibly still alive) old worker and the new
 * dispatch. In inline mode there is no cross-process lock — the old
 * orchestrator is just a Promise inside some other request handler, and
 * flipping its step rows would race two in-process orchestrators on the
 * same runId. Caller must gate by dispatch mode.
 *
 * Stale-decision and per-node thresholds live in dedup-policy.ts.
 */
async function recoverStaleRunningRun(runId: string): Promise<'running' | 'pending'> {
  const runningSteps = await db
    .select({
      nodeType:  workflowSteps.nodeType,
      updatedAt: workflowSteps.updatedAt,
      startedAt: workflowSteps.startedAt,
    })
    .from(workflowSteps)
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.status, 'running'),
      ),
    );

  if (!areAllStepsStale(runningSteps)) return 'running';

  await db
    .update(workflowSteps)
    .set({
      status:      'pending' as StepStatus,
      errorMsg:    null,
      completedAt: null,
      updatedAt:   new Date(),
    })
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.status, 'running'),
      ),
    );

  await db
    .update(workflowRuns)
    .set({
      status:      'pending' as WorkflowStatus,
      errorMsg:    null,
      completedAt: null,
      updatedAt:   new Date(),
    })
    .where(eq(workflowRuns.id, runId));

  return 'pending';
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const workflowRouter = router({

  create: tenantProcedure
    .input(CreateRunInput)
    .mutation(async ({ ctx, input }) => {
      // Fingerprint dedup: only protects against accidental double-submit
      // within a recent window. Beyond the window OR for already-done runs,
      // create a fresh run — re-clicking "create" on a topic the user
      // generated last week clearly means "give me a new take", not "open
      // the old result". `cancelled` is excluded because the user already
      // chose to abandon it.
      const cutoff = new Date(Date.now() - FINGERPRINT_RESUME_WINDOW_MS);
      const recentRuns = await db
        .select({
          id:        workflowRuns.id,
          topic:     workflowRuns.topic,
          status:    workflowRuns.status,
          seedInput: workflowRuns.seedInput,
        })
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.tenantId, ctx.tenantId),
            eq(workflowRuns.createdBy, ctx.userId),
            gt(workflowRuns.createdAt, cutoff),
          ),
        )
        .orderBy(desc(workflowRuns.createdAt))
        .limit(50);

      const reusableRun = findReusableRun(
        recentRuns.map((r) => ({ ...r, status: r.status as ReusableRunStatus })),
        input,
      );

      if (reusableRun) {
        // Stale-recovery flips `running` → `pending` and clears step rows
        // so the next dispatch can take over. Only safe when the worker
        // route's CAS lock will arbitrate against the (possibly still
        // alive) prior worker. In inline mode there's no such lock —
        // leave the run alone and let the user wait or cancel manually.
        let status: WorkflowStatus = reusableRun.status as WorkflowStatus;
        if (status === 'running' && resolveDispatchMode() === 'qstash') {
          status = await recoverStaleRunningRun(reusableRun.id);
        }

        return {
          runId:   reusableRun.id,
          resumed: true,
          status,
        };
      }

      const [run] = await db
        .insert(workflowRuns)
        .values({
          tenantId:  ctx.tenantId,
          createdBy: ctx.userId,
          topic:     input.topic,
          status:    'pending',
          seedInput: input.seedInput ?? null,
        })
        .returning({ id: workflowRuns.id, status: workflowRuns.status });

      return { runId: run.id, resumed: false, status: run.status };
    }),

  // W2-07a — Enqueues the run instead of executing inline.
  //
  // Returns IMMEDIATELY (~50ms) — the orchestrator runs out-of-band:
  //   • inline mode  → fire-and-forget in this process (dev)
  //   • qstash mode  → QStash POSTs /api/workflow/run/route.ts (prod)
  //
  // Clients should navigate to /runs/[runId] and poll workflow.get for
  // status. The detail page (WorkflowCanvas) handles this automatically.
  //
  // Tenant scoping: enforced HERE (only the run's owning tenant can
  // dispatch it). The worker route does NOT re-check tenancy because by
  // then the runId is the only context — instead it relies on the CAS
  // lock to prevent unauthorized dispatch (an attacker would need both
  // a valid runId AND a way to publish to QStash, which uses our token).
  //
      // The legacy synchronous test path uses the full pipeline too; otherwise
      // a sync run can incorrectly stop at storyboard and mark the run done.
  run: tenantProcedure
    .input(RunInput)
    .mutation(async ({ ctx, input }) => {
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.id, input.runId),
            eq(workflowRuns.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!run) throw new TRPCError({ code: 'NOT_FOUND' });

      if (run.status !== 'pending' && run.status !== 'failed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot run workflow in status "${run.status}"`,
        });
      }

      try {
        const dispatched = await dispatchRun(input.runId);
        return {
          runId:        input.runId,
          dispatched:   true,
          mode:         dispatched.mode,
          messageId:    dispatched.messageId ?? null,
          dispatchedAt: dispatched.dispatchedAt,
        };
      } catch (err) {
        if (err instanceof DispatchError) {
          throw new TRPCError({
            code:    'INTERNAL_SERVER_ERROR',
            message: `dispatch failed (${err.code}): ${err.message}`,
          });
        }
        throw err;
      }
    }),

  // Legacy synchronous runner kept ONLY for tests / CLI probes that need a
  // deterministic "wait until done" hook. Production UI should use `run`.
  // Will be deleted once tests migrate to a fire-then-poll fixture.
  runSync: tenantProcedure
    .input(RunInput)
    .mutation(async ({ ctx, input }) => {
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.id, input.runId),
            eq(workflowRuns.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!run) throw new TRPCError({ code: 'NOT_FOUND' });

      if (run.status !== 'pending' && run.status !== 'failed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot run workflow in status "${run.status}"`,
        });
      }

      const orchestrator = buildFullOrchestrator();
      const result = await orchestrator.run(input.runId);
      return result;
    }),

  get: tenantProcedure
    .input(GetRunInput)
    .query(async ({ ctx, input }) => {
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.id, input.runId),
            eq(workflowRuns.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!run) throw new TRPCError({ code: 'NOT_FOUND' });

      const steps = await db
        .select()
        .from(workflowSteps)
        .where(
          and(
            eq(workflowSteps.runId, input.runId),
            eq(workflowSteps.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(workflowSteps.stepIndex);

      return { run, steps };
    }),

  // ─── W3-06: editStep ────────────────────────────────────────────────────────
  // Save a hand-edited NodeOutput. Marks downstream steps `dirty` + resets
  // run for resume + dispatches. After this call:
  //   • the run is `pending` again (canvas shows "准备重跑")
  //   • the orchestrator will be invoked out-of-band (QStash/inline)
  //   • downstream nodes that were `done` are now `dirty` and will rerun
  //   • upstream nodes are untouched
  // The same dispatch path as `workflow.run` is used, so QStash + CAS lock
  // semantics + signature verification all carry over verbatim.
  editStep: tenantProcedure
    .input(EditStepInput)
    .mutation(async ({ ctx, input }) => {
      const { run, step } = await loadRunAndStep({
        runId:    input.runId,
        nodeType: input.nodeType,
        tenantId: ctx.tenantId,
      });

      assertActionAllowed(
        evaluateStepAction({
          nodeType:   input.nodeType,
          stepStatus: step.status as StepStatus,
          runStatus:  run.status as WorkflowStatus,
          action:     'edit',
        }),
        'edit',
      );

      const validatedOutput = validateEditPayload(input.nodeType, input.output);

      const { cascadedCount } = await applyStepEdit({
        runId:      input.runId,
        tenantId:   ctx.tenantId,
        nodeType:   input.nodeType,
        outputJson: validatedOutput,
      });

      try {
        const dispatched = await dispatchRun(input.runId);
        return {
          runId:        input.runId,
          dispatched:   true,
          cascadedCount,
          mode:         dispatched.mode,
          messageId:    dispatched.messageId ?? null,
          dispatchedAt: dispatched.dispatchedAt,
        };
      } catch (err) {
        if (err instanceof DispatchError) {
          throw new TRPCError({
            code:    'INTERNAL_SERVER_ERROR',
            message: `保存成功但派发失败 (${err.code})：${err.message}`,
          });
        }
        throw err;
      }
    }),

  // ─── W3-06: retryStep ──────────────────────────────────────────────────────
  // Marks the step `pending` (clearing errorMsg), cascades downstream `dirty`,
  // resets run for resume, then dispatches. Use this when a node failed and
  // the user wants another go without changing inputs.
  retryStep: tenantProcedure
    .input(RetryStepInput)
    .mutation(async ({ ctx, input }) => {
      const { run, step } = await loadRunAndStep({
        runId:    input.runId,
        nodeType: input.nodeType,
        tenantId: ctx.tenantId,
      });

      assertActionAllowed(
        evaluateStepAction({
          nodeType:   input.nodeType,
          stepStatus: step.status as StepStatus,
          runStatus:  run.status as WorkflowStatus,
          action:     'retry',
        }),
        'retry',
      );

      const { cascadedCount } = await applyStepRetry({
        runId:    input.runId,
        tenantId: ctx.tenantId,
        nodeType: input.nodeType,
      });

      try {
        const dispatched = await dispatchRun(input.runId);
        return {
          runId:        input.runId,
          dispatched:   true,
          cascadedCount,
          mode:         dispatched.mode,
          messageId:    dispatched.messageId ?? null,
          dispatchedAt: dispatched.dispatchedAt,
        };
      } catch (err) {
        if (err instanceof DispatchError) {
          throw new TRPCError({
            code:    'INTERNAL_SERVER_ERROR',
            message: `重试已就绪但派发失败 (${err.code})：${err.message}`,
          });
        }
        throw err;
      }
    }),

  // ─── W3-06: skipStep ──────────────────────────────────────────────────────
  // Marks a failed step as `skipped` so the run can move past it. MVP-1
  // restricts skipping to `export` (no downstream); skipping mid-pipeline
  // would create UPSTREAM_MISSING failures. We dispatch after marking so
  // the canvas reflects the final state without a manual "重跑" button.
  skipStep: tenantProcedure
    .input(SkipStepInput)
    .mutation(async ({ ctx, input }) => {
      const { run, step } = await loadRunAndStep({
        runId:    input.runId,
        nodeType: input.nodeType,
        tenantId: ctx.tenantId,
      });

      assertActionAllowed(
        evaluateStepAction({
          nodeType:   input.nodeType,
          stepStatus: step.status as StepStatus,
          runStatus:  run.status as WorkflowStatus,
          action:     'skip',
        }),
        'skip',
      );

      const { cascadedCount } = await applyStepSkip({
        runId:    input.runId,
        tenantId: ctx.tenantId,
        nodeType: input.nodeType,
      });

      try {
        const dispatched = await dispatchRun(input.runId);
        return {
          runId:        input.runId,
          dispatched:   true,
          cascadedCount,
          mode:         dispatched.mode,
          messageId:    dispatched.messageId ?? null,
          dispatchedAt: dispatched.dispatchedAt,
        };
      } catch (err) {
        if (err instanceof DispatchError) {
          throw new TRPCError({
            code:    'INTERNAL_SERVER_ERROR',
            message: `跳过已记录但派发失败 (${err.code})：${err.message}`,
          });
        }
        throw err;
      }
    }),

  list: tenantProcedure
    .input(ListRunsInput)
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id:               workflowRuns.id,
          topic:            workflowRuns.topic,
          status:           workflowRuns.status,
          totalCostFen:     workflowRuns.totalCostFen,
          totalVideoCount:  workflowRuns.totalVideoCount,
          createdAt:        workflowRuns.createdAt,
          completedAt:      workflowRuns.completedAt,
        })
        .from(workflowRuns)
        .where(eq(workflowRuns.tenantId, ctx.tenantId))
        .orderBy(desc(workflowRuns.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { runs: rows };
    }),
});
