// W2-02-V3 unit-style tests for StoryboardNodeRunner.
//
// Verifies the internal LLM retry loop + best-attempt logic + graceful
// failure mode by overriding the protected `callLLM` seam — no real LLM,
// no network. We DO use the real DB for workflow_steps persistence (same
// pattern as test-workflow-runner.ts).
//
// Cases:
//   1. happy           — 1st attempt valid → status=done, retryCount=0, no qualityIssue
//   2. retry-success   — 1st attempt invalid JSON → 2nd valid → done, retryCount=1
//   3. degraded-final  — both attempts hard-fail vocab → throws VALIDATION_FAILED, step=failed
//   4. upstream missing — script output absent → buildInput throws UPSTREAM_MISSING
//
// Run: pnpm wf:test:storyboard:runner

import fs from 'node:fs/promises';
import path from 'node:path';
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
  StoryboardNodeRunner,
  type LLMCallResult,
} from '../src/lib/workflow/nodes/storyboard';
import type { ScriptOutput } from '../src/lib/workflow/nodes/script';
import {
  CAMERA_LANGUAGE_VOCAB,
  IMAGE_PROMPT_MIN_CHARS,
} from '../src/lib/prompts/storyboard-prompt';
import {
  NodeError,
  type NodeContext,
} from '../src/lib/workflow/types';

// ─── Test seam ────────────────────────────────────────────────────────────────

class FakeStoryboardRunner extends StoryboardNodeRunner {
  public calls: Array<{ attempt: number }> = [];
  constructor(private readonly responses: ReadonlyArray<string | Error>) {
    super();
  }
  protected async callLLM(
    _messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    _ctx: NodeContext,
    attempt: number,
  ): Promise<LLMCallResult> {
    this.calls.push({ attempt });
    const r = this.responses[attempt];
    if (r === undefined) {
      throw new Error(`fake LLM has no response for attempt=${attempt}`);
    }
    if (r instanceof Error) throw r;
    return {
      content:   r,
      provider:  'fake',
      model:     'fake-model-1',
      latencyMs: 12,
    };
  }
}

// ─── Fixture loading + storyboard JSON synthesis ──────────────────────────────

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'script-output-sample.json');

interface FixtureFile {
  _meta: { topic: string };
  output: ScriptOutput;
}

async function loadFixture(): Promise<FixtureFile> {
  const raw = await fs.readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(raw) as FixtureFile;
}

/**
 * Build a fully-valid storyboard JSON string for the given script frames.
 * - imagePrompt is 50-60 chars (above the 40 floor; below the 80 cap)
 * - cameraLanguage rotates through ALL 8 vocab entries → diversity ≥ 5 satisfied
 * - scene is ≤ 30 chars
 * - onScreenText is ≤ 12 chars
 */
function makeValidStoryboardJson(frames: ScriptOutput['frames']): string {
  // 50 chars (above 40 floor, well below 80 cap) — exercises subject/env/lighting/style.
  const imagePromptFiller =
    '产品经理坐在办公桌前皱眉,室内自然光,简约工业风背景,中景镜头,色彩柔和明亮,情绪专注真实';
  const sceneFiller       = '场景画面与文案匹配';
  const subtitleFiller    = '关键字';

  const sb = {
    frames: frames.map((f, i) => ({
      index:          f.index,
      scene:          sceneFiller,
      imagePrompt:    imagePromptFiller,
      cameraLanguage: CAMERA_LANGUAGE_VOCAB[i % CAMERA_LANGUAGE_VOCAB.length],
      onScreenText:   subtitleFiller,
    })),
  };
  return JSON.stringify(sb);
}

/**
 * Build a storyboard JSON whose frames all use a single OUT-OF-VOCAB camera
 * term. Forces CAMERA_LANGUAGE_OUT_OF_VOCAB hard fails for every frame.
 */
function makeBadVocabStoryboardJson(frames: ScriptOutput['frames']): string {
  const imagePromptFiller =
    '产品经理坐在办公桌前皱眉,室内自然光,简约工业风背景,中景镜头,色彩柔和明亮,情绪专注真实';
  const sb = {
    frames: frames.map((f) => ({
      index:          f.index,
      scene:          '场景描述',
      imagePrompt:    imagePromptFiller,
      cameraLanguage: '环绕镜头', // not in vocab
      onScreenText:   '字',
    })),
  };
  return JSON.stringify(sb);
}

// ─── Test harness ─────────────────────────────────────────────────────────────

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

async function seedRun(label: string, topic: string): Promise<Fixture> {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `sb-runner-${label}-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `sb-runner-${label}-${ts}`,
      email:       `sb-runner-${label}-${ts}@gen.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic,
      status:    'pending',
    })
    .returning();
  return { tenantId: tenant.id, userId: user.id, runId: run.id };
}

