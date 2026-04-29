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
import { VIDEO_CONTINUE_REQUIRED, VideoGenNodeRunner } from '../src/lib/workflow/nodes/video';
import { resetRunForContinuation } from '../src/lib/workflow/continuation';
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

async function caseContinuationCheckpointResume() {
  console.log('\n[case 7] continuation checkpoint — render in 3 invocations (2+2+1)');
  const f = await seedRun('continuation');
  const ctx = buildCtx(f, fakeStoryboardOutput(5, 5));

  const prevChunk = process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION;
  process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION = '2';

  try {
    const provider = new FakeVideoProvider(
      [
        { kind: 'ok', jobId: 'job-c-1' },
        { kind: 'ok', jobId: 'job-c-2' },
        { kind: 'ok', jobId: 'job-c-3' },
        { kind: 'ok', jobId: 'job-c-4' },
        { kind: 'ok', jobId: 'job-c-5' },
      ],
      [
        { kind: 'snapshot', snap: okSnapshot({ videoUrl: 'https://cdn.example/c1.mp4' }) },
        { kind: 'snapshot', snap: okSnapshot({ videoUrl: 'https://cdn.example/c2.mp4' }) },
        { kind: 'snapshot', snap: okSnapshot({ videoUrl: 'https://cdn.example/c3.mp4' }) },
        { kind: 'snapshot', snap: okSnapshot({ videoUrl: 'https://cdn.example/c4.mp4' }) },
        { kind: 'snapshot', snap: okSnapshot({ videoUrl: 'https://cdn.example/c5.mp4' }) },
      ],
    );
    const runner = new VideoGenNodeRunner(provider);

    let thrown1: unknown;
    try { await runner.run(ctx); } catch (e) { thrown1 = e; }
    expect(thrown1 instanceof NodeError, 'invoke 1 throws NodeError continuation marker');
    if (thrown1 instanceof NodeError) {
      expect(thrown1.message.includes(VIDEO_CONTINUE_REQUIRED), 'invoke 1 error includes VIDEO_CONTINUE_REQUIRED');
    }
    const [step1] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
    const frames1 = ((step1?.outputJson as { frames?: unknown[] } | null)?.frames ?? []).length;
    expect(frames1 === 2, `invoke 1 checkpoint stores 2 frames (got ${frames1})`);

    let thrown2: unknown;
    try { await runner.run(ctx); } catch (e) { thrown2 = e; }
    expect(thrown2 instanceof NodeError, 'invoke 2 throws NodeError continuation marker');
    if (thrown2 instanceof NodeError) {
      expect(thrown2.message.includes(VIDEO_CONTINUE_REQUIRED), 'invoke 2 error includes VIDEO_CONTINUE_REQUIRED');
    }
    const [step2] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
    const frames2 = ((step2?.outputJson as { frames?: unknown[] } | null)?.frames ?? []).length;
    expect(frames2 === 4, `invoke 2 checkpoint stores 4 frames (got ${frames2})`);

    const result3 = await runner.run(ctx);
    expect(result3.output.frames.length === 5, `invoke 3 returns full 5-frame output (got ${result3.output.frames.length})`);
    expect(result3.videoCount === 5, `invoke 3 videoCount=5 (got ${result3.videoCount})`);
    expect(provider.submitCalls.length === 5, `provider.submit called exactly 5 times total (got ${provider.submitCalls.length})`);
    expect(provider.pollCalls.length === 5, `provider.poll called exactly 5 times total (got ${provider.pollCalls.length})`);

    const [step3] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
    const frames3 = ((step3?.outputJson as { frames?: unknown[] } | null)?.frames ?? []).length;
    expect(step3?.status === 'done', `final step status=done (got ${step3?.status})`);
    expect(frames3 === 5, `final persisted output keeps 5 frames (got ${frames3})`);
  } finally {
    if (prevChunk === undefined) {
      delete process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION;
    } else {
      process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION = prevChunk;
    }
    await cleanup(f);
  }
}

