// W1-07-V3 — Spend cap framework test.
//
// Verifies:
//   1. Fresh user starts allowed (zero usage)
//   2. After ¥X spend close to cap, projectedCapCheck refuses next big run
//   3. Once over cap, full Orchestrator.run() preflight halts run as failed
//   4. Mid-run SpendCapError thrown by node halts orchestrator + bumps usage
//   5. Video count cap is independent from cost cap
//
// Run: pnpm wf:test:cap
// Caps overridden in-process via process.env so the test is hermetic.

process.env.WORKFLOW_MONTHLY_COST_CAP_CNY = '5';      // ¥5 cap → 500 fen
process.env.WORKFLOW_MONTHLY_VIDEO_CAP_COUNT = '3';   // 3 videos cap

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  monthlyUsage,
} from '../src/db';
import { NodeRunner } from '../src/lib/workflow/node-runner';
import { WorkflowOrchestrator } from '../src/lib/workflow/orchestrator';
import {
  checkMonthlyCap,
  projectedCapCheck,
  SpendCapError,
  assertCapAllows,
} from '../src/lib/workflow/spend-cap';
import {
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
} from '../src/lib/workflow/types';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

async function seed(label: string) {
  const ts = Date.now();
  const [tenant] = await db.insert(tenants)
    .values({ name: `cap-${label}-${ts}`, region: 'CN', plan: 'solo' }).returning();
  const [user] = await db.insert(users)
    .values({
      tenantId: tenant.id,
      clerkUserId: `cap-${label}-${ts}`,
      email: `${label}@cap.test`,
      role: 'owner',
    }).returning();
  const [run] = await db.insert(workflowRuns)
    .values({ tenantId: tenant.id, createdBy: user.id, topic: `cap-${label}`, status: 'pending' })
    .returning();
  return { tenantId: tenant.id, userId: user.id, runId: run.id };
}

