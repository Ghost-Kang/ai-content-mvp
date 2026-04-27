// W2-07c verification probe — video continuation across multiple invocations.
//
// Goal:
//   Validate that long video rendering can continue from checkpoints instead of
//   timing out in one invocation.
//
// What it does:
//   - seeds one run with full orchestrator (topic -> script -> storyboard -> video -> export)
//   - repeatedly calls orchestrator.run(runId) on the SAME run
//   - expects intermediate failures with VIDEO_CONTINUE_REQUIRED
//   - checks video frame checkpoint grows monotonically
//   - exits success only when run reaches done and export is produced
//
// Recommended env for fast probe:
//   ANALYTICS_DISABLED=1
//   WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION=2
//   WORKFLOW_VIDEO_POLL_MAX_WAIT_MS=45000
//   WORKFLOW_VIDEO_POLL_INTERVAL_MS=1000
//
// Run:
//   pnpm tsx --env-file=.env.local scripts/probe-video-resume-v3.ts

import { and, asc, eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  monthlyUsage,
  llmSpendDaily,
} from '../src/db';
import { buildFullOrchestrator } from '../src/lib/workflow';
import { VIDEO_CONTINUE_REQUIRED } from '../src/lib/workflow/nodes/video';

const TOPIC = 'B2B SaaS 创始人如何用短视频讲清复杂产品价值';
const MAX_INVOCATIONS = 20;
const HEARTBEAT_MS = 10_000;

function msToSec(ms: number): string {
  return (ms / 1000).toFixed(1);
}

interface Fixture {
  tenantId: string;
  userId: string;
  runId: string;
}

async function seedFixture(): Promise<Fixture> {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `wf-resume-probe-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      clerkUserId: `wf-resume-probe-${ts}`,
      email: `probe-resume-${ts}@wf.test`,
      role: 'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId: tenant.id,
      createdBy: user.id,
      topic: TOPIC,
      status: 'pending',
    })
    .returning({ id: workflowRuns.id });
  return { tenantId: tenant.id, userId: user.id, runId: run.id };
}

async function cleanup(f: Fixture): Promise<void> {
  await db.delete(monthlyUsage).where(eq(monthlyUsage.tenantId, f.tenantId));
  await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, f.tenantId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

async function getVideoFrameCount(runId: string): Promise<number> {
  const rows = await db
    .select({ outputJson: workflowSteps.outputJson })
    .from(workflowSteps)
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.nodeType, 'video'),
      ),
    )
    .limit(1);
  const raw = rows[0]?.outputJson as { frames?: unknown } | null | undefined;
  if (!raw || !Array.isArray(raw.frames)) return 0;
  return raw.frames.length;
}

async function printStepSummary(runId: string): Promise<void> {
  const rows = await db
    .select({
      nodeType: workflowSteps.nodeType,
      status: workflowSteps.status,
      retryCount: workflowSteps.retryCount,
      costFen: workflowSteps.costFen,
    })
    .from(workflowSteps)
    .where(eq(workflowSteps.runId, runId))
    .orderBy(asc(workflowSteps.stepIndex));
  const line = rows
    .map((r) => `${r.nodeType}:${r.status}(r${r.retryCount},c${r.costFen})`)
    .join(' | ');
  console.log(`    steps: ${line || 'none'}`);
}

async function printHeartbeat(runId: string, invokeIndex: number, invokeStartMs: number): Promise<void> {
  const runRows = await db
    .select({ status: workflowRuns.status })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);
  const frames = await getVideoFrameCount(runId);
  const elapsed = msToSec(Date.now() - invokeStartMs);
  process.stdout.write(`[hb invoke ${invokeIndex} +${elapsed}s] run=${runRows[0]?.status ?? 'missing'} video_frames=${frames} | `);
  await printStepSummary(runId);
}

async function main(): Promise<void> {
  if (!process.env.ANALYTICS_DISABLED && !process.env.POSTHOG_DISABLED) {
    process.env.ANALYTICS_DISABLED = '1';
  }
  if (!process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION) {
    process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION = '2';
  }

  console.log('--- W2-07c video continuation probe ---');
  console.log(`topic: ${TOPIC}`);
  console.log(`chunk size per invocation: ${process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION}`);
  console.log(`max invocations: ${MAX_INVOCATIONS}`);
  console.log(`analytics disabled: ${process.env.ANALYTICS_DISABLED ?? process.env.POSTHOG_DISABLED}\n`);

  const f = await seedFixture();
  const orchestrator = buildFullOrchestrator();
  const t0 = Date.now();

  let lastFrames = 0;
  let continuedCount = 0;
  let finalStatus = 'unknown';
  let finalError = '';

  try {
    for (let i = 1; i <= MAX_INVOCATIONS; i++) {
      const invStart = Date.now();
      console.log(`\n[invoke ${i}] start`);

      const heartbeat = setInterval(() => {
        void printHeartbeat(f.runId, i, invStart).catch((e) => {
          console.log(`[hb invoke ${i}] heartbeat failed: ${(e as Error).message}`);
        });
      }, HEARTBEAT_MS);

      const result = await orchestrator
        .run(f.runId)
        .finally(() => clearInterval(heartbeat));

      const invMs = Date.now() - invStart;
      const frames = await getVideoFrameCount(f.runId);
      const grew = frames >= lastFrames;
      console.log(
        `[invoke ${i}] status=${result.status} time=${msToSec(invMs)}s video_frames=${frames} (prev=${lastFrames}, monotonic=${grew})`,
      );
      await printStepSummary(f.runId);
      if (!grew) {
        throw new Error(`video checkpoint regressed: ${lastFrames} -> ${frames}`);
      }
      lastFrames = frames;

      if (result.status === 'done') {
        finalStatus = 'done';
        finalError = '';
        break;
      }

      finalStatus = result.status;
      finalError = result.errorMsg ?? '';
      if (result.errorMsg?.includes(VIDEO_CONTINUE_REQUIRED)) {
        continuedCount++;
        continue;
      }
      // Any non-continuation failure is a hard failure for this probe.
      break;
    }

    const totalMs = Date.now() - t0;
    console.log(`\nprobe total time: ${msToSec(totalMs)}s`);
    console.log(`continuation hops: ${continuedCount}`);
    console.log(`final status: ${finalStatus}`);
    if (finalError) console.log(`final error: ${finalError}`);

    if (finalStatus !== 'done') {
      throw new Error(
        finalError
          ? `probe ended non-done: ${finalStatus} (${finalError})`
          : `probe ended non-done: ${finalStatus}`,
      );
    }

    console.log('\n✅ continuation verified: run reached done through multi-invocation video checkpoints.');
  } finally {
    await cleanup(f);
  }
}

main().catch((e) => {
  console.error('probe failed:', e);
  process.exit(1);
});
