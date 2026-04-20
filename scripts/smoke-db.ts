// W1-03 smoke test: insert + select via Drizzle
// Run with: pnpm tsx scripts/smoke-db.ts
//
// Uses DATABASE_URL (postgres role → bypasses RLS). Cleanup at end.

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  contentSessions,
  contentScripts,
} from '../src/db';

async function main() {
  console.log('--- W1-03 Drizzle smoke test ---');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'smoke-test-tenant', region: 'CN', plan: 'solo' })
    .returning();
  console.log('1. Insert tenant →', tenant.id);

  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `smoke-${Date.now()}`,
      email:       'smoke@test.local',
      role:        'owner',
    })
    .returning();
  console.log('2. Insert user   →', user.id);

  const [session] = await db
    .insert(contentSessions)
    .values({
      tenantId:       tenant.id,
      createdBy:      user.id,
      entryPoint:     'quick_create',
      formula:        'provocation',
      lengthMode:     'short',
      productName:    'Smoke Test Product',
      targetAudience: '技术创始人',
      coreClaim:      '60 秒内说清一件事',
      status:         'generating',
    })
    .returning();
  console.log('3. Insert session →', session.id);

  const [script] = await db
    .insert(contentScripts)
    .values({
      sessionId:  session.id,
      tenantId:   tenant.id,
      frames:     [
        { index: 1, text: 'frame 1', visualDirection: null, durationS: 4 },
      ],
      charCount:  7,
      frameCount: 1,
      fullText:   'frame 1',
      provider:   'smoke',
      model:      'smoke-test',
      latencyMs:  100,
      retryCount: 0,
      isCurrent:  true,
    })
    .returning();
  console.log('4. Insert script  →', script.id);

  const readBack = await db
    .select({
      sessionId:  contentSessions.id,
      tenantName: tenants.name,
      scriptText: contentScripts.fullText,
    })
    .from(contentSessions)
    .innerJoin(tenants,         eq(tenants.id,         contentSessions.tenantId))
    .innerJoin(contentScripts,  eq(contentScripts.sessionId, contentSessions.id))
    .where(eq(contentSessions.id, session.id));
  console.log('5. Join read-back →', readBack[0]);

  await db.delete(contentScripts).where(eq(contentScripts.sessionId, session.id));
  await db.delete(contentSessions).where(eq(contentSessions.id, session.id));
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(tenants).where(eq(tenants.id, tenant.id));
  console.log('6. Cleanup done');

  console.log('\n✅ All 6 steps OK — Drizzle client read/write through RLS-enabled tables.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Smoke test failed:', e);
  process.exit(1);
});
