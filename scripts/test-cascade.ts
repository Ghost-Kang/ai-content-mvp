// W3-06 — unit tests for the cascade engine + orchestrator resume mode.
//
// Covers:
//   1. evaluateStepAction — pure permission matrix (no DB)
//   2. markDownstreamDirty — only done/skipped/failed rows past anchor flip to dirty
//   3. applyStepEdit — output overwritten, downstream → dirty, run → pending
//   4. applyStepRetry — step → pending, downstream → dirty, run → pending
//   5. applyStepSkip — step → skipped, downstream → dirty, run → pending
//   6. orchestrator resume — done steps skipped + outputs hydrated, dirty steps re-run
//   7. tenant isolation — markDownstreamDirty refuses cross-tenant runIds
//
// Run: pnpm wf:test:cascade

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  monthlyUsage,
} from '../src/db';
import {
  applyStepEdit,
  applyStepRetry,
  applyStepSkip,
  evaluateStepAction,
  markDownstreamDirty,
  snapshotRunSteps,
  stepIndexOf,
} from '../src/lib/workflow/cascade';
import { NodeRunner } from '../src/lib/workflow/node-runner';
import { WorkflowOrchestrator } from '../src/lib/workflow/orchestrator';
import {
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
  type NodeType,
  type StepStatus,
} from '../src/lib/workflow/types';

// ─── Tiny test harness (matches test-workflow-runner.ts style) ────────────────

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

// ─── Fixture helpers ──────────────────────────────────────────────────────────

async function seedRun(label: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `cascade-${label}-${Date.now()}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `cascade-${label}-${Date.now()}`,
      email:       `${label}@cascade.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     `cascade-fixture-${label}`,
      status:    'done',  // start "done" so we can test the resume path explicitly
    })
    .returning();
  return { tenantId: tenant.id, userId: user.id, runId: run.id };
}

async function seedStep(args: {
  runId:    string;
  tenantId: string;
  nodeType: NodeType;
  status:   StepStatus;
  outputJson?: object;
  costFen?: number;
}) {
  const [step] = await db
    .insert(workflowSteps)
    .values({
      runId:      args.runId,
      tenantId:   args.tenantId,
      nodeType:   args.nodeType,
      stepIndex:  stepIndexOf(args.nodeType),
      status:     args.status,
      outputJson: args.outputJson ?? {},
      costFen:    args.costFen ?? 0,
    })
    .returning();
  return step;
}

