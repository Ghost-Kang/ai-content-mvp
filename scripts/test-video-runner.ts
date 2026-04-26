// W2-05-V3 / W2-06-V3 unit tests for VideoGenNodeRunner.
//
// Verifies the per-frame submit + poll loop, retry policy (W2-06: 2 attempts,
// exponential backoff on retryable errors), spend-cap mid-run halt, and
// upstream-missing handling — all by injecting a FakeVideoProvider into
// `new VideoGenNodeRunner(provider)`. No real Seedance, no network.
//
// We DO use the real DB for workflow_steps + monthly_usage persistence.
//
// Cases:
//   1. happy 3-frame              — every submit + first poll succeeds
//   2. submit retry-then-success  — 1st submit RATE_LIMITED, 2nd OK
//   3. poll lifecycle             — queued → running → succeeded across 3 polls
//   4. non-retryable submit       — CONTENT_FILTERED → node throws PROVIDER_FAILED
//   5. cap mid-run                — frame 3's preflight trips cost cap
//   6. upstream missing            — no storyboard → UPSTREAM_MISSING
//
// Run: pnpm wf:test:video:runner

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  monthlyUsage,
} from '../src/db';
import { VideoGenNodeRunner } from '../src/lib/workflow/nodes/video';
import { BaseVideoProvider } from '../src/lib/video-gen/providers/base';
import {
  VideoGenError,
  type VideoGenRequest,
  type VideoGenSubmitResult,
  type VideoGenJobSnapshot,
  type VideoProviderName,
  type VideoResolution,
} from '../src/lib/video-gen/types';
import {
  NodeError,
  type NodeContext,
} from '../src/lib/workflow/types';
import type { StoryboardNodeOutput } from '../src/lib/workflow/nodes/storyboard';

// Tighten the polling loop so tests don't sleep for seconds.
process.env.WORKFLOW_VIDEO_POLL_INTERVAL_MS = '5';
process.env.WORKFLOW_VIDEO_POLL_MAX_WAIT_MS = '500';

// ─── Test seam: queueable fake video provider ─────────────────────────────────

type SubmitOutcome =
  | { kind: 'ok'; jobId: string }
  | { kind: 'error'; error: VideoGenError };

type PollOutcome =
  | { kind: 'snapshot'; snap: VideoGenJobSnapshot }
  | { kind: 'error'; error: VideoGenError };

class FakeVideoProvider extends BaseVideoProvider {
  readonly name: VideoProviderName = 'seedance';
  readonly model = 'fake-seedance-1';
  // 1500 fen / M tokens (D32 1.0-pro rate). Combined with the 480p
  // estimator below (10K tokens/sec) → 1 sec ≈ 15 fen ≈ ¥0.15. Matches
  // existing test budget assumptions, no need to retune cap math.
  readonly costPerMTokensFen = 1500;

  estimateTokensForFrame(durationSec: number, _resolution: VideoResolution): number {
    return Math.ceil(durationSec * 10_000);
  }

  /** Outcomes consumed in order across all submit() calls. */
  public submitCalls: VideoGenRequest[] = [];
  /** Outcomes consumed in order across all pollJob() calls. */
  public pollCalls:   string[] = [];

  constructor(
    private readonly submitQueue: SubmitOutcome[],
    private readonly pollQueue:   PollOutcome[],
  ) {
    super();
  }
  validateConfig(): void { /* no-op for fake */ }
  async healthCheck(): Promise<boolean> { return true; }
  protected normalizeError(_raw: unknown): VideoGenError {
    return new VideoGenError('UNKNOWN', this.name, 'fake', false);
  }
  async submit(request: VideoGenRequest): Promise<VideoGenSubmitResult> {
    this.submitCalls.push(request);
    const o = this.submitQueue.shift();
    if (!o) throw new Error(`FakeVideoProvider: submitQueue exhausted (call #${this.submitCalls.length})`);
    if (o.kind === 'error') throw o.error;
    return {
      jobId:      o.jobId,
      provider:   this.name,
      model:      this.model,
      acceptedAt: new Date().toISOString(),
    };
  }
  async pollJob(jobId: string): Promise<VideoGenJobSnapshot> {
    this.pollCalls.push(jobId);
    const o = this.pollQueue.shift();
    if (!o) throw new Error(`FakeVideoProvider: pollQueue exhausted (call #${this.pollCalls.length})`);
    if (o.kind === 'error') throw o.error;
    return { ...o.snap, jobId };
  }
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

async function seedRun(label: string): Promise<Fixture> {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `vg-runner-${label}-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `vg-runner-${label}-${ts}`,
      email:       `vg-runner-${label}-${ts}@gen.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     `vg-runner-test-${label}`,
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

/**
 * Mock storyboard upstream — N frames each requesting `durationSec` seconds.
 * Only the fields VideoGenNodeRunner.buildInput reads (`index`, `imagePrompt`,
 * `durationSec`) are populated; the rest are stubbed because the type extends
 * StoryboardNodeOutput.
 */
function fakeStoryboardOutput(frameCount: number, durationSec: number): StoryboardNodeOutput {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    index:          i + 1,
    voiceover:      `frame ${i + 1} voiceover`,
    durationSec,
    cameraLanguage: '中景' as const,
    scene:          `场景 ${i + 1}`,
    imagePrompt:    `产品经理坐在办公桌前皱眉,室内自然光,简约工业风背景,中景镜头 #${i + 1}`,
    onScreenText:   `字幕${i + 1}`,
  }));
  return {
    promptVersion:    'v0',
    frames,
    totalDurationSec: frames.length * durationSec,
    suppressionFlags: [],
    llmModel:         'fake-storyboard',
    generatedAt:      new Date().toISOString(),
    provider:         'fake',
    latencyMs:        100,
    retryCount:       0,
    qualityIssue:     null,
  };
}

