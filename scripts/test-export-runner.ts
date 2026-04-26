// W3-01-V3 + W3-04-V3 unit tests for ExportNodeRunner.
//
// Builds fake upstream outputs (storyboard + video) directly into ctx and
// invokes runner.run(). Uses the real DB for workflow_steps persistence —
// matches the pattern of test-storyboard-runner.ts / test-video-runner.ts.
//
// Cases:
//   1. happy 3-frame, no storage      — bundle null, JSON artifacts present
//   2. video count < storyboard       — VALIDATION_FAILED (no partial deliverables)
//   3. upstream storyboard missing    — UPSTREAM_MISSING
//   4. upstream video missing         — UPSTREAM_MISSING
//   5. storage configured, mock OK    — bundle.signedUrl populated, uploader called once
//   6. storage configured, fetch flake → succeeds on retry, output.bundle present
//   7. storage configured, uploader throws StorageError → PROVIDER_FAILED
//   8. export_overrides + disabled disclosure — compliance_audit_logs 一条（需 003 迁移）
//
// Run: pnpm wf:test:export:runner

import { eq } from 'drizzle-orm';
import {
  db,
  tenants,
  users,
  workflowRuns,
  workflowSteps,
  monthlyUsage,
  complianceAuditLogs,
} from '../src/db';
import { ExportNodeRunner } from '../src/lib/workflow/nodes/export';
import {
  NodeError,
  type NodeContext,
} from '../src/lib/workflow/types';
import type { StoryboardNodeOutput } from '../src/lib/workflow/nodes/storyboard';
import type { VideoNodeOutput } from '../src/lib/workflow/nodes/video';
import { StorageError } from '../src/lib/storage';
import { COMPLIANCE_ACTION_EXPORT_DISCLOSURE_OFF } from '../src/lib/compliance/record-audit';
import type { ClipFetcher } from '../src/lib/export';
import type { UploadBundleResult } from '../src/lib/storage';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

interface Fixture { tenantId: string; userId: string; runId: string }

async function seedRun(label: string): Promise<Fixture> {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `export-runner-${label}-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId:    tenant.id,
      clerkUserId: `export-runner-${label}-${ts}`,
      email:       `export-runner-${label}-${ts}@gen.test`,
      role:        'owner',
    })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      tenantId:  tenant.id,
      createdBy: user.id,
      topic:     `export-runner-test-${label}`,
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

function fakeStoryboard(frameCount: number): StoryboardNodeOutput {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    index:          i + 1,
    voiceover:      `第 ${i + 1} 帧旁白`,
    durationSec:    5,
    cameraLanguage: '中景' as const,
    scene:          `场景 ${i + 1}`,
    imagePrompt:    `产品经理坐在办公桌前皱眉,室内自然光,简约工业风背景,中景镜头 #${i + 1}`,
    onScreenText:   i % 2 === 0 ? `字幕 ${i + 1}` : undefined,
  }));
  return {
    promptVersion:    'v0',
    frames,
    totalDurationSec: frames.length * 5,
    suppressionFlags: [],
    llmModel:         'fake-storyboard',
    generatedAt:      new Date().toISOString(),
    provider:         'fake',
    latencyMs:        100,
    retryCount:       0,
    qualityIssue:     null,
  };
}

function fakeVideo(frameCount: number): VideoNodeOutput {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    index:             i + 1,
    jobId:             `job-${i + 1}`,
    videoUrl:          `https://cdn.seedance.example/clips/frame-${i + 1}.mp4`,
    provider:          'seedance',
    model:             'fake-seedance-1',
    costFen:           300,
    actualDurationSec: 5,
    attemptCount:      1,
  }));
  return {
    frames,
    totalCostFen:     frameCount * 300,
    totalDurationSec: frameCount * 5,
    provider:         'seedance',
    model:            'fake-seedance-1',
    resolution:       '720p',
  };
}