async function cleanup(f: { tenantId: string; userId: string; runId: string }) {
  await db.delete(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId));
  await db.delete(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

// ─── Mock node for resume tests ───────────────────────────────────────────────

class MockNode extends NodeRunner<unknown, { tag: string; usedUpstream?: unknown }> {
  public invocations = 0;
  /** Capture the upstream payload the node observed when invoked. */
  public seenUpstream: unknown = undefined;

  constructor(
    private readonly nodeType: NodeType,
    private readonly tag: string,
    private readonly costFen: number = 0,
    private readonly upstreamRequired: ReadonlyArray<NodeType> = [],
  ) {
    super();
  }

  get descriptor(): NodeDescriptor {
    return {
      nodeType:         this.nodeType,
      stepIndex:        stepIndexOf(this.nodeType),
      maxRetries:       0,
      upstreamRequired: this.upstreamRequired,
    };
  }

  protected buildInput(ctx: NodeContext): unknown {
    if (this.upstreamRequired.length === 0) return { topic: ctx.topic };
    const u = this.upstreamRequired[0];
    this.seenUpstream = ctx.upstreamOutputs[u];
    return this.seenUpstream;
  }

  protected async execute(input: unknown): Promise<NodeResult<{ tag: string; usedUpstream?: unknown }>> {
    this.invocations++;
    return {
      output:  { tag: this.tag, usedUpstream: input },
      costFen: this.costFen,
    };
  }
}

// ─── Case 1: evaluateStepAction permission matrix ─────────────────────────────

function caseEvaluateStepAction() {
  console.log('\n[case 1] evaluateStepAction — pure permission matrix');

  // edit
  expect(evaluateStepAction({ nodeType: 'script', stepStatus: 'done', runStatus: 'done', action: 'edit' }).allowed,
    'edit allowed: script + done step + idle run');
  expect(evaluateStepAction({ nodeType: 'video', stepStatus: 'done', runStatus: 'done', action: 'edit' }).reason === 'NODE_NOT_EDITABLE',
    'edit rejected: video is not in EDITABLE_NODES');
  expect(evaluateStepAction({ nodeType: 'script', stepStatus: 'failed', runStatus: 'done', action: 'edit' }).reason === 'STATUS_NOT_EDITABLE',
    'edit rejected: failed steps are not editable (must retry first)');
  expect(evaluateStepAction({ nodeType: 'script', stepStatus: 'done', runStatus: 'running', action: 'edit' }).reason === 'RUN_RUNNING',
    'edit rejected: run is currently running');

  // retry
  expect(evaluateStepAction({ nodeType: 'script', stepStatus: 'failed', runStatus: 'failed', action: 'retry' }).allowed,
    'retry allowed: script failed step');
  expect(evaluateStepAction({ nodeType: 'storyboard', stepStatus: 'dirty', runStatus: 'failed', action: 'retry' }).allowed,
    'retry allowed: storyboard dirty step');
  expect(evaluateStepAction({ nodeType: 'script', stepStatus: 'done', runStatus: 'done', action: 'retry' }).reason === 'STATUS_NOT_RETRYABLE',
    'retry rejected: done steps cannot be retried (use edit if you want to change content)');
  expect(evaluateStepAction({ nodeType: 'video', stepStatus: 'failed', runStatus: 'running', action: 'retry' }).reason === 'RUN_RUNNING',
    'retry rejected when run is running');

  // skip
  expect(evaluateStepAction({ nodeType: 'export', stepStatus: 'failed', runStatus: 'failed', action: 'skip' }).allowed,
    'skip allowed: export failed step');
  expect(evaluateStepAction({ nodeType: 'export', stepStatus: 'done', runStatus: 'done', action: 'skip' }).reason === 'STATUS_NOT_SKIPPABLE',
    'skip rejected: done steps cannot be skipped');
}

// ─── Case 2: markDownstreamDirty respects stepIndex + status filter ───────────

async function caseMarkDownstreamDirty() {
  console.log('\n[case 2] markDownstreamDirty — only done/skipped/failed rows downstream of anchor flip');
  const f = await seedRun('mark-dirty');

  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'script',     status: 'done', outputJson: { tag: 's' } });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'storyboard', status: 'done', outputJson: { tag: 'b' } });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'video',      status: 'failed' });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'export',     status: 'pending' }); // pending → unchanged

  const cascaded = await markDownstreamDirty(f.runId, f.tenantId, stepIndexOf('script'));
  expect(cascaded === 2, `2 rows cascaded (storyboard + video; export pending stays pending) — got ${cascaded}`);

  const snap = await snapshotRunSteps(f.runId, f.tenantId);
  const byNode = new Map(snap.map((s) => [s.nodeType, s.status]));
  expect(byNode.get('script') === 'done',     'script (anchor) status preserved');
  expect(byNode.get('storyboard') === 'dirty', 'storyboard cascaded done → dirty');
  expect(byNode.get('video') === 'dirty',      'video cascaded failed → dirty');
  expect(byNode.get('export') === 'pending',   'export pending status preserved (only done/skipped/failed cascade)');

  await cleanup(f);
}

// ─── Case 3: applyStepEdit writes output + cascades + resets run ──────────────

