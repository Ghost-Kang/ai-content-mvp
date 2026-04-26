// W2-03-V3 unit tests for the Seedance video-gen client.
//
// Verifies the submit + poll loop + error taxonomy by injecting a fake
// `fetch` (the SeedanceProvider constructor accepts an optional FetchImpl).
// No DB, no network — runs in < 1 sec.
//
// Acceptance grid (from ENG_TASKS_V3.md W2-03 row):
//   ✓ happy submit → succeeded poll
//   ✓ rate limit (429 throttle)              → RATE_LIMITED retryable
//   ✓ quota exhausted (429 + quota wording)  → AUTH_FAILED non-retryable
//   ✓ bad request (400)                      → BAD_REQUEST non-retryable
//   ✓ server error (5xx)                     → PROVIDER_UNAVAILABLE retryable
//   ✓ content moderated                       → CONTENT_FILTERED non-retryable
//   ✓ poll returns failed status              → snapshot.status='failed' + errorMessage
//   ✓ poll returns running                    → snapshot.status='running' (no throw)
//   ✓ network error (fetch throws)            → PROVIDER_UNAVAILABLE retryable
//
// Run: pnpm vg:test:seedance

import { SeedanceProvider } from '../src/lib/video-gen/providers/seedance';
import type { FetchImpl } from '../src/lib/video-gen/providers/base';
import { VideoGenError } from '../src/lib/video-gen/types';
import type { VideoGenRequest } from '../src/lib/video-gen/types';

// ─── Test seam: queueable fake fetch ──────────────────────────────────────────

interface CannedResponse {
  status: number;
  body?: unknown;
  /** If set, fetch throws this instead of returning a response. */
  throwError?: Error;
}

function makeFakeFetch(queue: ReadonlyArray<CannedResponse>): {
  fetch: FetchImpl;
  calls: Array<{ url: string; method: string; body?: string; headers: Headers }>;
} {
  const calls: Array<{ url: string; method: string; body?: string; headers: Headers }> = [];
  let i = 0;
  const fetch: FetchImpl = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const method = init?.method ?? 'GET';
    const body   = typeof init?.body === 'string' ? init.body : undefined;
    const headers = new Headers(init?.headers as HeadersInit);
    calls.push({ url, method, body, headers });

    const r = queue[i++];
    if (!r) throw new Error(`fake fetch ran out of canned responses at call ${i}`);
    if (r.throwError) throw r.throwError;
    return new Response(JSON.stringify(r.body ?? {}), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch, calls };
}

// ─── Test harness ─────────────────────────────────────────────────────────────

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

const baseRequest = (): VideoGenRequest => ({
  prompt:      '产品经理坐在办公桌前皱眉,室内自然光,简约工业风背景,中景镜头',
  durationSec: 5,
  resolution:  '720p',
  tenantId:    'test-tenant',
});

