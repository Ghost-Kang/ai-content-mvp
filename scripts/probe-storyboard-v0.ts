// W2-01-V3 — End-to-end storyboard prompt v0 probe (10 runs).
//
// Reads `scripts/fixtures/script-output-sample.json` (committed fixture from
// generate-script-fixture.ts) → calls KIMI 10 times with the v0 storyboard
// prompt → validates each output → prints stats.
//
// W2-01 acceptance bar:
//   - ≥ 8/10 frame count valid
//   - ≥ 9/10 suppression scan clean
//   - ≥ 9/10 imagePrompt within cap (no truncation warnings)
//   - 10/10 cameraLanguage in vocab (hard-fail = retry budget exhausted)
//
// Run: pnpm wf:probe:storyboard
// Cost: ~10 × KIMI ¥0.05 = ~¥0.5 + small headroom for retries.

import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, tenants, users, llmSpendDaily } from '../src/db';
import { executeWithFallback, LLMError, type LLMRegion } from '../src/lib/llm';
import {
  buildStoryboardPrompt,
  validateStoryboard,
  type ValidationResult,
} from '../src/lib/prompts/storyboard-prompt';
import type { ScriptOutput } from '../src/lib/workflow/nodes/script';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'script-output-sample.json');
const N_RUNS = 10;

interface FixtureFile {
  _meta: { topic: string; [k: string]: unknown };
  output: ScriptOutput;
}

interface RunResult {
  runIndex: number;
  attemptCount: number; // 1 = first try succeeded, 2 = retried once
  ok: boolean;
  ms: number;
  validation?: ValidationResult;
  error?: string;
}

async function loadFixture(): Promise<FixtureFile> {
  const raw = await fs.readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(raw) as FixtureFile;
}

async function callOnce(args: {
  systemPrompt: string;
  userPrompt: string;
  tenantId: string;
}): Promise<{ content: string; model: string; latencyMs: number }> {
  const resp = await executeWithFallback({
    messages: [
      { role: 'system', content: args.systemPrompt },
      { role: 'user',   content: args.userPrompt },
    ],
    intent:      'draft',
    tenantId:    args.tenantId,
    region:      'CN' satisfies LLMRegion,  // KIMI primary; OpenAI quota dry, reserve for future
    maxTokens:   3000,                      // 17 frames × ~150 chars JSON each ≈ 2500
    temperature: 0.5,
  });
  return { content: resp.content, model: resp.model, latencyMs: resp.latencyMs };
}

