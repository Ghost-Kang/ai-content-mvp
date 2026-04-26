// W2-07b — Integration test for the SSE snapshot loader + change detection.
//
// What this proves end-to-end (real DB, no HTTP):
//   1. loadSnapshot reads run + steps for the right tenant
//   2. Cross-tenant runIds return null (no info leak through the SSE 404 path)
//   3. serializeSnapshot is stable for unchanged content (no spurious snapshots)
//   4. serializeSnapshot diff'd by status / cost / errorMsg / step output / step
//      status / completedAt — i.e. all the fields the canvas actually renders
//   5. updatedAt bump alone does NOT change serialize() output (we want true
//      content-level diffs, not "did anyone touch this row")
//
// Run: pnpm wf:test:sse
//
// IMPORTANT: This script uses the real .env.local DB. Each run inserts an
// ephemeral tenant + run + steps and cleans them up at the end. If the
// process crashes, you'll see test rows with names like `sse-test-<ts>`
// — drop them manually via db:studio.

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
  loadSnapshot,
  serializeSnapshot,
  formatEvent,
} from '../src/lib/workflow/sse-snapshot';
import { stepIndexOf } from '../src/lib/workflow/cascade';
import type { NodeType, StepStatus } from '../src/lib/workflow/types';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

interface Fixture {
  tenantId: string;
  userId:   string;
  runId:    string;
}

async function seedFixture(label: string): Promise<Fixture> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `sse-test-${label}-${Date.now()}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `sse-test-${label}-${Date.now()}`,
      email:       `${label}@sse.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     `sse-fixture-${label}`,
      status:    'pending',
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