async function caseApplyStepEdit() {
  console.log('\n[case 3] applyStepEdit — write output, cascade downstream, reset run');
  const f = await seedRun('edit');

  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'script',     status: 'done', outputJson: { frames: [{ index: 1, text: 'old' }] } });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'storyboard', status: 'done', outputJson: { frames: [{ index: 1 }] } });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'video',      status: 'done', outputJson: {} });

  const newOutput = { frames: [{ index: 1, text: 'NEW EDITED TEXT' }] };
  const r = await applyStepEdit({
    runId: f.runId, tenantId: f.tenantId, nodeType: 'script', outputJson: newOutput,
  });
  expect(r.cascadedCount === 2, `cascadedCount=2 (storyboard+video) — got ${r.cascadedCount}`);

  const [scriptRow] = await db.select().from(workflowSteps)
    .where(eq(workflowSteps.runId, f.runId));
  // grab via filter — order isn't guaranteed
  const rows = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  const script = rows.find((r) => r.nodeType === 'script')!;
  const story  = rows.find((r) => r.nodeType === 'storyboard')!;
  const video  = rows.find((r) => r.nodeType === 'video')!;

  // jsonb roundtrip doesn't preserve key order — compare semantic equality.
  const stored = script.outputJson as { frames: Array<{ index: number; text: string }> };
  expect(
    Array.isArray(stored.frames)
      && stored.frames.length === 1
      && stored.frames[0]?.index === 1
      && stored.frames[0]?.text === 'NEW EDITED TEXT',
    'script.outputJson overwritten with edited payload',
  );
  expect(script.status === 'done', 'script status remains done after edit');
  expect(story.status === 'dirty', 'storyboard cascaded → dirty');
  expect(video.status === 'dirty', 'video cascaded → dirty');

  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, f.runId));
  expect(run.status === 'pending',     'run.status reset to pending (ready for resume)');
  expect(run.errorMsg === null,        'run.errorMsg cleared');
  expect(run.completedAt === null,     'run.completedAt cleared');

  // suppress unused warning
  void scriptRow;
  await cleanup(f);
}

// ─── Case 4: applyStepRetry sets target → pending + cascades ──────────────────

async function caseApplyStepRetry() {
  console.log('\n[case 4] applyStepRetry — target → pending, downstream → dirty');
  const f = await seedRun('retry');

  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'script',     status: 'done' });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'storyboard', status: 'failed' });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'video',      status: 'done' });

  const r = await applyStepRetry({ runId: f.runId, tenantId: f.tenantId, nodeType: 'storyboard' });
  expect(r.cascadedCount === 1, `cascadedCount=1 (only video downstream of storyboard) — got ${r.cascadedCount}`);

  const rows = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  const script = rows.find((r) => r.nodeType === 'script')!;
  const story  = rows.find((r) => r.nodeType === 'storyboard')!;
  const video  = rows.find((r) => r.nodeType === 'video')!;

  expect(script.status === 'done',    'upstream script preserved');
  expect(story.status === 'pending',  'storyboard reset to pending (ready to re-run)');
  expect(story.errorMsg === null,     'storyboard errorMsg cleared');
  expect(video.status === 'dirty',    'video cascaded → dirty');

  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, f.runId));
  expect(run.status === 'pending', 'run.status reset to pending');

  await cleanup(f);
}

// ─── Case 5: applyStepSkip marks skipped + cascades ───────────────────────────

async function caseApplyStepSkip() {
  console.log('\n[case 5] applyStepSkip — target → skipped, downstream → dirty');
  const f = await seedRun('skip');

  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'video',  status: 'failed' });
  await seedStep({ runId: f.runId, tenantId: f.tenantId, nodeType: 'export', status: 'done' });

  // Skip video (in MVP-1 the tRPC layer prevents this — but the helper itself
  // is generic so we test the mechanics here directly).
  const r = await applyStepSkip({ runId: f.runId, tenantId: f.tenantId, nodeType: 'video' });
  expect(r.cascadedCount === 1, `cascadedCount=1 (export downstream) — got ${r.cascadedCount}`);

  const rows = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  const video  = rows.find((r) => r.nodeType === 'video')!;
  const export_ = rows.find((r) => r.nodeType === 'export')!;
  expect(video.status === 'skipped',   'video status → skipped');
  expect(video.errorMsg === null,      'video errorMsg cleared');
  expect(export_.status === 'dirty',   'export cascaded → dirty');

  await cleanup(f);
}

// ─── Case 6: orchestrator resume mode hydrates done steps ─────────────────────

