// W1-02-V3 unit-style test for the NodeRunner state machine + Orchestrator.
//
// Uses mock nodes (no LLM calls) to verify:
//   1. happy path: 3 mock nodes all succeed → run.status=done, monthly_usage upserted
//   2. retry: 1 mock node fails-then-succeeds → run.status=done, retry_count=1
//   3. final fail: 1 mock node hard-fails → run.status=failed, errorMsg set
//   4. cascade: failed node halts orchestrator (downstream not invoked)
//
// Run: pnpm wf:test

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
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
  type NodeType,
} from '../src/lib/workflow/types';

// ─── Mock NodeRunner ──────────────────────────────────────────────────────────

interface MockBehavior {
  /** failures-then-success. e.g. [false, true] = fail once, succeed second. */
  attempts: ReadonlyArray<boolean>;
  costFen?: number;
  videoCount?: number;
  retryable?: boolean;
}

class MockNode extends NodeRunner<unknown, { tag: string; attempt: number }> {
  public invocations = 0;
  public attemptIndex = 0;

  constructor(
    private readonly tag: string,
    private readonly nodeType: NodeType,
    private readonly stepIndex: number,
    private readonly behavior: MockBehavior,
  ) {
    super();
  }

  get descriptor(): NodeDescriptor {
    return {
      nodeType:         this.nodeType,
      stepIndex:        this.stepIndex,
      maxRetries:       this.behavior.attempts.length - 1,
      upstreamRequired: [],
    };
  }

  protected buildInput(_ctx: NodeContext): unknown {
    return { tag: this.tag };
  }

  protected async execute(): Promise<NodeResult<{ tag: string; attempt: number }>> {
    this.invocations++;
    const ok = this.behavior.attempts[this.attemptIndex] ?? false;
    const current = this.attemptIndex;
    this.attemptIndex++;
    if (!ok) {
      throw new NodeError(
        'PROVIDER_FAILED',
        `mock fail attempt ${current}`,
        this.behavior.retryable ?? true,
      );
    }
    return {
      output:     { tag: this.tag, attempt: current },
      costFen:    this.behavior.costFen ?? 0,
      videoCount: this.behavior.videoCount ?? 0,
    };
  }
}

// ─── Test harness ─────────────────────────────────────────────────────────────

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

async function seedFixture(label: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `wf-test-${label}-${Date.now()}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `wf-test-${label}-${Date.now()}`,
      email:       `${label}@wf.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     `mock topic ${label}`,
      status:    'pending',
    })
    .returning();
  return { tenantId: tenant.id, userId: user.id, runId: run.id };
}

async function cleanup(f: { tenantId: string; userId: string; runId: string }) {
  await db.delete(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappyPath() {
  console.log('\n[case 1] happy path — 3 nodes, all succeed first try');
  const f = await seedFixture('happy');
  const nodes = [
    new MockNode('a', 'script',     1, { attempts: [true],  costFen: 100 }),
    new MockNode('b', 'storyboard', 2, { attempts: [true],  costFen: 50  }),
    new MockNode('c', 'video',      3, { attempts: [true],  costFen: 600, videoCount: 3 }),
  ];
  const orch = new WorkflowOrchestrator(nodes);
  const r = await orch.run(f.runId);

  expect(r.status === 'done',                      'run.status === done');
  expect(r.totalCostFen === 750,                   `totalCostFen 750 (got ${r.totalCostFen})`);
  expect(r.totalVideoCount === 3,                  `totalVideoCount 3 (got ${r.totalVideoCount})`);
  expect(nodes[0].invocations === 1 && nodes[1].invocations === 1 && nodes[2].invocations === 1,
                                                   'each node invoked exactly once');

  const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(steps.length === 3,                       `3 step rows persisted (got ${steps.length})`);
  expect(steps.every((s) => s.status === 'done'),  'all steps status=done');

  const [usage] = await db.select().from(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  expect(usage?.videoCount === 3,                  `monthly_usage.video_count = 3 (got ${usage?.videoCount})`);
  expect(usage?.totalCostFen === 750,              `monthly_usage.total_cost_fen = 750 (got ${usage?.totalCostFen})`);

  await cleanup(f);
}

async function caseRetryThenSucceed() {
  console.log('\n[case 2] retry — node fails once, succeeds second attempt');
  const f = await seedFixture('retry');
  const nodes = [
    new MockNode('a', 'script', 1, { attempts: [false, true], costFen: 200, retryable: true }),
  ];
  const orch = new WorkflowOrchestrator(nodes);
  const r = await orch.run(f.runId);

  expect(r.status === 'done',                      'run.status === done after retry');
  expect(nodes[0].invocations === 2,               `node invoked 2 times (got ${nodes[0].invocations})`);

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.retryCount === 1,                   `step.retry_count = 1 (got ${step?.retryCount})`);
  expect(step?.status === 'done',                  'step.status = done');
  expect(step?.errorMsg === null,                  'step.error_msg cleared on success');

  await cleanup(f);
}

async function caseFinalFail() {
  console.log('\n[case 3] final fail — non-retryable error halts run');
  const f = await seedFixture('fail');
  const nodes = [
    new MockNode('a', 'script', 1, { attempts: [false], costFen: 0, retryable: false }),
  ];
  const orch = new WorkflowOrchestrator(nodes);
  const r = await orch.run(f.runId);

  expect(r.status === 'failed',                    'run.status === failed');
  expect(typeof r.errorMsg === 'string' && r.errorMsg.includes('mock fail'),
                                                   'errorMsg includes underlying message');

  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, f.runId));
  expect(run.status === 'failed',                  'workflow_runs.status persisted as failed');
  expect(typeof run.errorMsg === 'string' && run.errorMsg.includes('script'),
                                                   'workflow_runs.error_msg includes node name');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                'step.status = failed');

  await cleanup(f);
}

async function caseCascadeHalt() {
  console.log('\n[case 4] cascade — failure in node 2 prevents node 3 from running');
  const f = await seedFixture('cascade');
  const nodes = [
    new MockNode('a', 'script',     1, { attempts: [true],  costFen: 100 }),
    new MockNode('b', 'storyboard', 2, { attempts: [false], costFen: 0, retryable: false }),
    new MockNode('c', 'video',      3, { attempts: [true],  costFen: 600 }),
  ];
  const orch = new WorkflowOrchestrator(nodes);
  await orch.run(f.runId);

  expect(nodes[0].invocations === 1,               'node 1 ran once');
  expect(nodes[1].invocations === 1,               'node 2 ran once and failed');
  expect(nodes[2].invocations === 0,               'node 3 NEVER invoked (cascade halt)');

  const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(steps.length === 2,                       `only 2 step rows (no row for node 3); got ${steps.length}`);

  await cleanup(f);
}

async function main() {
  console.log('--- W1-02-V3 NodeRunner + Orchestrator unit tests ---');

  await caseHappyPath();
  await caseRetryThenSucceed();
  await caseFinalFail();
  await caseCascadeHalt();

  if (totalFailures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
  process.exit(1);
}

main().catch((e) => {
  console.error('test errored:', e);
  process.exit(1);
});