function buildCtx(f: Fixture, withStoryboard: StoryboardNodeOutput | null): NodeContext {
  const ctx: NodeContext = {
    runId:    f.runId,
    tenantId: f.tenantId,
    userId:   f.userId,
    region:   'CN',
    plan:     'solo',
    topic:    'video runner test',
    upstreamOutputs: {},
  };
  if (withStoryboard) ctx.upstreamOutputs.storyboard = withStoryboard;
  return ctx;
}

const okSnapshot = (overrides: Partial<VideoGenJobSnapshot> = {}): VideoGenJobSnapshot => ({
  jobId:    'placeholder',
  provider: 'seedance',
  model:    'fake-seedance-1',
  status:   'succeeded',
  videoUrl: 'https://cdn.example/clip.mp4',
  actualDurationSec: 5,
  costFen:  300,
  ...overrides,
});

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappy3Frame() {
  console.log('\n[case 1] happy 3-frame — every submit OK, first poll succeeds');
  const f = await seedRun('happy');
  const ctx = buildCtx(f, fakeStoryboardOutput(3, 5));
  const provider = new FakeVideoProvider(
    [
      { kind: 'ok', jobId: 'job-1' },
      { kind: 'ok', jobId: 'job-2' },
      { kind: 'ok', jobId: 'job-3' },
    ],
    [
      { kind: 'snapshot', snap: okSnapshot() },
      { kind: 'snapshot', snap: okSnapshot() },
      { kind: 'snapshot', snap: okSnapshot() },
    ],
  );
  const runner = new VideoGenNodeRunner(provider);

  const result = await runner.run(ctx);

  expect(provider.submitCalls.length === 3,           `provider.submit called 3× (got ${provider.submitCalls.length})`);
  expect(provider.pollCalls.length   === 3,           `provider.pollJob called 3× (got ${provider.pollCalls.length})`);
  expect(result.output.frames.length === 3,           `output.frames.length === 3 (got ${result.output.frames.length})`);
  expect(result.videoCount === 3,                     `videoCount === 3 (got ${result.videoCount})`);
  expect(result.costFen === 3 * 300,                  `costFen === 3 × 300 = 900 分 (got ${result.costFen})`);
  expect(result.output.totalCostFen === result.costFen,'output.totalCostFen mirrors NodeResult.costFen');
  expect(result.output.frames.every((fr) => fr.attemptCount === 1), 'all frames first-try');
  expect(provider.submitCalls[0].resolution === '480p','submit sees default resolution (D33)');
  expect(provider.submitCalls[0].tenantId === f.tenantId, 'submit carries tenantId');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'done',                     'workflow_steps.status = done');
  expect(step?.nodeType === 'video',                  'workflow_steps.node_type = video');
  expect(step?.costFen === 900,                       `workflow_steps.cost_fen = 900 (got ${step?.costFen})`);

  await cleanup(f);
}

async function caseSubmitRetryThenSuccess() {
  console.log('\n[case 2] submit retry — frame 1 RATE_LIMITED then OK');
  const f = await seedRun('retry');
  const ctx = buildCtx(f, fakeStoryboardOutput(1, 5));
  const provider = new FakeVideoProvider(
    [
      { kind: 'error', error: new VideoGenError('RATE_LIMITED', 'seedance', 'throttled', true) },
      { kind: 'ok', jobId: 'job-retry-1' },
    ],
    [
      { kind: 'snapshot', snap: okSnapshot() },
    ],
  );
  const runner = new VideoGenNodeRunner(provider);

  const result = await runner.run(ctx);

  expect(provider.submitCalls.length === 2,           `submit called twice (got ${provider.submitCalls.length})`);
  expect(provider.pollCalls.length   === 1,           `pollJob called once (got ${provider.pollCalls.length})`);
  expect(result.output.frames[0].attemptCount === 2,  `frame.attemptCount === 2 (got ${result.output.frames[0].attemptCount})`);
  expect(result.videoCount === 1,                     'videoCount === 1');
  expect(result.costFen === 300,                      `costFen === 300 (got ${result.costFen})`);

  await cleanup(f);
}

