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
import { and, desc, eq } from 'drizzle-orm';

import { router, tenantProcedure } from '../trpc';
import { db, workflowRuns, workflowSteps } from '@/db';
import {
  buildDefaultOrchestrator,
  applyStepEdit,
  applyStepRetry,
  applyStepSkip,
  evaluateStepAction,
  type StepActionGuardResult,
} from '@/lib/workflow';
import { dispatchRun, DispatchError } from '@/lib/workflow/dispatch';
import type { NodeType, StepStatus, WorkflowStatus } from '@/lib/workflow';

// ─── Inputs ────────────────────────────────────────────────────────────────────

const CreateRunInput = z.object({
  topic: z.string().min(2).max(300),
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

// ─── Router ───────────────────────────────────────────────────────────────────

export const workflowRouter = router({

  create: tenantProcedure
    .input(CreateRunInput)
    .mutation(async ({ ctx, input }) => {
      const [run] = await db
        .insert(workflowRuns)
        .values({
          tenantId:  ctx.tenantId,
          createdBy: ctx.userId,
          topic:     input.topic,
          status:    'pending',
        })
        .returning({ id: workflowRuns.id });

      return { runId: run.id };
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
  // `buildDefaultOrchestrator` is intentionally still imported so the
  // legacy synchronous test path keeps compiling — it'll be retired once
  // dispatch is exercised end-to-end in CI.
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

      const orchestrator = buildDefaultOrchestrator();
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