async function caseOrchestratorResume() {
  console.log('\n[case 6] orchestrator resume — done steps skipped + outputs hydrated, costs folded');
  const f = await seedRun('resume');
  // Pre-seed: script done with output {tag:'pre-script'}, costFen=42
  // storyboard dirty (will re-run), video pending (will run)
  await seedStep({
    runId: f.runId, tenantId: f.tenantId, nodeType: 'script',
    status: 'done', outputJson: { tag: 'pre-script' }, costFen: 42,
  });
  await seedStep({
    runId: f.runId, tenantId: f.tenantId, nodeType: 'storyboard',
    status: 'dirty', outputJson: { tag: 'stale-storyboard' }, costFen: 0,
  });
  // video has no row yet (typical for runs that never reached video before).

  // Reset run to pending to mirror what apply* helpers do.
  await db.update(workflowRuns).set({ status: 'pending', completedAt: null })
    .where(eq(workflowRuns.id, f.runId));

  const scriptNode  = new MockNode('script',     'NEW-script', 100);
  const storyNode   = new MockNode('storyboard', 'NEW-story',  10, ['script']);
  const videoNode   = new MockNode('video',      'NEW-video',  500, ['storyboard']);

  const orch = new WorkflowOrchestrator([scriptNode, storyNode, videoNode]);
  const result = await orch.run(f.runId);

  expect(result.status === 'done',                   `run.status=done — got ${result.status}`);
  expect(scriptNode.invocations === 0,               `script SKIPPED (already done) — invocations=${scriptNode.invocations}`);
  expect(storyNode.invocations === 1,                `storyboard re-ran (was dirty) — invocations=${storyNode.invocations}`);
  expect(videoNode.invocations === 1,                `video ran (was missing) — invocations=${videoNode.invocations}`);

  // Storyboard should have seen the HYDRATED script output, not re-run it.
  const seen = storyNode.seenUpstream as { tag?: string } | undefined;
  expect(seen?.tag === 'pre-script',                 `storyboard ctx.upstream.script.tag === "pre-script" (hydrated) — got "${seen?.tag}"`);

  // Cost folding: 42 (script preserved) + 10 (storyboard re-ran) + 500 (video) = 552
  expect(result.totalCostFen === 552,                `totalCostFen=552 (folded preserved + new) — got ${result.totalCostFen}`);

  // The persisted run row should match the in-memory result.
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, f.runId));
  expect(run.status === 'done',                      'persisted run.status=done');
  expect(run.totalCostFen === 552,                   `persisted totalCostFen=552 — got ${run.totalCostFen}`);

  // Step rows: script untouched, storyboard now done with NEW output, video new+done
  const rows = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  const script = rows.find((r) => r.nodeType === 'script')!;
  const story  = rows.find((r) => r.nodeType === 'storyboard')!;
  const video  = rows.find((r) => r.nodeType === 'video')!;
  expect((script.outputJson as { tag?: string }).tag === 'pre-script',     'script outputJson untouched (resume skipped re-execution)');
  expect((story.outputJson as { tag?: string }).tag === 'NEW-story',       'storyboard outputJson rewritten by re-execution');
  expect(story.status === 'done',                                          'storyboard status flipped dirty → done');
  expect(video.status === 'done',                                          'video step row created + done');

  await cleanup(f);
}

// ─── Case 7: tenant isolation ─────────────────────────────────────────────────

async function caseTenantIsolation() {
  console.log('\n[case 7] tenant isolation — markDownstreamDirty refuses cross-tenant runIds');
  const fA = await seedRun('tenantA');
  const fB = await seedRun('tenantB');

  await seedStep({ runId: fA.runId, tenantId: fA.tenantId, nodeType: 'script',     status: 'done' });
  await seedStep({ runId: fA.runId, tenantId: fA.tenantId, nodeType: 'storyboard', status: 'done' });

  // Attacker uses fA.runId but fB.tenantId — should mutate 0 rows.
  const cascaded = await markDownstreamDirty(fA.runId, fB.tenantId, stepIndexOf('script'));
  expect(cascaded === 0, `cross-tenant cascade affected 0 rows (got ${cascaded})`);

  const rows = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, fA.runId));
  expect(rows.every((r) => r.status === 'done'), 'tenant A rows untouched after cross-tenant attempt');

  await cleanup(fA);
  await cleanup(fB);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- W3-06 cascade engine + orchestrator resume tests ---');

  caseEvaluateStepAction();
  await caseMarkDownstreamDirty();
  await caseApplyStepEdit();
  await caseApplyStepRetry();
  await caseApplyStepSkip();
  await caseOrchestratorResume();
  await caseTenantIsolation();

  if (totalFailures === 0) {
    console.log('\n✅ All W3-06 assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
  process.exit(1);
}

main().catch((e) => {
  console.error('test errored:', e);
  process.exit(1);
});
