// W4-05-V3 unit-style tests for TopicNodeRunner.
//
// Covers the thin pass-through contract end-to-end against a real DB
// (matches test-storyboard-runner.ts pattern). Zero LLM, zero network —
// the runner itself is pure CPU.
//
// Cases:
//   1. happy manual           — output.source='manual', no sourceMeta, step=done, costFen=0
//   2. happy trending+meta    — sourceMeta preserved verbatim (use ScriptNodeRunner-shape ctx
//                                that allows the input to carry source/meta via subclass)
//   3. invalid: too short     — 1-char topic → INVALID_INPUT, step=failed
//   4. invalid: too long      — 301-char topic → INVALID_INPUT
//   5. integration: ScriptNodeRunner.buildInput honors upstream.topic.topic
//                                (key W4-05 contract — ensures pass-through reaches script node)
//
// Run: pnpm wf:test:topic:runner

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
  TopicNodeRunner,
  type TopicInput,
  type TopicOutput,
  type TopicSourceMeta,
} from '../src/lib/workflow/nodes/topic';
import { ScriptNodeRunner, type ScriptInput } from '../src/lib/workflow/nodes/script';
import {
  NodeError,
  type NodeContext,
} from '../src/lib/workflow/types';

// ─── Test seam ────────────────────────────────────────────────────────────────
// Allows callers to inject a TopicInput so we can exercise the trending +
// sourceMeta path the production runner doesn't construct itself in MVP-1
// (workflow_runs has no source column yet).

class FakeTopicRunner extends TopicNodeRunner {
  constructor(private readonly inputOverride?: TopicInput) {
    super();
  }
  protected buildInput(ctx: NodeContext): TopicInput {
    if (this.inputOverride) return this.inputOverride;
    return super.buildInput(ctx);
  }
}

// Expose protected ScriptNodeRunner.buildInput for the integration assertion.
class TestableScriptRunner extends ScriptNodeRunner {
  public callBuildInput(ctx: NodeContext): ScriptInput {
    return this.buildInput(ctx);
  }
}