async function cleanup(f: { tenantId: string; userId: string }) {
  await db.delete(monthlyUsage).where(eq(monthlyUsage.tenantId, f.tenantId));
  const runs = await db.select({ id: workflowRuns.id })
    .from(workflowRuns).where(eq(workflowRuns.tenantId, f.tenantId));
  for (const r of runs) await db.delete(workflowRuns).where(eq(workflowRuns.id, r.id));
  await db.delete(users).where(eq(users.tenantId, f.tenantId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

// ─── Mock costly node ─────────────────────────────────────────────────────────

class MockCostlyNode extends NodeRunner {
  readonly descriptor: NodeDescriptor = {
    nodeType: 'video', stepIndex: 1, maxRetries: 0, upstreamRequired: [],
  };
  constructor(private readonly costFen: number, private readonly videos: number) { super(); }
  protected async execute(): Promise<NodeResult> {
    return { output: {}, costFen: this.costFen, videoCount: this.videos };
  }
}

// Mid-execution cap-aware node: checks cap before each unit
class MockProjectedNode extends NodeRunner {
  readonly descriptor: NodeDescriptor = {
    nodeType: 'video', stepIndex: 1, maxRetries: 0, upstreamRequired: [],
  };
  constructor(private readonly count: number) { super(); }
  protected async execute(_input: unknown, ctx: NodeContext): Promise<NodeResult> {
    let burnedCost = 0; let burnedVideos = 0;
    for (let i = 0; i < this.count; i++) {
      // Each iteration would burn 200 fen + 1 video
      await assertCapAllows(ctx.tenantId, ctx.userId, {
        addCostFen: burnedCost + 200,
        addVideos:  burnedVideos + 1,
      });
      burnedCost += 200; burnedVideos += 1;
    }
    return { output: { burnedVideos }, costFen: burnedCost, videoCount: burnedVideos };
  }
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseFreshUserAllowed() {
  console.log('\n[case 1] fresh user — checkMonthlyCap allows');
  const f = await seed('fresh');
  const r = await checkMonthlyCap(f.tenantId, f.userId);
  expect(r.allowed,                            'allowed=true on zero usage');
  expect(r.totalCostFen === 0,                 'totalCostFen=0');
  expect(r.videoCount === 0,                   'videoCount=0');
  expect(r.costCapFen === 500,                 `costCapFen=500 from env override (got ${r.costCapFen})`);
  expect(r.videoCapCount === 3,                `videoCapCount=3 from env override (got ${r.videoCapCount})`);
  await cleanup(f);
}

async function caseProjectedRefuses() {
  console.log('\n[case 2] projectedCapCheck refuses big delta');
  const f = await seed('proj');
  const r = await projectedCapCheck(f.tenantId, f.userId, { addCostFen: 600, addVideos: 0 });
  expect(!r.allowed && r.reason === 'cost_cap_exceeded', 'refused with cost_cap_exceeded');
  const r2 = await projectedCapCheck(f.tenantId, f.userId, { addCostFen: 0, addVideos: 5 });
  expect(!r2.allowed && r2.reason === 'video_cap_exceeded', 'refused with video_cap_exceeded');
  await cleanup(f);
}

async function casePreflightHaltRun() {
  console.log('\n[case 3] orchestrator preflight halts when over cap');
  const f = await seed('preflight');

  // Burn the user's monthly_usage to the cap first
  const monthKey = new Date().toISOString().slice(0, 7);
  await db.insert(monthlyUsage).values({
    tenantId: f.tenantId, userId: f.userId, monthKey,
    videoCount: 0, workflowRunCount: 0, totalCostFen: 600, // already > 500
  });

  const orch = new WorkflowOrchestrator([new MockCostlyNode(100, 0)]);
  const r = await orch.run(f.runId);
  expect(r.status === 'failed',                           'run.status=failed by preflight');
  expect((r.errorMsg ?? '').includes('SPEND_CAP_EXCEEDED'), 'errorMsg mentions SPEND_CAP_EXCEEDED');

  const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(steps.length === 0,                              'no step rows created (preflight short-circuit)');

  await cleanup(f);
}

async function caseMidRunCap() {
  console.log('\n[case 4] mid-run SpendCapError halts node + bumps usage with partial');
  const f = await seed('midrun');

  // Try to burn 4 videos × 200 fen each (would total 800 fen + 4 videos).
  // Cost cap is 500 fen → should fail at iteration 3 (after 2 → 400 + projected 600 → blocks).
  const orch = new WorkflowOrchestrator([new MockProjectedNode(4)]);
  const r = await orch.run(f.runId);
  expect(r.status === 'failed',                           'status=failed mid-run');
  expect((r.errorMsg ?? '').includes('SPEND_CAP_EXCEEDED') ||
         (r.errorMsg ?? '').includes('Monthly cap exceeded'), 'errorMsg signals cap violation');

  // Even though node failed, the iterations that completed should NOT have been
  // bumped to monthly_usage because the node throws before returning. This is
  // a known limitation: per-attempt partial bumps are the node's responsibility.
  // For now we just assert run is failed and no spurious aggregate appears.
  const [usage] = await db.select().from(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  expect(!usage || usage.totalCostFen === 0,              'no partial monthly_usage bump from in-flight failure');

  await cleanup(f);
}

async function caseVideoCapIndependent() {
  console.log('\n[case 5] video cap fires before cost cap when applicable');
  const f = await seed('videocap');

  // cost = 0 but 5 videos requested → only video cap (3) applies
  const orch = new WorkflowOrchestrator([new MockCostlyNode(0, 5)]);
  // Preflight passes (zero usage); cap is checked AFTER node returns since
  // MockCostlyNode doesn't gate inside .execute(). So this passes through and
  // monthly_usage records 5 videos which is > cap. This documents that cost
  // cap framework is preflight + node-cooperative — node MUST self-gate for
  // mid-run enforcement. (VideoGenNodeRunner in W2 will use assertCapAllows.)
  await orch.run(f.runId);
  const [usage] = await db.select().from(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  expect((usage?.videoCount ?? 0) === 5,                  'naive node leaks past cap (documented W2 contract)');

  // Subsequent run preflight should now refuse
  const [run2] = await db.insert(workflowRuns).values({
    tenantId: f.tenantId, createdBy: f.userId, topic: 'second', status: 'pending',
  }).returning();
  const orch2 = new WorkflowOrchestrator([new MockCostlyNode(0, 1)]);
  const r2 = await orch2.run(run2.id);
  expect(r2.status === 'failed',                          'next run blocked by preflight (videos already > cap)');

  await cleanup(f);
}

async function main() {
  console.log('--- W1-07-V3 spend cap framework tests ---');
  console.log(`Caps: cost ${process.env.WORKFLOW_MONTHLY_COST_CAP_CNY} CNY · videos ${process.env.WORKFLOW_MONTHLY_VIDEO_CAP_COUNT}`);

  await caseFreshUserAllowed();
  await caseProjectedRefuses();
  await casePreflightHaltRun();
  await caseMidRunCap();
  await caseVideoCapIndependent();

  if (totalFailures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
  process.exit(1);
}

main().catch((e) => {
  if (e instanceof SpendCapError) console.error('Unhandled SpendCapError:', e.snapshot);
  if (e instanceof NodeError) console.error('Unhandled NodeError:', e.code, e.message);
  console.error('test errored:', e);
  process.exit(1);
});