async function runOne(
  runIndex: number,
  fixture: FixtureFile,
  tenantId: string,
): Promise<RunResult> {
  const t0 = Date.now();
  const { systemPrompt, userPrompt } = buildStoryboardPrompt({
    topic:        fixture._meta.topic,
    scriptFrames: fixture.output.frames,
  });

  let attemptCount = 0;
  let lastValidation: ValidationResult | undefined;
  let lastErr: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    attemptCount++;
    try {
      const llm = await callOnce({ systemPrompt, userPrompt, tenantId });
      lastValidation = validateStoryboard(llm.content, fixture.output.frames, llm.model);
      if (lastValidation.ok) {
        return { runIndex, attemptCount, ok: true, ms: Date.now() - t0, validation: lastValidation };
      }
      lastErr = lastValidation.issues.map((x) => `${x.code}@frame${x.frameIndex ?? '?'}`).join(',');
      // retry once with the same prompt — accept LLM nondeterminism
    } catch (e) {
      if (e instanceof LLMError && !e.retryable) {
        return { runIndex, attemptCount, ok: false, ms: Date.now() - t0, error: `LLMError(${e.code}): ${e.message}` };
      }
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return { runIndex, attemptCount, ok: false, ms: Date.now() - t0, validation: lastValidation, error: lastErr };
}

async function main() {
  console.log('--- W2-01-V3 storyboard prompt v0 probe ---');
  const fixture = await loadFixture();
  console.log(`fixture topic: ${fixture._meta.topic}`);
  console.log(`script frames: ${fixture.output.frames.length}  charCount: ${fixture.output.charCount}`);
  console.log(`runs: ${N_RUNS}\n`);

  // Seed fresh tenant for spend tracker FK
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `sb-probe-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  await db.insert(users).values({
    tenantId:    tenant.id,
    clerkUserId: `sb-probe-${ts}`,
    email:       `sb-probe-${ts}@gen.test`,
    role:        'owner',
  });

  const results: RunResult[] = [];
  try {
    for (let i = 1; i <= N_RUNS; i++) {
      process.stdout.write(`  [${i}/${N_RUNS}] `);
      const r = await runOne(i, fixture, tenant.id);
      results.push(r);
      const tag = r.ok ? '✓' : '✗';
      const tries = r.attemptCount > 1 ? ` (retry×${r.attemptCount - 1})` : '';
      const warn = r.validation?.warnings.length
        ? ` [${r.validation.warnings.length} warn]`
        : '';
      const supp = r.validation?.output?.suppressionFlags.length
        ? ` [${r.validation.output.suppressionFlags.length} suppression]`
        : '';
      console.log(`${tag} ${r.ms}ms${tries}${warn}${supp}${r.error ? ` — ${r.error}` : ''}`);
    }
  } finally {
    await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, tenant.id));
    await db.delete(users).where(eq(users.tenantId, tenant.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────
  // Separate v2-LLM-spend-cap exhaustion (infra failure, daily cap resets) from
  // actual prompt validation failures. Acceptance bar measures the latter only —
  // if KIMI is rate-limited mid-probe, that is a budget-tuning concern, not a
  // signal that the storyboard prompt is broken.
  const isInfraFailure = (r: RunResult): boolean =>
    !r.ok && (r.error?.includes('SPEND_CAP_EXCEEDED') ?? false);

  const llmReached      = results.filter((r) => !isInfraFailure(r));
  const passed          = results.filter((r) => r.ok);
  const promptFailures  = llmReached.filter((r) => !r.ok);
  const cleanFirstTry   = results.filter((r) => r.ok && r.attemptCount === 1).length;
  const truncationRuns  = passed.filter(
    (r) => r.validation?.warnings.some((w) => w.includes('imagePrompt truncated')),
  ).length;
  const suppressionRuns = passed.filter(
    (r) => r.validation?.output && r.validation.output.suppressionFlags.length > 0,
  ).length;
  const floorMissRuns   = passed.filter(
    (r) => r.validation?.warnings.some((w) => w.includes('below floor')),
  ).length;
  const lowDiversityRuns = passed.filter(
    (r) => r.validation?.warnings.some((w) => w.includes('camera diversity')),
  ).length;

  const sortedMs = passed.map((r) => r.ms).sort((a, b) => a - b);
  const median = sortedMs.length ? sortedMs[Math.floor(sortedMs.length / 2)] : 0;

  console.log('');
  console.log('─── stats ───────────────────────────────');
  console.log(`runs reached LLM:           ${llmReached.length}/${N_RUNS}  (rest = v2 spend-cap, ignored for acceptance)`);
  console.log(`prompt pass:                ${passed.length}/${llmReached.length}  (${llmReached.length ? Math.round(100 * passed.length / llmReached.length) : 0}%)`);
  console.log(`first-try clean:            ${cleanFirstTry}/${llmReached.length}`);
  console.log(`imagePrompt truncated runs: ${truncationRuns}/${passed.length}  (target ≤ 1)`);
  console.log(`suppression-flagged runs:   ${suppressionRuns}/${passed.length}  (target ≤ 1)`);
  console.log(`imagePrompt below-floor:    ${floorMissRuns}/${passed.length}  (soft, KIMI-laziness signal)`);
  console.log(`low camera diversity:       ${lowDiversityRuns}/${passed.length}  (soft)`);
  console.log(`median latency (passed):    ${median}ms`);
  console.log('');

  // ─── Acceptance ─────────────────────────────────────────────────────────────
  // Bar is graded on prompt-attributable runs only. We require at least 5 such
  // runs to call this a meaningful sample.
  console.log('─── W2-01 acceptance ──────────────────────');
  const meaningfulSample = llmReached.length >= 5;
  const promptPassRate   = llmReached.length ? passed.length / llmReached.length : 0;

  const passFrameCount   = promptPassRate >= 0.8;
  const passSuppression  = passed.length === 0 || suppressionRuns / passed.length <= 0.1;
  const passImagePrompt  = passed.length === 0 || truncationRuns / passed.length <= 0.1;

  console.log(`  ${meaningfulSample ? '✓' : '✗'} meaningful sample     ≥ 5 LLM runs reached  (got ${llmReached.length})`);
  console.log(`  ${passFrameCount   ? '✓' : '✗'} prompt pass rate      ≥ 80%               (got ${Math.round(100 * promptPassRate)}%)`);
  console.log(`  ${passSuppression  ? '✓' : '✗'} suppression clean     ≤ 10%               (got ${passed.length ? Math.round(100 * suppressionRuns / passed.length) : 0}%)`);
  console.log(`  ${passImagePrompt  ? '✓' : '✗'} imagePrompt cap       ≤ 10% truncate      (got ${passed.length ? Math.round(100 * truncationRuns / passed.length) : 0}%)`);
  if (floorMissRuns > 0) {
    console.log(`  ⚠  imagePrompt below-floor in ${floorMissRuns}/${passed.length} runs — KIMI ignoring 40-char min. Iterate later if Seedance quality suffers.`);
  }

  if (meaningfulSample && passFrameCount && passSuppression && passImagePrompt) {
    console.log('\n✅ W2-01 acceptance bar met.');
    process.exit(0);
  } else {
    console.log('\n❌ W2-01 acceptance bar NOT met. Iterate prompt or reset spend cap and re-run.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