async function cleanup(f: Fixture): Promise<void> {
  await db.delete(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  await db.delete(monthlyUsage).where(eq(monthlyUsage.userId, f.userId));
  await db.delete(workflowRuns).where(eq(workflowRuns.id, f.runId));
  await db.delete(users).where(eq(users.id, f.userId));
  await db.delete(tenants).where(eq(tenants.id, f.tenantId));
}

function buildCtx(f: Fixture, fixture: FixtureFile, withScript = true): NodeContext {
  const ctx: NodeContext = {
    runId:    f.runId,
    tenantId: f.tenantId,
    userId:   f.userId,
    region:   'CN',
    plan:     'solo',
    topic:    fixture._meta.topic,
    upstreamOutputs: {},
  };
  if (withScript) ctx.upstreamOutputs.script = fixture.output;
  return ctx;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappy(fixture: FixtureFile) {
  console.log('\n[case 1] happy — 1st attempt valid');
  const f = await seedRun('happy', fixture._meta.topic);
  const ctx = buildCtx(f, fixture);
  const validJson = makeValidStoryboardJson(fixture.output.frames);

  const runner = new FakeStoryboardRunner([validJson]);
  const result = await runner.run(ctx);

  expect(runner.calls.length === 1,                    `LLM called once (got ${runner.calls.length})`);
  expect(result.output.retryCount === 0,               `retryCount === 0 (got ${result.output.retryCount})`);
  expect(result.output.frames.length === fixture.output.frames.length,
                                                       `frames count matches script (${result.output.frames.length})`);
  expect(result.output.qualityIssue === null,          `qualityIssue null (got ${result.output.qualityIssue})`);
  expect(result.output.provider === 'fake',            'provider passed through');
  expect(result.costFen === 0,                         'costFen=0 (LLM cost tracked elsewhere)');

  // Diversity check — vocab rotation should hit all 8 distinct values across 17 frames.
  const usedCameras = new Set(result.output.frames.map((fr) => fr.cameraLanguage));
  expect(usedCameras.size >= 5,                        `camera diversity ≥ 5 (got ${usedCameras.size})`);

  // imagePrompt should pass the 40-char floor → no below-floor warning.
  const allAboveFloor = result.output.frames.every((fr) => fr.imagePrompt.length >= IMAGE_PROMPT_MIN_CHARS);
  expect(allAboveFloor,                                'all imagePrompts ≥ floor (no soft warning)');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'done',                      'workflow_steps.status = done');
  expect(step?.nodeType === 'storyboard',              'workflow_steps.node_type = storyboard');
  expect(step?.retryCount === 0,                       `workflow_steps.retry_count = 0 (got ${step?.retryCount})`);
  expect(step?.errorMsg === null,                      'workflow_steps.error_msg = null');

  await cleanup(f);
}

async function caseRetrySuccess(fixture: FixtureFile) {
  console.log('\n[case 2] retry-success — 1st attempt invalid JSON, 2nd valid');
  const f = await seedRun('retry', fixture._meta.topic);
  const ctx = buildCtx(f, fixture);

  const validJson = makeValidStoryboardJson(fixture.output.frames);
  const runner = new FakeStoryboardRunner([
    'this is not valid json at all }{',
    validJson,
  ]);
  const result = await runner.run(ctx);

  expect(runner.calls.length === 2,                    `LLM called twice (got ${runner.calls.length})`);
  expect(result.output.retryCount === 1,               `retryCount === 1 (got ${result.output.retryCount})`);
  expect(result.output.frames.length === fixture.output.frames.length,
                                                       'final frames match script length');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'done',                      'step.status = done after internal retry');
  // NOTE: workflow_steps.retry_count is the OUTER retry counter (descriptor.maxRetries=0
  // for storyboard), so the internal LLM retry is not reflected there. This is
  // intentional — it matches ScriptNodeRunner's accounting (LLM retries surface
  // in result.meta.llmRetries instead).
  expect(step?.retryCount === 0,                       `outer step.retry_count = 0 (got ${step?.retryCount})`);

  await cleanup(f);
}

async function caseDegradedFinal(fixture: FixtureFile) {
  console.log('\n[case 3] degraded-final — every attempt hard-fails vocab → throws VALIDATION_FAILED');
  const f = await seedRun('degraded', fixture._meta.topic);
  const ctx = buildCtx(f, fixture);

  const badJson = makeBadVocabStoryboardJson(fixture.output.frames);
  const runner = new FakeStoryboardRunner([badJson, badJson]);

  let thrown: unknown;
  try {
    await runner.run(ctx);
  } catch (e) {
    thrown = e;
  }

  expect(thrown instanceof NodeError,                  'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'VALIDATION_FAILED',        `error code = VALIDATION_FAILED (got ${thrown.code})`);
    expect(thrown.message.includes('CAMERA_LANGUAGE_OUT_OF_VOCAB'),
                                                       'error message names the failed validator code');
    expect(thrown.retryable === false,                 'error marked non-retryable');
  }
  expect(runner.calls.length === 2,                    `LLM called twice (exhausted budget); got ${runner.calls.length}`);

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                    `workflow_steps.status = failed (got ${step?.status})`);
  expect(typeof step?.errorMsg === 'string' && step.errorMsg.includes('VALIDATION_FAILED'),
                                                       'workflow_steps.error_msg includes VALIDATION_FAILED');

  await cleanup(f);
}

async function caseUpstreamMissing(fixture: FixtureFile) {
  console.log('\n[case 4] upstream missing — no script output → buildInput throws UPSTREAM_MISSING');
  const f = await seedRun('upstream', fixture._meta.topic);
  const ctx = buildCtx(f, fixture, /* withScript */ false);

  const runner = new FakeStoryboardRunner([makeValidStoryboardJson(fixture.output.frames)]);

  let thrown: unknown;
  try {
    await runner.run(ctx);
  } catch (e) {
    thrown = e;
  }

  expect(thrown instanceof NodeError,                  'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'UPSTREAM_MISSING',         `error code = UPSTREAM_MISSING (got ${thrown.code})`);
  }
  expect(runner.calls.length === 0,                    'LLM never called when upstream missing');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                    'step row marked failed');

  await cleanup(f);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- W2-02-V3 StoryboardNodeRunner unit tests ---');
  const fixture = await loadFixture();
  console.log(`fixture: ${fixture._meta.topic}  (${fixture.output.frames.length} frames)`);

  await caseHappy(fixture);
  await caseRetrySuccess(fixture);
  await caseDegradedFinal(fixture);
  await caseUpstreamMissing(fixture);

  if (totalFailures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
  process.exit(1);
}

main().catch((e) => {
  console.error('test errored:', e);
  process.exit(1);
});
