// W4-P0 — Full 5-node workflow timeout probe.
//
// Purpose:
//   Run ONE real full-chain workflow (topic -> script -> storyboard -> video -> export)
//   and print:
//     - total runtime
//     - per-node runtime breakdown
//     - whether it crosses the 300s Vercel non-streaming cap
//
// Run:
//   pnpm tsx --env-file=.env.local scripts/probe-workflow-full-v3.ts
//
// Notes:
//   - Uses real external providers (LLM + Seedance + storage if configured).
//   - Creates a temporary tenant/user/run and cleans up afterward.

import { eq, asc } from 'drizzle-orm';
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

const VERCEL_CAP_SECONDS = 300;
const TOPIC = 'B2B SaaS 创始人如何用一条 60 秒短视频解释复杂产品价值';
const HEARTBEAT_MS = 10_000;

function msToSec(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function durationMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt || !completedAt) return null;
  return completedAt.getTime() - startedAt.getTime();
}

async function seedFixture() {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `wf-full-probe-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      clerkUserId: `wf-full-probe-${ts}`,
      email: `probe-full-${ts}@wf.test`,
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

  return {
    tenantId: tenant.id,
    userId: user.id,
    runId: run.id,
  };
}

async function cleanup(f: { tenantId: string; userId: string; runId: string }) {
  await db.delete(monthlyUsage).where(eq(monthlyUsage.tenantId, f.tenantId));
  await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, f.tenantId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

async function main() {
  console.log('--- W4-P0 full workflow timeout probe ---');
  console.log(`topic: ${TOPIC}`);
  console.log(`vercel cap: ${VERCEL_CAP_SECONDS}s\n`);

  // Probe ergonomics:
  // 1) disable analytics flush so the process exits deterministically;
  // 2) limit frame count by default to keep timeout checks quick/repeatable.
  if (!process.env.ANALYTICS_DISABLED && !process.env.POSTHOG_DISABLED) {
    process.env.ANALYTICS_DISABLED = '1';
  }
  const maxFrames = Number(
    process.env.PROBE_VIDEO_MAX_FRAMES
      ?? process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_RUN
      ?? 3,
  );
  process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_RUN = String(
    Number.isFinite(maxFrames) && maxFrames > 0 ? Math.floor(maxFrames) : 3,
  );
  console.log(`probe config: analytics_disabled=${process.env.ANALYTICS_DISABLED ?? process.env.POSTHOG_DISABLED} | max_frames=${process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_RUN}`);

  const f = await seedFixture();
  const orchestrator = buildFullOrchestrator();

  const t0 = Date.now();
  let runStatus = 'unknown';
  let runError = '';
  let totalCostFen = 0;
  let totalVideoCount = 0;
  const heartbeat = setInterval(async () => {
    try {
      const runRows = await db
        .select({ status: workflowRuns.status })
        .from(workflowRuns)
        .where(eq(workflowRuns.id, f.runId));
      const stepRows = await db
        .select({
          nodeType: workflowSteps.nodeType,
          status: workflowSteps.status,
          retryCount: workflowSteps.retryCount,
        })
        .from(workflowSteps)
        .where(eq(workflowSteps.runId, f.runId))
        .orderBy(asc(workflowSteps.stepIndex));

      const elapsed = msToSec(Date.now() - t0);
      const stepSummary = stepRows.length === 0
        ? 'no steps yet'
        : stepRows.map((s) => `${s.nodeType}:${s.status}(r${s.retryCount})`).join(' | ');
      console.log(`[heartbeat +${elapsed}s] run=${runRows[0]?.status ?? 'missing'} | ${stepSummary}`);
    } catch (e) {
      console.log(`[heartbeat] progress query failed: ${(e as Error).message}`);
    }
  }, HEARTBEAT_MS);

  try {
    const result = await orchestrator.run(f.runId);
    runStatus = result.status;
    runError = result.errorMsg ?? '';
    totalCostFen = result.totalCostFen;
    totalVideoCount = result.totalVideoCount;
  } catch (e) {
    runStatus = 'errored';
    runError = e instanceof Error ? e.message : String(e);
  } finally {
    clearInterval(heartbeat);
  }
  const totalMs = Date.now() - t0;

  const steps = await db
    .select({
      nodeType: workflowSteps.nodeType,
      status: workflowSteps.status,
      retryCount: workflowSteps.retryCount,
      startedAt: workflowSteps.startedAt,
      completedAt: workflowSteps.completedAt,
      errorMsg: workflowSteps.errorMsg,
      costFen: workflowSteps.costFen,
      stepIndex: workflowSteps.stepIndex,
    })
    .from(workflowSteps)
    .where(eq(workflowSteps.runId, f.runId))
    .orderBy(asc(workflowSteps.stepIndex));

  console.log(`run status: ${runStatus}`);
  if (runError) console.log(`run error : ${runError}`);
  console.log(`total time: ${totalMs}ms (${msToSec(totalMs)}s)`);
  console.log(`total cost: ${totalCostFen} fen`);
  console.log(`video cnt : ${totalVideoCount}\n`);

  console.log('node breakdown:');
  for (const s of steps) {
    const d = durationMs(s.startedAt, s.completedAt);
    const dur = d === null ? '-' : `${d}ms (${msToSec(d)}s)`;
    const errSuffix = s.errorMsg ? ` | err=${s.errorMsg}` : '';
    console.log(
      `  - [${s.status}] #${s.stepIndex} ${s.nodeType} | dur=${dur} | retry=${s.retryCount} | cost=${s.costFen}${errSuffix}`,
    );
  }

  const totalSec = totalMs / 1000;
  const overCap = totalSec > VERCEL_CAP_SECONDS;
  const delta = Math.abs(totalSec - VERCEL_CAP_SECONDS);
  console.log('\ncap verdict:');
  if (overCap) {
    console.log(
      `  ❌ exceeds ${VERCEL_CAP_SECONDS}s by ${delta.toFixed(1)}s; single-invocation worker is unsafe.`,
    );
  } else {
    console.log(
      `  ✅ under ${VERCEL_CAP_SECONDS}s by ${delta.toFixed(1)}s; single-invocation worker still viable.`,
    );
  }

  await cleanup(f);
}

main().catch(async (e) => {
  console.error('probe failed unexpectedly:', e);
  process.exit(1);
});