// SEEDANCE_API_KEY must be set for validateConfig to pass; tests inject a
// fixed fake regardless of .env.local — assertions on the Authorization
// header pin the literal value, and we don't want a real key to leak into
// test output / logs / CI.
process.env.SEEDANCE_API_KEY = 'fake-key-for-tests';

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappySubmitAndSucceededPoll() {
  console.log('\n[case 1] happy — submit returns id, poll returns succeeded with video_url');
  const { fetch, calls } = makeFakeFetch([
    { status: 200, body: { id: 'cgt-abc-001', created_at: 1777075200 } },
    {
      status: 200,
      body: {
        id: 'cgt-abc-001',
        model: 'doubao-seedance-1-0-pro-250528',
        status: 'succeeded',
        content: { video_url: 'https://ark-cdn.example.com/cgt-abc-001.mp4' },
        // D32 (2026-04-26): real Ark response uses completion_tokens
        // + duration; cost = tokens × ¥15/M = 103,818 × 1500/1M = 156 fen
        usage: { completion_tokens: 103_818, total_tokens: 103_818 },
        duration: 5,
      },
    },
  ]);
  const provider = new SeedanceProvider(fetch);

  const submit = await provider.submit(baseRequest());
  expect(submit.jobId === 'cgt-abc-001',                    `submit.jobId === cgt-abc-001 (got ${submit.jobId})`);
  expect(submit.provider === 'seedance',                    'submit.provider === seedance');
  expect(submit.acceptedAt === '2026-04-25T00:00:00.000Z',  `acceptedAt parsed from created_at (got ${submit.acceptedAt})`);

  const submitCall = calls[0];
  expect(submitCall.method === 'POST',                      'submit issues POST');
  expect(submitCall.url.endsWith('/api/v3/contents/generations/tasks'),
                                                            `submit hits canonical Ark path (got ${submitCall.url})`);
  expect(submitCall.headers.get('authorization') === 'Bearer fake-key-for-tests',
                                                            'Authorization header carries Bearer + key');
  const reqBody = JSON.parse(submitCall.body!);
  expect(reqBody.model === 'doubao-seedance-1-0-pro-250528','request body uses configured model');
  expect(reqBody.duration === 5 && reqBody.resolution === '720p',
                                                            'duration + resolution propagated');
  expect(Array.isArray(reqBody.content) && reqBody.content[0].type === 'text',
                                                            'content[0] is text prompt');

  const snap = await provider.pollJob(submit.jobId);
  expect(snap.status === 'succeeded',                       `poll.status === succeeded (got ${snap.status})`);
  expect(snap.videoUrl === 'https://ark-cdn.example.com/cgt-abc-001.mp4',
                                                            'poll exposes video_url');
  expect(snap.actualDurationSec === 5,                      'poll exposes actualDurationSec from `duration` field');
  expect(snap.tokenCount === 103_818,                       'poll surfaces completion_tokens');
  // 103_818 × 1500 / 1_000_000 = 155.727 → ceil = 156
  expect(snap.costFen === 156,                              `costFen = ceil(103_818 × ¥15/M) = ${snap.costFen}`);
}