async function casePollLifecycle() {
  console.log('\n[case 3] poll lifecycle — queued → running → succeeded across 3 polls');
  const f = await seedRun('poll');
  const ctx = buildCtx(f, fakeStoryboardOutput(1, 5));
  const provider = new FakeVideoProvider(
    [{ kind: 'ok', jobId: 'job-poll-1' }],
    [
      { kind: 'snapshot', snap: { ...okSnapshot(), status: 'queued' } },
      { kind: 'snapshot', snap: { ...okSnapshot(), status: 'running' } },
      { kind: 'snapshot', snap: okSnapshot() },
    ],
  );
  const runner = new VideoGenNodeRunner(provider);

  const result = await runner.run(ctx);

  expect(provider.pollCalls.length === 3,             `pollJob called 3× (got ${provider.pollCalls.length})`);
  expect(result.output.frames[0].videoUrl === 'https://cdn.example/clip.mp4',
                                                      'final videoUrl picked up');
  expect(result.output.frames[0].attemptCount === 1,  'submit only happened once');

  await cleanup(f);
}

async function caseNonRetryableSubmit() {
  console.log('\n[case 4] non-retryable — CONTENT_FILTERED on submit → node throws, no further frames');
  const f = await seedRun('moderation');
  const ctx = buildCtx(f, fakeStoryboardOutput(3, 5));
  const provider = new FakeVideoProvider(
    [
      { kind: 'error', error: new VideoGenError('CONTENT_FILTERED', 'seedance', 'sensitive prompt', false) },
    ],
    [],
  );
  const runner = new VideoGenNodeRunner(provider);

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof NodeError,                 'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'VALIDATION_FAILED',       `code === VALIDATION_FAILED (got ${thrown.code})`);
    expect(thrown.message.includes('CONTENT_FILTERED'),'message preserves provider error code');
    expect(thrown.retryable === false,                'retryable=false (no outer retry)');
  }
  expect(provider.submitCalls.length === 1,           `aborted after frame 1's first attempt (got ${provider.submitCalls.length} submits)`);
  expect(provider.pollCalls.length   === 0,           'never polled (submit failed first)');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                   `workflow_steps.status = failed (got ${step?.status})`);
  expect(typeof step?.errorMsg === 'string' && step.errorMsg.includes('CONTENT_FILTERED'),
                                                      'errorMsg preserves provider error');

  await cleanup(f);
}

async function caseCapMidRun() {
  console.log('\n[case 5] cap mid-run — pre-existing usage near cap, 3rd frame preflight trips it');
  const f = await seedRun('cap');
  // Pre-load monthly_usage so frame 3's preflight tips us over the cap.
  // VideoGenNodeRunner projects DB.totalCostFen + runningCostFen +
  // estimatedFrameCostFen against the cap. With cap=50_000 fen, the FakeProvider
  // estimator at 480p (10K tokens/sec × 5s = 50K tokens × 1500 fen/M = 75 fen),
  // and snapshot.costFen=300 per successful frame:
  //   frame 1 preflight:  49_350 + 0   + 75 = 49_425 ✓
  //   frame 2 preflight:  49_350 + 300 + 75 = 49_725 ✓
  //   frame 3 preflight:  49_350 + 600 + 75 = 50_025 ✗ → trips
  const monthKey = new Date().toISOString().slice(0, 7);
  await db.insert(monthlyUsage).values({
    tenantId:         f.tenantId,
    userId:           f.userId,
    monthKey,
    videoCount:       0,
    workflowRunCount: 0,
    totalCostFen:     49_350,
  });

  const ctx = buildCtx(f, fakeStoryboardOutput(3, 5));
  const provider = new FakeVideoProvider(
    [
      { kind: 'ok', jobId: 'job-cap-1' },
      { kind: 'ok', jobId: 'job-cap-2' },
    ],
    [
      { kind: 'snapshot', snap: okSnapshot() },
      { kind: 'snapshot', snap: okSnapshot() },
    ],
  );
  const runner = new VideoGenNodeRunner(provider);

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof Error,                     'run() threw');
  if (thrown instanceof Error) {
    expect(/cap exceeded/i.test(thrown.message) || /SPEND_CAP/i.test(thrown.message),
                                                      `error message names the cap (got: ${thrown.message})`);
  }
  expect(provider.submitCalls.length === 2,           `2 frames rendered before cap trip (got ${provider.submitCalls.length})`);
  expect(provider.pollCalls.length   === 2,           '2 polls completed before cap trip');

  await cleanup(f);
}

async function caseUpstreamMissing() {
  console.log('\n[case 6] upstream missing — no storyboard → buildInput throws UPSTREAM_MISSING');
  const f = await seedRun('upstream');
  const ctx = buildCtx(f, /* withStoryboard */ null);
  const provider = new FakeVideoProvider([], []);
  const runner = new VideoGenNodeRunner(provider);

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof NodeError,                 'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'UPSTREAM_MISSING',        `code === UPSTREAM_MISSING (got ${thrown.code})`);
  }
  expect(provider.submitCalls.length === 0,           'never called provider');

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                   'step row marked failed');

  await cleanup(f);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- W2-05/06-V3 VideoGenNodeRunner unit tests (mocked provider) ---');

  await caseHappy3Frame();
  await caseSubmitRetryThenSuccess();
  await casePollLifecycle();
  await caseNonRetryableSubmit();
  await caseCapMidRun();
  await caseUpstreamMissing();

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
