// W1-01-V3 cross-tenant probe for v3 workflow tables.
// Run: pnpm db:probe:v3
//
// Mirrors probe-cross-tenant.ts but validates app-level tenant filter on
// workflow_runs / workflow_steps / topic_pushes / monthly_usage.
//
// (Drizzle connects as the postgres role and bypasses Postgres RLS — same
//  caveat as W1-04. The real edge is the WHERE clause we put in every router.)

import { and, eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  topicPushes,
  monthlyUsage,
} from '../src/db';

type Fixture = {
  tenantId: string;
  userId:   string;
  runId:    string;
  pushId:   string;
  usageId:  string;
};

async function seedTenant(label: string): Promise<Fixture> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `probe-v3-${label}-${Date.now()}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `probe-v3-${label}-${Date.now()}`,
      email:       `${label}-v3@probe.local`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     `${label} probe topic`,
      status:    'pending',
    })
    .returning();
  await db.insert(workflowSteps).values({
    runId:     run.id,
    tenantId:  tenant.id,
    nodeType:  'script',
    stepIndex: 1,
    status:    'pending',
  });
  const today = new Date().toISOString().slice(0, 10);
  const [push] = await db
    .insert(topicPushes)
    .values({
      tenantId:   tenant.id,
      userId:     user.id,
      pushDate:   today,
      source:     'manual',
      topicsJson: [{ rank: 1, title: `${label} topic` }],
    })
    .returning();
  const [usage] = await db
    .insert(monthlyUsage)
    .values({
      tenantId:  tenant.id,
      userId:    user.id,
      monthKey:  today.slice(0, 7),
    })
    .returning();
  return {
    tenantId: tenant.id,
    userId:   user.id,
    runId:    run.id,
    pushId:   push.id,
    usageId:  usage.id,
  };
}

// Mirrors what every workflow tRPC procedure should do.
async function getRunAs(callerTenantId: string, runId: string) {
  const rows = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.tenantId, callerTenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listStepsAs(callerTenantId: string, runId: string) {
  return db
    .select({ id: workflowSteps.id, nodeType: workflowSteps.nodeType })
    .from(workflowSteps)
    .where(
      and(
        eq(workflowSteps.runId, runId),
        eq(workflowSteps.tenantId, callerTenantId),
      ),
    );
}

async function getPushAs(callerTenantId: string, pushId: string) {
  const rows = await db
    .select({ id: topicPushes.id })
    .from(topicPushes)
    .where(
      and(
        eq(topicPushes.id, pushId),
        eq(topicPushes.tenantId, callerTenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getUsageAs(callerTenantId: string, usageId: string) {
  const rows = await db
    .select({ id: monthlyUsage.id })
    .from(monthlyUsage)
    .where(
      and(
        eq(monthlyUsage.id, usageId),
        eq(monthlyUsage.tenantId, callerTenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function cleanup(f: Fixture) {
  await db.delete(monthlyUsage).where(eq(monthlyUsage.id, f.usageId));
  await db.delete(topicPushes).where(eq(topicPushes.id, f.pushId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId)); // cascade kills steps
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

async function main() {
  console.log('--- W1-01-V3 cross-tenant probe (4 v3 tables) ---');

  const A = await seedTenant('A');
  const B = await seedTenant('B');
  console.log(`Seeded:
  A.run=${A.runId.slice(0, 8)}  A.push=${A.pushId.slice(0, 8)}  A.usage=${A.usageId.slice(0, 8)}
  B.run=${B.runId.slice(0, 8)}  B.push=${B.pushId.slice(0, 8)}  B.usage=${B.usageId.slice(0, 8)}`);

  let failures = 0;
  const expect = (cond: boolean, msg: string) => {
    const tag = cond ? 'PASS' : 'FAIL';
    if (!cond) failures++;
    console.log(`  [${tag}] ${msg}`);
  };

  // workflow_runs
  expect((await getRunAs(A.tenantId, A.runId)) !== null,  "A reads A's run");
  expect((await getRunAs(A.tenantId, B.runId)) === null,  "A blocked from B's run");
  expect((await getRunAs(B.tenantId, A.runId)) === null,  "B blocked from A's run");

  // workflow_steps (scoped to a run + tenant)
  const aSeesAsteps = await listStepsAs(A.tenantId, A.runId);
  expect(aSeesAsteps.length === 1, "A reads A's run steps");
  const aSeesBsteps = await listStepsAs(A.tenantId, B.runId);
  expect(aSeesBsteps.length === 0, "A blocked from B's run steps");

  // topic_pushes
  expect((await getPushAs(A.tenantId, A.pushId)) !== null, "A reads A's push");
  expect((await getPushAs(A.tenantId, B.pushId)) === null, "A blocked from B's push");

  // monthly_usage
  expect((await getUsageAs(A.tenantId, A.usageId)) !== null, "A reads A's usage");
  expect((await getUsageAs(A.tenantId, B.usageId)) === null, "A blocked from B's usage");

  console.log('\nCleanup…');
  await cleanup(A);
  await cleanup(B);

  if (failures === 0) {
    console.log('\n✅ Cross-tenant isolation holds on all 4 v3 tables (8 assertions).');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Probe errored:', e);
  process.exit(1);
});