function buildCtx(
  f: Fixture,
  storyboard: StoryboardNodeOutput | null,
  video:      VideoNodeOutput | null,
  exportOverrides?: NodeContext['exportOverrides'],
): NodeContext {
  const ctx: NodeContext = {
    runId:    f.runId,
    tenantId: f.tenantId,
    userId:   f.userId,
    region:   'CN',
    plan:     'solo',
    topic:    'export runner test',
    upstreamOutputs: {},
  };
  if (exportOverrides) ctx.exportOverrides = exportOverrides;
  if (storyboard) ctx.upstreamOutputs.storyboard = storyboard;
  if (video)      ctx.upstreamOutputs.video      = video;
  return ctx;
}

// ─── Test seam helpers (W3-04 mocks) ──────────────────────────────────────────

function fakeMp4(seed: number, sizeBytes = 256): Uint8Array {
  const buf = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) buf[i] = (seed + i) & 0xff;
  return buf;
}

function makeFakeFetcher(input: VideoNodeOutput, opts: { firstAttemptFails?: boolean } = {}): {
  fetcher: ClipFetcher;
  callCounts: Record<string, number>;
} {
  const callCounts: Record<string, number> = {};
  const fetcher: ClipFetcher = async (url: string) => {
    callCounts[url] = (callCounts[url] ?? 0) + 1;
    if (opts.firstAttemptFails && callCounts[url] === 1) {
      // Simulate transient CDN failure on first attempt for the first frame only.
      if (url === input.frames[0].videoUrl) {
        return new Response('temporarily unavailable', { status: 503, statusText: 'Service Unavailable' });
      }
    }
    return new Response(new Blob([fakeMp4(url.length, 256) as BlobPart]), { status: 200 });
  };
  return { fetcher, callCounts };
}

interface UploaderCall { tenantId: string; runId: string; bundle: Uint8Array; filename: string }

function makeFakeUploader(opts: { fail?: boolean } = {}): {
  uploader: (a: UploaderCall) => Promise<UploadBundleResult>;
  calls:    UploaderCall[];
} {
  const calls: UploaderCall[] = [];
  const uploader = async (a: UploaderCall): Promise<UploadBundleResult> => {
    calls.push(a);
    if (opts.fail) {
      throw new StorageError('UPLOAD_FAILED', 'simulated supabase 5xx');
    }
    return {
      objectPath: `exports/${a.tenantId}/${a.runId}/${a.filename}`,
      signedUrl:  `https://supabase.example/sign/${a.runId}/${a.filename}?token=fake`,
      expiresAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bytes:      a.bundle.byteLength,
    };
  };
  return { uploader, calls };
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappy3Frame() {
  console.log('\n[case 1] happy 3-frame, no storage configured — bundle=null, artifacts present');
  const f = await seedRun('happy');
  const ctx = buildCtx(f, fakeStoryboard(3), fakeVideo(3));
  // Force storage-not-configured to keep this test offline.
  const runner = new ExportNodeRunner({ storageConfiguredFn: () => false });

  const result = await runner.run(ctx);

  expect(result.costFen === 0,                          'export node costFen === 0');
  expect(result.videoCount === 0,                       'export node videoCount === 0');
  expect(typeof result.output.scriptText === 'string' && result.output.scriptText.length > 0,
                                                        'scriptText non-empty');
  expect(result.output.scriptText.includes('本内容由 AI 辅助生成'),
                                                        'AI watermark present');
  expect(typeof result.output.fcpxml.fcpxml === 'string' && result.output.fcpxml.fcpxml.length > 0,
                                                        'fcpxml string present');
  expect(result.output.fcpxml.downloadHints.length === 3,
                                                        'downloadHints aligned with 3 frames');
  expect(result.output.fcpxml.schemaVersion === 'fcpxml-1.13', 'schemaVersion fcpxml-1.13');
  expect(result.output.totalDurationSec === 15,         `totalDurationSec === 15s (got ${result.output.totalDurationSec})`);
  expect(result.output.bundle === null,                 'output.bundle === null when storage unconfigured');
  expect(result.meta?.bundleSkipped === true,           'meta.bundleSkipped === true');

  expect(
    /project\.fcpxml|fcpxm[l]?/i.test(result.output.fcpxml.fcpxml),
    'fcpxml looks like an FCPXML document',
  );

  // workflow_steps row written
  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'done',                       'workflow_steps.status === done');
  expect(step?.nodeType === 'export',                   'workflow_steps.nodeType === export');
  expect(step?.costFen === 0,                           'workflow_steps.cost_fen === 0');

  await cleanup(f);
}

