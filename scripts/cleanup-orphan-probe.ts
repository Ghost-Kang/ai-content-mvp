// One-shot — purge probe-leftover tenant whose cleanup() failed pre-fix.
// Safe to re-run; only deletes tenants whose name matches `wf-probe-%`.

import { eq, like } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  monthlyUsage,
  llmSpendDaily,
} from '../src/db';

async function main() {
  const orphans = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(like(tenants.name, 'wf-probe-%'));

  if (orphans.length === 0) {
    console.log('no orphan probe tenants found.');
    return;
  }

  console.log(`found ${orphans.length} orphan probe tenant(s):`);
  for (const t of orphans) console.log(`  - ${t.id}  ${t.name}`);

  for (const t of orphans) {
    await db.delete(monthlyUsage).where(eq(monthlyUsage.tenantId, t.id));
    const runs = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.tenantId, t.id));
    for (const r of runs) {
      await db.delete(workflowRuns).where(eq(workflowRuns.id, r.id));
    }
    await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, t.id));
    await db.delete(users).where(eq(users.tenantId, t.id));
    await db.delete(tenants).where(eq(tenants.id, t.id));
    console.log(`  ✓ purged ${t.id}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
