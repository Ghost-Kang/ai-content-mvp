// W1-04 cross-tenant probe
// Run: pnpm db:probe
//
// Verifies the app-level tenant filter used in every router WHERE clause:
// tenant A cannot read tenant B's content_sessions even when it knows
// tenant B's session ID. Simulates the contentRouter.getSession behavior
// by re-running the same Drizzle query shape with each tenant's ctx.

import { and, eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  contentSessions,
  contentScripts,
} from '../src/db';

type Fixture = {
  tenantId: string;
  userId:   string;
  sessionId: string;
};

async function seedTenant(label: string): Promise<Fixture> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `probe-${label}-${Date.now()}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `probe-${label}-${Date.now()}`,
      email:       `${label}@probe.local`,
      role:        'owner',
    })
    .returning();
  const [session] = await db
    .insert(contentSessions)
    .values({
      tenantId:       tenant.id,
      createdBy:      user.id,
      entryPoint:     'quick_create',
      formula:        'provocation',
      lengthMode:     'short',
      productName:    `${label} product`,
      targetAudience: `${label} audience`,
      coreClaim:      `${label} core claim`,
      status:         'draft',
    })
    .returning();
  return { tenantId: tenant.id, userId: user.id, sessionId: session.id };
}

// Mirrors contentRouter.getSession's WHERE clause (app-level tenant filter).
async function getSessionAs(callerTenantId: string, sessionId: string) {
  const rows = await db
    .select({ id: contentSessions.id })
    .from(contentSessions)
    .where(
      and(
        eq(contentSessions.id, sessionId),
        eq(contentSessions.tenantId, callerTenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listSessionsAs(callerTenantId: string) {
  return db
    .select({ id: contentSessions.id })
    .from(contentSessions)
    .where(eq(contentSessions.tenantId, callerTenantId));
}

async function cleanup(f: Fixture) {
  await db.delete(contentScripts).where(eq(contentScripts.sessionId, f.sessionId));
  await db.delete(contentSessions).where(eq(contentSessions.id, f.sessionId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

async function main() {
  console.log('--- W1-04 cross-tenant probe ---');

  const A = await seedTenant('A');
  const B = await seedTenant('B');
  console.log(`Seeded: A.session=${A.sessionId}  B.session=${B.sessionId}`);

  let failures = 0;
  const expect = (cond: boolean, msg: string) => {
    const tag = cond ? 'PASS' : 'FAIL';
    if (!cond) failures++;
    console.log(`  [${tag}] ${msg}`);
  };

  // 1. A reading A's session → hit
  const aSeesA = await getSessionAs(A.tenantId, A.sessionId);
  expect(aSeesA !== null, "A can read A's own session");

  // 2. A reading B's session → miss (isolation)
  const aSeesB = await getSessionAs(A.tenantId, B.sessionId);
  expect(aSeesB === null, "A cannot read B's session");

  // 3. B reading A's session → miss
  const bSeesA = await getSessionAs(B.tenantId, A.sessionId);
  expect(bSeesA === null, "B cannot read A's session");

  // 4. List scoped — A's list never contains B's id
  const aList = await listSessionsAs(A.tenantId);
  expect(
    aList.every((r) => r.id !== B.sessionId),
    "A's session list excludes B's session",
  );
  expect(
    aList.some((r) => r.id === A.sessionId),
    "A's session list includes A's own session",
  );

  console.log('\nCleanup…');
  await cleanup(A);
  await cleanup(B);

  if (failures === 0) {
    console.log('\n✅ Cross-tenant isolation holds (app-level filter, 5 assertions).');
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