// ─── Test harness (mirrors test-storyboard-runner.ts) ─────────────────────────

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
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `topic-runner-${label}-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `topic-runner-${label}-${ts}`,
      email:       `topic-runner-${label}-${ts}@gen.test`,
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

function buildCtx(f: Fixture, topic: string): NodeContext {
  return {
    runId:    f.runId,
    tenantId: f.tenantId,
    userId:   f.userId,
    region:   'CN',
    plan:     'solo',
    topic,
    upstreamOutputs: {},
  };
}

async function readStepRow(runId: string) {
  const rows = await db
    .select({
      id:         workflowSteps.id,
      nodeType:   workflowSteps.nodeType,
      status:     workflowSteps.status,
      outputJson: workflowSteps.outputJson,
      errorMsg:   workflowSteps.errorMsg,
      costFen:    workflowSteps.costFen,
      retryCount: workflowSteps.retryCount,
    })
    .from(workflowSteps)
    .where(eq(workflowSteps.runId, runId));
  return rows.find((r) => r.nodeType === 'topic') ?? null;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappyManual() {
  console.log('\n[case 1] happy manual — pass-through, source defaults to "manual"');
  const f = await seedRun('happy-manual', '   AI 短视频内容工作流  '); // intentional whitespace
  try {
    const ctx = buildCtx(f, '   AI 短视频内容工作流  ');
    const runner = new TopicNodeRunner();
    const result = await runner.run(ctx);

    expect(result.output.topic === 'AI 短视频内容工作流',                                 'output.topic trimmed');
    expect(result.output.source === 'manual',                                              'output.source defaults to manual');
    expect(result.output.sourceMeta === undefined,                                         'output.sourceMeta absent on manual');
    expect(result.costFen === 0,                                                           'costFen=0 (no LLM, no provider)');
    expect((result.videoCount ?? 0) === 0,                                                 'videoCount=0');

    const step = await readStepRow(f.runId);
    expect(step !== null,                                                                  'step row created');
    expect(step?.status === 'done',                                                        `step.status=done (got ${step?.status})`);
    expect(step?.errorMsg === null,                                                        'step.errorMsg null');
    const persistedOut = step?.outputJson as TopicOutput | null;
    expect(persistedOut?.topic === 'AI 短视频内容工作流',                                  'persisted output.topic trimmed');
    expect(persistedOut?.source === 'manual',                                              'persisted output.source=manual');
  } finally {
    await cleanup(f);
  }
}

async function caseHappyTrendingWithMeta() {
  console.log('\n[case 2] happy trending — sourceMeta preserved verbatim');
  const f = await seedRun('happy-trending', '原始日记式独白爆改职场吐槽');
  try {
    const meta: TopicSourceMeta = {
      platform:       'dy',
      opusId:         '7456789012345678901',
      rank:           7,
      url:            'https://www.douyin.com/video/7456789012345678901',
      authorNickname: '某某创作者',
    };
    const ctx = buildCtx(f, '原始日记式独白爆改职场吐槽');
    const runner = new FakeTopicRunner({
      topic:      '原始日记式独白爆改职场吐槽',
      source:     'trending',
      sourceMeta: meta,
    });
    const result = await runner.run(ctx);

    expect(result.output.source === 'trending',                                            'output.source=trending');
    expect(result.output.sourceMeta?.platform === 'dy',                                    'sourceMeta.platform preserved');
    expect(result.output.sourceMeta?.opusId === meta.opusId,                               'sourceMeta.opusId preserved');
    expect(result.output.sourceMeta?.rank === 7,                                           'sourceMeta.rank preserved');
    expect(result.output.sourceMeta?.url === meta.url,                                     'sourceMeta.url preserved');
    expect(result.output.sourceMeta?.authorNickname === meta.authorNickname,               'sourceMeta.authorNickname preserved');

    const step = await readStepRow(f.runId);
    expect(step?.status === 'done',                                                        `step.status=done (got ${step?.status})`);
    const persistedOut = step?.outputJson as TopicOutput | null;
    expect(persistedOut?.sourceMeta?.platform === 'dy',                                    'persisted sourceMeta survives jsonb roundtrip');
    expect(persistedOut?.sourceMeta?.opusId === meta.opusId,                               'persisted sourceMeta.opusId roundtrip');
  } finally {
    await cleanup(f);
  }
}

async function caseTopicTooShort() {
  console.log('\n[case 3] invalid — 1-char topic → INVALID_INPUT');
  const f = await seedRun('too-short', 'A');
  try {
    const ctx = buildCtx(f, 'A');
    const runner = new TopicNodeRunner();
    let thrown: unknown = null;
    try { await runner.run(ctx); } catch (e) { thrown = e; }
    expect(thrown instanceof NodeError,                                                    'threw NodeError');
    expect((thrown as NodeError)?.code === 'INVALID_INPUT',                                `code=INVALID_INPUT (got ${(thrown as NodeError)?.code})`);
    expect((thrown as NodeError)?.retryable === false,                                     'retryable=false (validation hard-fail)');

    const step = await readStepRow(f.runId);
    expect(step?.status === 'failed',                                                      `step.status=failed (got ${step?.status})`);
    expect((step?.errorMsg ?? '').startsWith('INVALID_INPUT:'),                            `errorMsg prefixed with INVALID_INPUT: (got ${step?.errorMsg})`);
  } finally {
    await cleanup(f);
  }
}

async function caseTopicTooLong() {
  console.log('\n[case 4] invalid — 301-char topic → INVALID_INPUT');
  const longTopic = 'x'.repeat(301);
  const f = await seedRun('too-long', longTopic);
  try {
    const ctx = buildCtx(f, longTopic);
    const runner = new TopicNodeRunner();
    let thrown: unknown = null;
    try { await runner.run(ctx); } catch (e) { thrown = e; }
    expect(thrown instanceof NodeError,                                                    'threw NodeError');
    expect((thrown as NodeError)?.code === 'INVALID_INPUT',                                `code=INVALID_INPUT (got ${(thrown as NodeError)?.code})`);
  } finally {
    await cleanup(f);
  }
}

async function caseScriptUpstreamWiring() {
  console.log('\n[case 5] integration — ScriptNodeRunner.buildInput honors upstream.topic.topic');
  // Pure in-memory check — no DB writes, no LLM. We only verify the
  // contract that lets the topic node's structured output reach the
  // script node.
  const baseCtx: NodeContext = {
    runId:    'fake-run',
    tenantId: 'fake-tenant',
    userId:   'fake-user',
    region:   'CN',
    plan:     'solo',
    topic:    'CTX_TOPIC_FALLBACK',
    upstreamOutputs: {},
  };
  const script = new TestableScriptRunner();

  // 5a — no upstream.topic → falls back to ctx.topic
  const inputNoUpstream = script.callBuildInput(baseCtx);
  expect(inputNoUpstream.topic === 'CTX_TOPIC_FALLBACK',                                   '5a: no upstream → ctx.topic fallback');

  // 5b — upstream.topic present → override wins
  const ctxWithUpstream: NodeContext = {
    ...baseCtx,
    upstreamOutputs: {
      topic: { topic: 'UPSTREAM_TOPIC_WINS', source: 'manual' } as TopicOutput,
    },
  };
  const inputWithUpstream = script.callBuildInput(ctxWithUpstream);
  expect(inputWithUpstream.topic === 'UPSTREAM_TOPIC_WINS',                                '5b: upstream.topic.topic overrides ctx.topic');

  // 5c — upstream.topic with empty .topic field → still falls back (defensive)
  const ctxEmptyUpstream: NodeContext = {
    ...baseCtx,
    upstreamOutputs: {
      topic: { source: 'manual' } as unknown as TopicOutput, // missing .topic
    },
  };
  const inputEmptyUpstream = script.callBuildInput(ctxEmptyUpstream);
  expect(inputEmptyUpstream.topic === 'CTX_TOPIC_FALLBACK',                                '5c: upstream missing .topic field → fallback');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== W4-05 TopicNodeRunner unit tests ===');
  await caseHappyManual();
  await caseHappyTrendingWithMeta();
  await caseTopicTooShort();
  await caseTopicTooLong();
  await caseScriptUpstreamWiring();

  if (totalFailures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  } else {
    console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('test-topic-runner errored:', e);
  process.exit(1);
});
