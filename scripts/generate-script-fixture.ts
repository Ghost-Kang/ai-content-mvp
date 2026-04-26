// One-off — Generate `fixtures/script-output-sample.json` by running the real
// ScriptNodeRunner once. Used as deterministic input for downstream node probes
// (storyboard W2-01, video W2-05) so they don't pay the script LLM tax on every
// run, but still operate on production-shape data.
//
// Run: pnpm tsx --env-file=.env.local scripts/generate-script-fixture.ts
// Cost: ~¥0.05 KIMI. Idempotent: re-run overwrites fixture in place.

import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  llmSpendDaily,
} from '../src/db';
import { ScriptNodeRunner } from '../src/lib/workflow/nodes/script';

// One of the 4 topics that successfully ran in W1-06 probe (2026-04-23).
const TOPIC = '为什么 SaaS 产品免费试用反而留不住用户';

const FIXTURE_REL_PATH = 'scripts/fixtures/script-output-sample.json';

async function main() {
  console.log('--- generate-script-fixture ---');
  console.log(`topic: ${TOPIC}`);

  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `fixture-gen-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `fixture-gen-${ts}`,
      email:       `fixture-${ts}@gen.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     TOPIC,
      status:    'pending',
    })
    .returning({ id: workflowRuns.id });

  try {
    const runner = new ScriptNodeRunner();
    const result = await runner.run({
      runId:    run.id,
      tenantId: tenant.id,
      userId:   user.id,
      region:   'CN',
      plan:     'solo',
      topic:    TOPIC,
      upstreamOutputs: {},
    });

    const fixturePath = path.resolve(__dirname, '..', FIXTURE_REL_PATH);
    await fs.mkdir(path.dirname(fixturePath), { recursive: true });

    const fixture = {
      _meta: {
        topic:        TOPIC,
        generatedAt:  new Date().toISOString(),
        sourceCommit: 'W1-04-V3 ScriptNodeRunner',
        provider:     result.output.provider,
        model:        result.output.model,
        latencyMs:    result.output.latencyMs,
        retryCount:   result.output.retryCount,
        qualityIssue: result.output.qualityIssue,
      },
      output: result.output,
    };

    await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2), 'utf8');

    console.log('');
    console.log(`✅ fixture written → ${path.relative(process.cwd(), fixturePath)}`);
    console.log(`   charCount=${result.output.charCount}  frameCount=${result.output.frameCount}`);
    console.log(`   provider=${result.output.provider}  model=${result.output.model}`);
    console.log(`   latencyMs=${result.output.latencyMs}  retries=${result.output.retryCount}`);
    if (result.output.qualityIssue) {
      console.log(`   ⚠️  qualityIssue: ${result.output.qualityIssue}`);
    }
    if (result.output.suppressionFlags.length > 0) {
      console.log(`   ⚠️  suppression flags: ${result.output.suppressionFlags.length}`);
    }
  } finally {
    await db.delete(workflowRuns).where(eq(workflowRuns.id, run.id));
    await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, tenant.id));
    await db.delete(users).where(eq(users.tenantId, tenant.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
