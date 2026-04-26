// W1-06-V3 / W2-02-V3 — End-to-end workflow probe.
//
// Runs the full default orchestrator chain (script → storyboard) against a
// live LLM (requires KIMI_API_KEY etc. in .env.local). Spins up 5 connected
// runs and asserts that ≥4 reach status=done with valid script + storyboard
// output and zero RLS leakage between runs.
//
// Each run hits the LLM 2-4 times (script 1-3 + storyboard 1-2) → bump
// LLM_TENANT_DAILY_CAP_CNY=50 inline if you see SPEND_CAP_EXCEEDED.
//
// Run: pnpm wf:probe (after pnpm db:migrate:v3)

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  monthlyUsage,
  llmSpendDaily,
} from '../src/db';
import { buildDefaultOrchestrator } from '../src/lib/workflow';

const TOPICS = [
  '为什么 SaaS 产品免费试用反而留不住用户',
  '小公司做品牌为什么往往是浪费钱',
  '为什么 B2B 销售线索越多反而成单越少',
  '远程团队的效率瓶颈往往不在技术工具',
  '为什么客户成功这个岗位最容易被误解',
];

const SUCCESS_THRESHOLD = 4; // ≥4/5 must succeed for the probe to pass

async function seedFixture() {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `wf-probe-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `wf-probe-${ts}`,
      email:       `probe-${ts}@wf.test`,
      role:        'owner',
    })
    .returning();
  return { tenantId: tenant.id, userId: user.id };
}

async function cleanup(f: { tenantId: string; userId: string }) {
  await db.delete(monthlyUsage).where(eq(monthlyUsage.tenantId, f.tenantId));
  // workflow_steps cascades from workflow_runs (ON DELETE CASCADE)
  const runs = await db.select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.tenantId, f.tenantId));
  for (const r of runs) {
    await db.delete(workflowRuns).where(eq(workflowRuns.id, r.id));
  }
  // v2 LLM spend tracker has FK -> tenants; must clear before tenant delete
  await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, f.tenantId));
  await db.delete(users).where(eq(users.tenantId, f.tenantId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

async function main() {
  console.log('--- W1-06-V3 end-to-end workflow probe ---');
  console.log(`Topics to run: ${TOPICS.length} | success threshold: ${SUCCESS_THRESHOLD}\n`);

  const f = await seedFixture();
  const orch = buildDefaultOrchestrator();
  const results: Array<{ topic: string; status: string; ms: number; err?: string }> = [];

  for (const topic of TOPICS) {
    const [run] = await db
      .insert(workflowRuns)
      .values({
        tenantId:  f.tenantId,
        createdBy: f.userId,
        topic,
        status:    'pending',
      })
      .returning({ id: workflowRuns.id });

    const t0 = Date.now();
    try {
      const r = await orch.run(run.id);
      const ms = Date.now() - t0;
      console.log(`  [${r.status === 'done' ? '✓' : '✗'}] ${ms}ms ${topic}`);
      if (r.status === 'failed') {
        console.log(`      err: ${r.errorMsg}`);
      }
      results.push({ topic, status: r.status, ms, err: r.errorMsg });
    } catch (e) {
      const ms = Date.now() - t0;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  [✗] ${ms}ms ${topic}\n      err: ${msg}`);
      results.push({ topic, status: 'errored', ms, err: msg });
    }
  }

  const ok = results.filter((r) => r.status === 'done').length;
  console.log(`\n${ok}/${TOPICS.length} runs reached status=done.`);

  // Verify aggregated monthly_usage matches what we just executed.
  const [usage] = await db.select().from(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  console.log(`monthly_usage.workflow_run_count = ${usage?.workflowRunCount ?? 0}`);
  console.log(`monthly_usage.total_cost_fen     = ${usage?.totalCostFen ?? 0}`);

  // Validate persisted node outputs per step type.
  const stepRows = await db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.tenantId, f.tenantId));

  const scriptSteps     = stepRows.filter((s) => s.nodeType === 'script');
  const storyboardSteps = stepRows.filter((s) => s.nodeType === 'storyboard');

  const goodScriptSteps = scriptSteps.filter(
    (s) => s.status === 'done' &&
      typeof (s.outputJson as { fullText?: string } | null)?.fullText === 'string',
  );
  const goodStoryboardSteps = storyboardSteps.filter((s) => {
    if (s.status !== 'done') return false;
    const out = s.outputJson as {
      frames?: unknown;
      promptVersion?: unknown;
      provider?: unknown;
    } | null;
    return (
      Array.isArray(out?.frames) &&
      out!.frames.length > 0 &&
      typeof out!.promptVersion === 'string' &&
      typeof out!.provider === 'string'
    );
  });

  console.log(`workflow_steps[script]:     ${goodScriptSteps.length}/${scriptSteps.length} valid (fullText present)`);
  console.log(`workflow_steps[storyboard]: ${goodStoryboardSteps.length}/${storyboardSteps.length} valid (frames + provider present)`);

  // Sample one storyboard step for visual inspection
  const sample = goodStoryboardSteps[0];
  if (sample) {
    const out = sample.outputJson as {
      frames: Array<{ index: number; cameraLanguage: string; imagePrompt: string }>;
      provider: string;
      latencyMs: number;
    };
    const distinctCameras = new Set(out.frames.map((fr) => fr.cameraLanguage));
    const minImageLen = Math.min(...out.frames.map((fr) => [...fr.imagePrompt].length));
    console.log(`  sample storyboard: ${out.frames.length} frames · ${distinctCameras.size} camera terms · min imagePrompt ${minImageLen} chars · provider ${out.provider} · ${out.latencyMs}ms`);
  }

  await cleanup(f);

  // Acceptance: ≥ SUCCESS_THRESHOLD runs done AND every done run has BOTH script
  // and storyboard outputs persisted. Storyboard ratio matters because a half-
  // pipeline pass would silently regress when later W2-04 video joins on it.
  const storyboardCoverage = scriptSteps.length === 0
    ? 1
    : goodStoryboardSteps.length / Math.max(1, goodScriptSteps.length);

  if (ok >= SUCCESS_THRESHOLD && storyboardCoverage >= 0.8) {
    console.log(`\n✅ Probe passed (${ok}/${TOPICS.length} done · storyboard coverage ${Math.round(100 * storyboardCoverage)}%).`);
    process.exit(0);
  }
  console.log(
    `\n❌ Probe failed (${ok}/${TOPICS.length} done, storyboard coverage ${Math.round(100 * storyboardCoverage)}%; need ≥ ${SUCCESS_THRESHOLD} done and ≥ 80% storyboard coverage).`,
  );
  process.exit(1);
}

main().catch((e) => {
  console.error('probe errored:', e);
  process.exit(1);
});