async function caseVideoCountMismatch() {
  console.log('\n[case 2] video count < storyboard — VALIDATION_FAILED, no partial export');
  const f = await seedRun('mismatch');
  // 5 storyboard frames but only 3 video frames — orphaned storyboard frames.
  const ctx = buildCtx(f, fakeStoryboard(5), fakeVideo(3));
  const runner = new ExportNodeRunner();

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof NodeError,                   'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'VALIDATION_FAILED',         `code === VALIDATION_FAILED (got ${thrown.code})`);
    expect(/storyboard frame|video frame/i.test(thrown.message),
                                                        'message names the missing frame');
    expect(thrown.retryable === false,                  'retryable=false');
  }

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                     'workflow_steps.status === failed');

  await cleanup(f);
}

async function caseStoryboardMissing() {
  console.log('\n[case 3] upstream storyboard missing — UPSTREAM_MISSING');
  const f = await seedRun('no-sb');
  const ctx = buildCtx(f, /*storyboard*/ null, fakeVideo(3));
  const runner = new ExportNodeRunner();

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof NodeError,                   'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'UPSTREAM_MISSING',          `code === UPSTREAM_MISSING (got ${thrown.code})`);
    expect(thrown.message.includes('storyboard'),       'message names storyboard');
  }

  await cleanup(f);
}

async function caseVideoMissing() {
  console.log('\n[case 4] upstream video missing — UPSTREAM_MISSING');
  const f = await seedRun('no-vid');
  const ctx = buildCtx(f, fakeStoryboard(3), /*video*/ null);
  const runner = new ExportNodeRunner();

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof NodeError,                   'run() threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'UPSTREAM_MISSING',          `code === UPSTREAM_MISSING (got ${thrown.code})`);
    expect(thrown.message.includes('video'),            'message names video');
  }

  await cleanup(f);
}

// ─── W3-04 cases ──────────────────────────────────────────────────────────────

async function caseStorageHappy() {
  console.log('\n[case 5] storage configured + uploader OK — bundle.signedUrl populated');
  const f = await seedRun('storage-ok');
  const video = fakeVideo(3);
  const ctx = buildCtx(f, fakeStoryboard(3), video);

  const { fetcher, callCounts } = makeFakeFetcher(video);
  const { uploader, calls }     = makeFakeUploader();

  const runner = new ExportNodeRunner({
    storageConfiguredFn: () => true,
    fetcher,
    uploader,
  });
  const result = await runner.run(ctx);

  expect(result.output.bundle !== null,                 'output.bundle is not null');
  if (result.output.bundle) {
    expect(result.output.bundle.signedUrl.startsWith('https://supabase.example/'),
                                                        `signedUrl looks correct (got ${result.output.bundle.signedUrl})`);
    expect(result.output.bundle.objectPath.includes(f.runId),
                                                        'objectPath includes runId');
    expect(result.output.bundle.filename.endsWith('.zip'),
                                                        'filename ends with .zip');
    expect(result.output.bundle.bytes > 0,              `bundle.bytes > 0 (got ${result.output.bundle.bytes})`);
    expect(result.output.bundle.missingFrames.length === 0,
                                                        'no missing frames');
  }
  expect(calls.length === 1,                            `uploader called exactly once (got ${calls.length})`);
  expect(Object.values(callCounts).every((c) => c === 1),
                                                        'each clip URL fetched exactly once');
  expect(result.meta?.bundleSkipped === false,          'meta.bundleSkipped === false');
  expect(typeof result.meta?.bundleBytes === 'number',  'meta.bundleBytes recorded');

  await cleanup(f);
}

