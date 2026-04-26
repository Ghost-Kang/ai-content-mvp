// W1-01-V3 smoke test: insert + select for the 4 v3 workflow tables.
// Run: pnpm db:smoke:v3
//
// Uses DATABASE_URL (postgres role → bypasses RLS). Cleanup at end.

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  topicPushes,
  monthlyUsage,
} from '../src/db';

async function main() {
  console.log('--- W1-01-V3 v3 workflow smoke test ---');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'smoke-v3-tenant', region: 'CN', plan: 'solo' })
    .returning();
  console.log('1. tenant       →', tenant.id);

  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `smoke-v3-${Date.now()}`,
      email:       'smoke-v3@test.local',
      role:        'owner',
    })
    .returning();
  console.log('2. user         →', user.id);

  // ─── workflow_runs ──────────────────────────────────────────────────────────
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:        tenant.id,
      createdBy:       user.id,
      topic:           '60秒讲清楚 SaaS 产品定价策略',
      status:          'running',
      startedAt:       new Date(),
    })
    .returning();
  console.log('3. workflow_run →', run.id);

  // ─── workflow_steps (5 nodes) ───────────────────────────────────────────────
  const NODE_SEQ = ['topic', 'script', 'storyboard', 'video', 'export'] as const;
  const stepRows = await db
    .insert(workflowSteps)
    .values(
      NODE_SEQ.map((nt, i) => ({
        runId:      run.id,
        tenantId:   tenant.id,
        nodeType:   nt,
        stepIndex:  i,
        status:     i === 0 ? ('done' as const) : ('pending' as const),
        inputJson:  i === 0 ? { topic: run.topic } : {},
        outputJson: i === 0 ? { picked: run.topic } : {},
        costFen:    0,
        startedAt:  i === 0 ? new Date() : null,
        completedAt: i === 0 ? new Date() : null,
      })),
    )
    .returning();
  console.log(`4. workflow_steps × ${stepRows.length} (5 nodes seeded)`);

  // ─── topic_pushes ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [push] = await db
    .insert(topicPushes)
    .values({
      tenantId:    tenant.id,
      userId:      user.id,
      pushDate:    today,
      source:      'feigua',
      topicsJson:  [
        { rank: 1, title: 'SaaS 定价心理学', plays: 1_200_000, hotness: 95, category: '商业' },
        { rank: 2, title: '小团队如何 30 天找到 PMF', plays: 980_000, hotness: 89, category: '创业' },
      ],
    })
    .returning();
  console.log('5. topic_push   →', push.id);

  // ─── monthly_usage ──────────────────────────────────────────────────────────
  const monthKey = today.slice(0, 7); // YYYY-MM
  const [usage] = await db
    .insert(monthlyUsage)
    .values({
      tenantId:          tenant.id,
      userId:            user.id,
      monthKey,
      videoCount:        5,
      workflowRunCount:  1,
      totalCostFen:      3000, // ¥30
    })
    .returning();
  console.log('6. monthly_usage →', usage.id);

  // ─── Join read-back ────────────────────────────────────────────────────────
  const readBack = await db
    .select({
      runId:      workflowRuns.id,
      topic:      workflowRuns.topic,
      stepCount:  workflowSteps.id,        // counted via length below
      tenantName: tenants.name,
    })
    .from(workflowRuns)
    .innerJoin(tenants, eq(tenants.id, workflowRuns.tenantId))
    .innerJoin(workflowSteps, eq(workflowSteps.runId, workflowRuns.id))
    .where(eq(workflowRuns.id, run.id));
  console.log(`7. join read-back → ${readBack.length} step rows for run ${run.id.slice(0, 8)}…`);

  if (readBack.length !== 5) throw new Error(`expected 5 step join rows, got ${readBack.length}`);

  // ─── Cascade delete check (workflow_steps ON DELETE CASCADE) ────────────────
  await db.delete(workflowRuns).where(eq(workflowRuns.id, run.id));
  const remaining = await db
    .select({ id: workflowSteps.id })
    .from(workflowSteps)
    .where(eq(workflowSteps.runId, run.id));
  if (remaining.length !== 0) throw new Error(`expected cascade delete, ${remaining.length} steps remain`);
  console.log('8. cascade delete verified (steps gone with run)');

  // ─── Cleanup ────────────────────────────────────────────────────────────────
  await db.delete(monthlyUsage).where(eq(monthlyUsage.id, usage.id));
  await db.delete(topicPushes).where(eq(topicPushes.id, push.id));
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(tenants).where(eq(tenants.id, tenant.id));
  console.log('9. cleanup done');

  console.log('\n✅ All 9 steps OK — v3 workflow tables read/write + cascade + join verified.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ v3 smoke test failed:', e);
  process.exit(1);
});