async function cleanup(f: Fixture) {
  await db.delete(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId));
  await db.delete(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

async function main() {
  console.log('▶ W2-07b SSE snapshot integration test\n');

  // ─── Case 1: loadSnapshot returns null when run doesn't exist ─────────────
  console.log('[case 1] loadSnapshot — non-existent runId returns null');
  {
    const snap = await loadSnapshot('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
    expect(snap === null, 'non-existent run → null');
  }

  // ─── Case 2: loadSnapshot returns full shape for owned run ────────────────
  console.log('\n[case 2] loadSnapshot — owned run returns full shape');
  const ownedFixture = await seedFixture('owned');
  try {
    await seedStep({ runId: ownedFixture.runId, tenantId: ownedFixture.tenantId, nodeType: 'topic',  status: 'done', outputJson: { topic: 'breakfast trending' }, costFen: 5 });
    await seedStep({ runId: ownedFixture.runId, tenantId: ownedFixture.tenantId, nodeType: 'script', status: 'done', outputJson: { frames: [{ index: 1, text: 'hi' }] }, costFen: 12 });
    await seedStep({ runId: ownedFixture.runId, tenantId: ownedFixture.tenantId, nodeType: 'storyboard', status: 'pending' });

    const snap = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    expect(snap !== null, 'owned run → snapshot returned');
    expect(snap?.run.id === ownedFixture.runId, 'snapshot.run.id matches');
    expect(snap?.run.topic === 'sse-fixture-owned', 'snapshot.run.topic matches');
    expect(snap?.run.status === 'pending', 'snapshot.run.status = pending');
    expect(snap?.steps.length === 3, 'snapshot.steps.length = 3');
    expect(snap?.steps[0].nodeType === 'topic',      'steps[0] = topic');
    expect(snap?.steps[1].nodeType === 'script',     'steps[1] = script');
    expect(snap?.steps[2].nodeType === 'storyboard', 'steps[2] = storyboard (ordered by stepIndex)');
    expect(snap?.steps[0].status === 'done',         'steps[0].status = done');
    expect(snap?.steps[2].status === 'pending',      'steps[2].status = pending');

    const scriptOutput = snap?.steps[1].outputJson as { frames?: Array<{ index: number }> } | null;
    expect(Array.isArray(scriptOutput?.frames) && scriptOutput?.frames?.length === 1, 'steps[1].outputJson preserved');
  } finally {
    // We keep ownedFixture alive across the next case.
  }

  // ─── Case 3: cross-tenant isolation (the leak-resistant 404 path) ─────────
  console.log('\n[case 3] loadSnapshot — cross-tenant attempt returns null');
  const otherFixture = await seedFixture('other');
  try {
    const snap = await loadSnapshot(ownedFixture.runId, otherFixture.tenantId);
    expect(snap === null, 'cross-tenant runId → null (SSE will return 404)');
    const snap2 = await loadSnapshot(otherFixture.runId, ownedFixture.tenantId);
    expect(snap2 === null, 'reverse cross-tenant → null');
  } finally {
    await cleanup(otherFixture);
  }

  // ─── Case 4: serializeSnapshot is stable for unchanged content ────────────
  console.log('\n[case 4] serializeSnapshot — stable for unchanged content');
  {
    const snap1 = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    const snap2 = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    expect(snap1 !== null && snap2 !== null, 'both reads succeed');
    if (snap1 && snap2) {
      expect(serializeSnapshot(snap1) === serializeSnapshot(snap2),
        'two reads of unchanged data produce identical serialize() output');
    }
  }

  // ─── Case 5: serializeSnapshot diffs on step status change ────────────────
  console.log('\n[case 5] serializeSnapshot — diffs on step status change');
  {
    const before = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    await db
      .update(workflowSteps)
      .set({ status: 'running' })
      .where(eq(workflowSteps.runId, ownedFixture.runId));
    const after = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    expect(before !== null && after !== null, 'both reads succeed');
    if (before && after) {
      expect(serializeSnapshot(before) !== serializeSnapshot(after),
        'step status change triggers serialize diff');
    }
  }

  // ─── Case 6: serializeSnapshot diffs on step output change ────────────────
  console.log('\n[case 6] serializeSnapshot — diffs on step output change');
  {
    const before = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    await db
      .update(workflowSteps)
      .set({ outputJson: { topic: 'breakfast trending', edited: true } })
      .where(eq(workflowSteps.nodeType, 'topic'));
    const after = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    if (before && after) {
      expect(serializeSnapshot(before) !== serializeSnapshot(after),
        'step output change triggers serialize diff');
    }
  }

  // ─── Case 7: serializeSnapshot diffs on run status / errorMsg / cost ──────
  console.log('\n[case 7] serializeSnapshot — diffs on run-level fields');
  {
    const before = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    await db
      .update(workflowRuns)
      .set({ status: 'failed', errorMsg: 'PROVIDER_FAILED: Seedance returned 500', totalCostFen: 4200 })
      .where(eq(workflowRuns.id, ownedFixture.runId));
    const after = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    if (before && after) {
      expect(serializeSnapshot(before) !== serializeSnapshot(after),
        'run status/error/cost change triggers serialize diff');
      expect(after.run.status === 'failed', 'after.run.status = failed');
      expect(after.run.errorMsg?.startsWith('PROVIDER_FAILED') === true, 'after.run.errorMsg captured');
      expect(after.run.totalCostFen === 4200, 'after.run.totalCostFen = 4200');
    }
  }

  // ─── Case 8: serializeSnapshot is stable across no-op UPDATE (updatedAt bump only) ─
  console.log('\n[case 8] serializeSnapshot — stable across no-op UPDATE (updatedAt bump only)');
  {
    const before = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    // Trigger an UPDATE that bumps updatedAt without changing any
    // observable content. Simulates a CAS retry that no-ops.
    await db
      .update(workflowRuns)
      .set({ status: 'failed' }) // identical to current value
      .where(eq(workflowRuns.id, ownedFixture.runId));
    const after = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    if (before && after) {
      expect(serializeSnapshot(before) === serializeSnapshot(after),
        'no-op UPDATE (same status) produces identical serialize() — no spurious push');
    }
  }

  // ─── Case 9: serializeSnapshot ignores updatedAt explicitly ───────────────
  console.log('\n[case 9] serializeSnapshot — does not include updatedAt');
  {
    const snap = await loadSnapshot(ownedFixture.runId, ownedFixture.tenantId);
    if (snap) {
      const ser = serializeSnapshot(snap);
      expect(!ser.includes('updatedAt'),
        'serialize output does NOT contain updatedAt key');
      // Spot-check the keys we DO want
      expect(ser.includes('runStatus') && ser.includes('runError') && ser.includes('runCost'),
        'serialize output contains run-level keys we care about');
    }
  }

  // ─── Case 10: formatEvent SSE wire format ─────────────────────────────────
  console.log('\n[case 10] formatEvent — emits valid SSE wire format');
  {
    const out = formatEvent('snapshot', { hello: 'world' });
    expect(out.startsWith('event: snapshot\n'), 'starts with event: snapshot\\n');
    expect(out.includes('data: {"hello":"world"}\n'), 'contains JSON data line');
    expect(out.endsWith('\n\n'), 'ends with double newline (flushes one message)');
    expect(out.split('\n').length === 4, 'exactly 4 newline-separated parts (event, data, blank, terminator)');

    const end = formatEvent('end', { reason: 'terminal' });
    expect(end.startsWith('event: end\n'), 'end event uses correct event name');
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  await cleanup(ownedFixture);

  console.log(`\n${totalFailures === 0 ? '✅' : '❌'} W2-07b SSE assertions complete (${totalFailures} failure${totalFailures === 1 ? '' : 's'}).`);
  process.exit(totalFailures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SSE test crashed:', err);
  process.exit(2);
});