async function caseStorageRetry() {
  console.log('\n[case 6] storage configured + first fetch flake — retry succeeds');
  const f = await seedRun('storage-retry');
  const video = fakeVideo(3);
  const ctx = buildCtx(f, fakeStoryboard(3), video);

  const { fetcher, callCounts } = makeFakeFetcher(video, { firstAttemptFails: true });
  const { uploader, calls }     = makeFakeUploader();

  const runner = new ExportNodeRunner({
    storageConfiguredFn: () => true,
    fetcher,
    uploader,
  });

  const t0 = Date.now();
  const result = await runner.run(ctx);
  const elapsed = Date.now() - t0;

  expect(result.output.bundle !== null,                 'bundle present after retry');
  expect(calls.length === 1,                            'uploader called once (after retried bundle)');
  // Frame 1's URL was fetched twice (1 fail + 1 success per attempt × at least one retry)
  const firstUrl = video.frames[0].videoUrl;
  expect((callCounts[firstUrl] ?? 0) >= 2,              `frame-1 URL fetched ≥ 2 times (got ${callCounts[firstUrl]})`);
  expect(elapsed >= 1_500,                              `elapsed includes 2s backoff (got ${elapsed}ms)`);

  await cleanup(f);
}

async function caseStorageUploadFails() {
  console.log('\n[case 7] storage configured + uploader throws StorageError → PROVIDER_FAILED');
  const f = await seedRun('storage-fail');
  const video = fakeVideo(3);
  const ctx = buildCtx(f, fakeStoryboard(3), video);

  const { fetcher } = makeFakeFetcher(video);
  const { uploader } = makeFakeUploader({ fail: true });

  const runner = new ExportNodeRunner({
    storageConfiguredFn: () => true,
    fetcher,
    uploader,
  });

  let thrown: unknown;
  try { await runner.run(ctx); } catch (e) { thrown = e; }

  expect(thrown instanceof NodeError,                   'threw NodeError');
  if (thrown instanceof NodeError) {
    expect(thrown.code === 'PROVIDER_FAILED',           `code === PROVIDER_FAILED (got ${thrown.code})`);
    expect(thrown.message.includes('UPLOAD_FAILED'),    'message names UPLOAD_FAILED');
  }

  const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, f.runId));
  expect(step?.status === 'failed',                     'workflow_steps.status === failed');

  await cleanup(f);
}

async function caseDisclosureDisabledAudit() {
  console.log('\n[case 8] compliance — disclosure disabled + audit log row');
  const f = await seedRun('compliance');
  const ctx = buildCtx(f, fakeStoryboard(3), fakeVideo(3), { aiDisclosureLabel: { disabled: true } });
  const runner = new ExportNodeRunner({ storageConfiguredFn: () => false });
  const result = await runner.run(ctx);

  expect(result.output.fcpxml.fcpxml.length > 0,     'fcpxml produced');
  const rows = await db
    .select()
    .from(complianceAuditLogs)
    .where(eq(complianceAuditLogs.runId, f.runId));
  expect(rows.length === 1,                        `1 compliance row (got ${rows.length})`);
  expect(rows[0]?.action === COMPLIANCE_ACTION_EXPORT_DISCLOSURE_OFF, 'action matches');
  const topic = (rows[0]?.detail as { topic?: string })?.topic;
  expect(topic === 'export runner test',            'detail.topic echoed');

  await cleanup(f);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- W3-01/W3-04-V3 ExportNodeRunner unit tests (real DB, no LLM, no real provider) ---');

  await caseHappy3Frame();
  await caseVideoCountMismatch();
  await caseStoryboardMissing();
  await caseVideoMissing();
  await caseStorageHappy();
  await caseStorageRetry();
  await caseStorageUploadFails();
  try {
    await caseDisclosureDisabledAudit();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation "compliance_audit_logs" does not exist|compliance_audit_logs/.test(msg)) {
      console.log('  [SKIP] case 8 needs: pnpm db:migrate:compliance');
    } else {
      throw e;
    }
  }

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