async function caseContinuationStateReset() {
  console.log('\n[case 8] continuation state reset — failed → pending without losing other steps');
  const f = await seedRun('reset');

  // Seed terminal "between-invocations" state: orchestrator just wrote
  // run + video step as `failed` with VIDEO_CONTINUE_REQUIRED, while
  // upstream nodes (topic/script/storyboard) finished cleanly.
  const now = new Date();
  await db
    .update(workflowRuns)
    .set({
      status:      'failed',
      errorMsg:    'video: PROVIDER_FAILED VIDEO_CONTINUE_REQUIRED: rendered 4/17 frames in this invocation; enqueue next worker run',
      completedAt: now,
    })
    .where(eq(workflowRuns.id, f.runId));

  await db.insert(workflowSteps).values([
    { tenantId: f.tenantId, runId: f.runId, stepIndex: 0, nodeType: 'topic',      status: 'done',   retryCount: 0, costFen: 0, startedAt: now, completedAt: now },
    { tenantId: f.tenantId, runId: f.runId, stepIndex: 1, nodeType: 'script',     status: 'done',   retryCount: 0, costFen: 0, startedAt: now, completedAt: now },
    { tenantId: f.tenantId, runId: f.runId, stepIndex: 2, nodeType: 'storyboard', status: 'done',   retryCount: 0, costFen: 0, startedAt: now, completedAt: now },
    { tenantId: f.tenantId, runId: f.runId, stepIndex: 3, nodeType: 'video',      status: 'failed', retryCount: 0, costFen: 316, startedAt: now, completedAt: now,
      errorMsg: 'PROVIDER_FAILED: VIDEO_CONTINUE_REQUIRED: rendered 4/17 frames in this invocation; enqueue next worker run',
      outputJson: { frames: [], totalCostFen: 316, incomplete: true } as object },
  ]);

  await resetRunForContinuation(f.runId, 'video');

  const [runAfter] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, f.runId));
  expect(runAfter?.status === 'pending', `run.status reset to pending (got ${runAfter?.status})`);
  expect(runAfter?.errorMsg === null,    `run.errorMsg cleared (got ${JSON.stringify(runAfter?.errorMsg)})`);
  expect(runAfter?.completedAt === null, `run.completedAt cleared (got ${JSON.stringify(runAfter?.completedAt)})`);

  const stepsAfter = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  const byNode = new Map(stepsAfter.map((s) => [s.nodeType, s]));

  const videoStep = byNode.get('video');
  expect(videoStep?.status === 'pending', `video step reset to pending (got ${videoStep?.status})`);
  expect(videoStep?.errorMsg === null,    `video step errorMsg cleared (got ${JSON.stringify(videoStep?.errorMsg)})`);
  expect(videoStep?.completedAt === null, `video step completedAt cleared (got ${JSON.stringify(videoStep?.completedAt)})`);

  // Critical: checkpoint payload survives so the next invocation can
  // resume from the partial-render state.
  const videoOutput = videoStep?.outputJson as { frames?: unknown[]; totalCostFen?: number } | null;
  expect(typeof videoOutput?.totalCostFen === 'number', 'video step checkpoint preserved (totalCostFen)');

  // Other nodes untouched — resume mode in the next invocation will
  // hydrate-and-skip them.
  for (const nt of ['topic', 'script', 'storyboard'] as const) {
    expect(byNode.get(nt)?.status === 'done',     `${nt} step untouched (still done)`);
    expect(byNode.get(nt)?.errorMsg === null,     `${nt} step errorMsg untouched`);
    expect(byNode.get(nt)?.completedAt !== null,  `${nt} step completedAt preserved`);
  }
  expect(byNode.get('export') === undefined,      'export step never created (cascade halted)');

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
  await caseContinuationCheckpointResume();
  await caseContinuationStateReset();

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