async function caseRateLimit() {
  console.log('\n[case 2] rate limit — 429 throttle → RATE_LIMITED retryable');
  const { fetch } = makeFakeFetch([
    { status: 429, body: { error: { code: 'rate_limited', message: 'too many requests, retry later' } } },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try { await provider.submit(baseRequest()); } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'submit threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'RATE_LIMITED',                  `code === RATE_LIMITED (got ${thrown.code})`);
    expect(thrown.retryable === true,                       'retryable=true');
  }
}

async function caseQuotaExhausted() {
  console.log('\n[case 3] quota exhausted — 429 + quota wording → AUTH_FAILED non-retryable');
  const { fetch } = makeFakeFetch([
    { status: 429, body: { error: { code: 'quota_exhausted', message: 'monthly quota insufficient, please recharge' } } },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try { await provider.submit(baseRequest()); } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'submit threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'AUTH_FAILED',                   `code === AUTH_FAILED (got ${thrown.code})`);
    expect(thrown.retryable === false,                      'retryable=false (do NOT burn money on retries)');
  }
}

async function caseBadRequest() {
  console.log('\n[case 4] bad request — 400 invalid params → BAD_REQUEST non-retryable');
  const { fetch } = makeFakeFetch([
    { status: 400, body: { error: { code: 'invalid_parameter', message: 'duration must be 3..12' } } },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try {
    await provider.submit({ ...baseRequest(), durationSec: 99 });
  } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'submit threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'BAD_REQUEST',                   `code === BAD_REQUEST (got ${thrown.code})`);
    expect(thrown.retryable === false,                      'retryable=false');
    expect(thrown.message.includes('duration must be 3..12'),'error message preserves provider detail');
  }
}

async function caseServerError() {
  console.log('\n[case 5] server error — 502 → PROVIDER_UNAVAILABLE retryable');
  const { fetch } = makeFakeFetch([
    { status: 502, body: { error: { code: 'upstream_error', message: 'bad gateway' } } },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try { await provider.submit(baseRequest()); } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'submit threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'PROVIDER_UNAVAILABLE',          `code === PROVIDER_UNAVAILABLE (got ${thrown.code})`);
    expect(thrown.retryable === true,                       'retryable=true');
  }
}

async function caseContentModerated() {
  console.log('\n[case 6] content moderation — risk_control → CONTENT_FILTERED non-retryable');
  const { fetch } = makeFakeFetch([
    { status: 400, body: { error: { code: 'risk_control', message: 'sensitive content detected' } } },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try { await provider.submit(baseRequest()); } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'submit threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'CONTENT_FILTERED',              `code === CONTENT_FILTERED (got ${thrown.code})`);
    expect(thrown.retryable === false,                      'retryable=false (needs prompt edit)');
  }
}

async function caseNetworkError() {
  console.log('\n[case 7] network error — fetch throws → PROVIDER_UNAVAILABLE retryable');
  const { fetch } = makeFakeFetch([
    { status: 0, throwError: new Error('ECONNRESET') },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try { await provider.submit(baseRequest()); } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'submit threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'PROVIDER_UNAVAILABLE',          `code === PROVIDER_UNAVAILABLE (got ${thrown.code})`);
    expect(thrown.retryable === true,                       'retryable=true');
    expect(thrown.message.includes('ECONNRESET'),           'underlying network error preserved');
  }
}

async function casePollRunningThenFailed() {
  console.log('\n[case 8] poll lifecycle — running snapshot then failed snapshot');
  const { fetch } = makeFakeFetch([
    { status: 200, body: { id: 'cgt-fail-001', model: 'm', status: 'running' } },
    {
      status: 200,
      body: {
        id: 'cgt-fail-001',
        model: 'm',
        status: 'failed',
        error: { code: 'gen_failed', message: 'model could not render the requested motion' },
      },
    },
  ]);
  const provider = new SeedanceProvider(fetch);

  const snap1 = await provider.pollJob('cgt-fail-001');
  expect(snap1.status === 'running',                        `first poll status === running (got ${snap1.status})`);
  expect(snap1.videoUrl === undefined,                      'no videoUrl while running');
  expect(snap1.errorMessage === undefined,                  'no errorMessage while running');

  const snap2 = await provider.pollJob('cgt-fail-001');
  expect(snap2.status === 'failed',                         `second poll status === failed (got ${snap2.status})`);
  expect(snap2.errorMessage?.includes('could not render') === true,
                                                            'errorMessage preserves provider detail');
  expect(snap2.videoUrl === undefined,                      'no videoUrl on failure');
}

async function caseSucceededWithoutVideoUrl() {
  console.log('\n[case 9] succeeded but missing video_url → throws UNKNOWN (provider contract violation)');
  const { fetch } = makeFakeFetch([
    { status: 200, body: { id: 'cgt-bug-001', model: 'm', status: 'succeeded', content: {} } },
  ]);
  const provider = new SeedanceProvider(fetch);

  let thrown: unknown;
  try { await provider.pollJob('cgt-bug-001'); } catch (e) { thrown = e; }
  expect(thrown instanceof VideoGenError,                   'poll threw VideoGenError');
  if (thrown instanceof VideoGenError) {
    expect(thrown.code === 'UNKNOWN',                       `code === UNKNOWN (got ${thrown.code})`);
    expect(thrown.retryable === false,                      'retryable=false (data corruption, not transient)');
  }
}

async function caseValidateConfigBlocksWithoutKey() {
  console.log('\n[case 10] validateConfig — missing key surfaces actionable error');
  const oldKey = process.env.SEEDANCE_API_KEY;
  delete process.env.SEEDANCE_API_KEY;
  try {
    const provider = new SeedanceProvider(makeFakeFetch([]).fetch);
    let thrown: unknown;
    try { provider.validateConfig(); } catch (e) { thrown = e; }
    expect(thrown instanceof Error,                         'validateConfig threw');
    if (thrown instanceof Error) {
      expect(thrown.message.includes('SEEDANCE_API_KEY'),   'error names the missing env var');
      expect(thrown.message.includes('volcengine.com'),     'error points to the credential URL');
    }
  } finally {
    process.env.SEEDANCE_API_KEY = oldKey;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- W2-03-V3 SeedanceProvider unit tests (mocked fetch) ---');

  await caseHappySubmitAndSucceededPoll();
  await caseRateLimit();
  await caseQuotaExhausted();
  await caseBadRequest();
  await caseServerError();
  await caseContentModerated();
  await caseNetworkError();
  await casePollRunningThenFailed();
  await caseSucceededWithoutVideoUrl();
  await caseValidateConfigBlocksWithoutKey();

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
