// D31 (2026-04-26) — Offline unit tests for the 新榜 (newrank) client.
//
// Injects a fake fetch into NewrankClient and exercises every branch
// of listFiles() + listFilesAllPlatforms() + input validation, so this
// whole file runs in < 1 sec with NO network and NO NEWRANK_API_KEY.
//
// What this covers (so we can move W4-01 forward without live docs):
//   ✓ happy 200 → NewrankListResult populated, headers include `key:`
//   ✓ listFilesAllPlatforms fans out to all 4 platforms in parallel
//   ✓ partial failure: one platform errors, other 3 still return data
//   ✓ HTTP 401 / 403 → AUTH_FAILED, not retryable
//   ✓ server-envelope code 10001 / 10002 → BAD_REQUEST, not retryable
//   ✓ HTTP 429 → RATE_LIMITED, retryable
//   ✓ HTTP 502 / 503 → PROVIDER_UNAVAILABLE, retryable
//   ✓ body not JSON → PARSE_FAILED (HTTP status surfaced)
//   ✓ data is not an array → PARSE_FAILED
//   ✓ data[i] missing url/md5/name → PARSE_FAILED
//   ✓ unknown-platform / malformed-date input → BAD_REQUEST, no fetch
//   ✓ fetch throws (network) → PROVIDER_UNAVAILABLE, retryable
//   ✓ AbortError (timeout) → PROVIDER_UNAVAILABLE, retryable
//   ✓ request shape: url ends with /htkj/file/list, header key present,
//     body = {platform,date}
//
// What this does NOT cover (needs live API key + real probe):
//   ✗ actual file download format (csv / json / xlsx) — the parser
//     choice for W4-01 is blocked on `ds:probe:newrank` output saved
//     under docs/research/newrank_sample_*.
//
// Run:  pnpm ds:test:newrank

import {
  NewrankClient,
  DataSourceError,
  type NewrankPlatform,
  type NewrankConfig,
} from '../src/lib/data-source/newrank';

// ─── Test seam ────────────────────────────────────────────────────────────────

interface CannedResponse {
  status: number;
  /** If provided, returned as raw string (lets us simulate non-JSON body). */
  rawBody?: string;
  /** Parsed JSON body; ignored if rawBody is set. */
  body?: unknown;
  /** If set, fetch throws this instead of returning a Response. */
  throwError?: Error;
}

type FetchLike = typeof fetch;

function makeFakeFetch(queue: ReadonlyArray<CannedResponse>): {
  fetch: FetchLike;
  calls: Array<{ url: string; method: string; body?: string; headers: Headers }>;
  remaining: () => number;
} {
  const calls: Array<{ url: string; method: string; body?: string; headers: Headers }> = [];
  let i = 0;
  const fetch: FetchLike = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
    const responseBody = r.rawBody ?? JSON.stringify(r.body ?? {});
    return new Response(responseBody, {
      status: r.status,
      headers: { 'Content-Type': r.rawBody ? 'text/plain' : 'application/json' },
    });
  }) as unknown as FetchLike;
  return { fetch, calls, remaining: () => queue.length - i };
}

// Pattern matches the structure of scripts/test-seedance-client.ts for parity.
const TEST_CONFIG: NewrankConfig = {
  apiKey:  'fake-key-never-leaves-this-file',
  baseUrl: 'https://api.newrank.cn/api/v2/custom/hub',
};

// ─── Test harness ─────────────────────────────────────────────────────────────

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

function section(title: string) {
  console.log(`\n▶ ${title}`);
}

// ─── Canned bodies ────────────────────────────────────────────────────────────

function okBody(platform: NewrankPlatform, date: string, n = 1) {
  const files = Array.from({ length: n }, (_, idx) => ({
    url:  `https://cdn.newrank.cn/fake/${platform}-${date}-${idx}.csv`,
    md5:  `md5-${platform}-${idx}`.padEnd(32, '0'),
    name: `${platform}-daily-${date}-${idx}.csv`,
  }));
  return {
    requestId: `req-${platform}-${date}`,
    code:      200,
    msg:       'success',
    data:      files,
  };
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function caseHappy() {
  section('happy 200 (single platform)');
  const { fetch, calls } = makeFakeFetch([
    { status: 200, body: okBody('dy', '2026-04-24', 2) },
  ]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  const r = await client.listFiles({ platform: 'dy', date: '2026-04-24' });

  expect(r.provider === 'newrank',        'provider stamped = newrank');
  expect(r.platform === 'dy',             'platform echoed back');
  expect(r.date === '2026-04-24',         'date echoed back');
  expect(r.requestId === 'req-dy-2026-04-24', 'requestId propagated');
  expect(r.files.length === 2,            'files length = 2');
  expect(r.files[0].url.startsWith('https://'), 'file url is a URL');
  expect(r.msg === 'success',             'msg propagated');

  const [c] = calls;
  expect(c.method === 'POST',             'method = POST');
  expect(c.url.endsWith('/htkj/file/list'), `url ends with /htkj/file/list (${c.url})`);
  expect(c.headers.get('key') === TEST_CONFIG.apiKey, 'header `key` = config.apiKey (lowercase, not Authorization)');
  expect(c.headers.get('content-type') === 'application/json', 'content-type = application/json');
  const parsedBody = JSON.parse(c.body ?? '{}');
  expect(parsedBody.platform === 'dy' && parsedBody.date === '2026-04-24',
    'body = {platform, date}');
}

async function caseAllPlatformsPartial() {
  section('listFilesAllPlatforms — partial failure does not poison others');
  const { fetch } = makeFakeFetch([
    { status: 200, body: okBody('dy',  '2026-04-24', 1) },
    { status: 200, body: okBody('ks',  '2026-04-24', 1) },
    { status: 429, body: { code: 429, msg: 'throttled', requestId: 'r-xhs' } },
    { status: 200, body: okBody('bz',  '2026-04-24', 1) },
  ]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  const out = await client.listFilesAllPlatforms('2026-04-24');

  expect(out.length === 4, '4 results returned');
  const byPlatform = new Map(out.map((r) => [r.platform, r.result]));

  const dy = byPlatform.get('dy');
  expect(dy !== undefined && !(dy instanceof DataSourceError),
    'dy result is a NewrankListResult');
  const xhs = byPlatform.get('xhs');
  expect(xhs instanceof DataSourceError && xhs.code === 'RATE_LIMITED',
    'xhs result is DataSourceError(RATE_LIMITED)');
  const bz = byPlatform.get('bz');
  expect(bz !== undefined && !(bz instanceof DataSourceError),
    'bz still OK despite xhs failure');
}

async function caseAuthFailed() {
  section('HTTP 401/403 → AUTH_FAILED (not retryable)');
  for (const status of [401, 403]) {
    const { fetch } = makeFakeFetch([
      { status, body: { code: status, message: 'unauthorized', requestId: 'r-401' } },
    ]);
    const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
    let caught: unknown;
    try {
      await client.listFiles({ platform: 'dy', date: '2026-04-24' });
    } catch (e) { caught = e; }
    expect(caught instanceof DataSourceError, `HTTP ${status}: threw DataSourceError`);
    const err = caught as DataSourceError;
    expect(err.code === 'AUTH_FAILED',     `HTTP ${status}: code = AUTH_FAILED`);
    expect(err.retryable === false,        `HTTP ${status}: retryable = false`);
    expect(err.serverCode === status,      `HTTP ${status}: serverCode preserved`);
  }
}

async function caseBadRequestEnvelope() {
  section('envelope code 10001/10002 → BAD_REQUEST (not retryable)');
  for (const code of [10001, 10002]) {
    const { fetch } = makeFakeFetch([
      { status: 200, body: { code, msg: 'missing param', requestId: 'r-bad' } },
    ]);
    const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
    let caught: unknown;
    try {
      await client.listFiles({ platform: 'dy', date: '2026-04-24' });
    } catch (e) { caught = e; }
    expect(caught instanceof DataSourceError, `envelope ${code}: threw DataSourceError`);
    const err = caught as DataSourceError;
    expect(err.code === 'BAD_REQUEST',     `envelope ${code}: code = BAD_REQUEST`);
    expect(err.retryable === false,        `envelope ${code}: retryable = false`);
    expect(err.serverCode === code,        `envelope ${code}: serverCode preserved`);
  }
}

async function caseRateLimited() {
  section('HTTP 429 → RATE_LIMITED (retryable)');
  const { fetch } = makeFakeFetch([
    { status: 429, body: { code: 429, msg: 'throttled' } },
  ]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  let caught: unknown;
  try {
    await client.listFiles({ platform: 'dy', date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                          '429: threw DataSourceError');
  expect((caught as DataSourceError).code === 'RATE_LIMITED',         '429: code = RATE_LIMITED');
  expect((caught as DataSourceError).retryable === true,              '429: retryable = true');
}

async function caseProviderUnavailable() {
  section('HTTP 502/503 → PROVIDER_UNAVAILABLE (retryable)');
  for (const status of [502, 503]) {
    const { fetch } = makeFakeFetch([
      { status, body: { code: status, msg: 'upstream' } },
    ]);
    const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
    let caught: unknown;
    try {
      await client.listFiles({ platform: 'dy', date: '2026-04-24' });
    } catch (e) { caught = e; }
    expect(caught instanceof DataSourceError, `HTTP ${status}: threw DataSourceError`);
    expect((caught as DataSourceError).code === 'PROVIDER_UNAVAILABLE',
      `HTTP ${status}: code = PROVIDER_UNAVAILABLE`);
    expect((caught as DataSourceError).retryable === true,
      `HTTP ${status}: retryable = true`);
  }
}

async function caseParseFailedBody() {
  section('response body not JSON → PARSE_FAILED');
  const { fetch } = makeFakeFetch([
    { status: 500, rawBody: '<html>internal server error</html>' },
  ]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  let caught: unknown;
  try {
    await client.listFiles({ platform: 'dy', date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                        'non-JSON: threw DataSourceError');
  expect((caught as DataSourceError).code === 'PARSE_FAILED',       'non-JSON: code = PARSE_FAILED');
  expect((caught as DataSourceError).serverCode === 500,            'non-JSON: surfaced HTTP status as serverCode');
}

async function caseParseFailedShape() {
  section('response.data not an array → PARSE_FAILED');
  const { fetch } = makeFakeFetch([
    { status: 200, body: { code: 200, msg: 'success', data: { weird: true }, requestId: 'r' } },
  ]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  let caught: unknown;
  try {
    await client.listFiles({ platform: 'dy', date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                              'bad shape: threw DataSourceError');
  expect((caught as DataSourceError).code === 'PARSE_FAILED',             'bad shape: code = PARSE_FAILED');
}

async function caseParseFailedItem() {
  section('response.data[i] missing field → PARSE_FAILED');
  const { fetch } = makeFakeFetch([
    { status: 200, body: {
        code: 200, msg: 'success', requestId: 'r',
        data: [
          { url: 'https://x/1', md5: 'abc', name: 'ok.csv' },
          { url: 'https://x/2', md5: 'abc' },   // missing name
        ],
      },
    },
  ]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  let caught: unknown;
  try {
    await client.listFiles({ platform: 'dy', date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                      'missing field: threw');
  expect((caught as DataSourceError).code === 'PARSE_FAILED',     'missing field: code = PARSE_FAILED');
  expect(/data\[1\]/.test((caught as DataSourceError).message),   'error message pinpoints row index');
}

async function caseInputValidation() {
  section('client-side validation: bad platform / bad date → BAD_REQUEST, no fetch');
  const { fetch, remaining } = makeFakeFetch([]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });

  let caught: unknown;
  try {
    await client.listFiles({ platform: 'twitter' as unknown as NewrankPlatform, date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                      'bad platform: threw');
  expect((caught as DataSourceError).code === 'BAD_REQUEST',      'bad platform: code = BAD_REQUEST');
  expect((caught as DataSourceError).retryable === false,         'bad platform: retryable = false');

  caught = undefined;
  try {
    await client.listFiles({ platform: 'dy', date: '2026/04/24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                      'bad date: threw');
  expect((caught as DataSourceError).code === 'BAD_REQUEST',      'bad date: code = BAD_REQUEST');

  expect(remaining() === 0,                                       'no fetch was issued for invalid input');
}

async function caseNetworkError() {
  section('fetch throws (network error) → PROVIDER_UNAVAILABLE (retryable)');
  const netErr = new Error('ECONNRESET');
  const { fetch } = makeFakeFetch([{ status: 0, throwError: netErr }]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch });
  let caught: unknown;
  try {
    await client.listFiles({ platform: 'dy', date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                        'network: threw DataSourceError');
  expect((caught as DataSourceError).code === 'PROVIDER_UNAVAILABLE',
    'network: code = PROVIDER_UNAVAILABLE');
  expect((caught as DataSourceError).retryable === true,           'network: retryable = true');
  expect((caught as DataSourceError).cause === netErr,             'network: cause preserved for debugging');
}

async function caseTimeout() {
  section('AbortError (timeout) → PROVIDER_UNAVAILABLE (retryable)');
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const { fetch } = makeFakeFetch([{ status: 0, throwError: abort }]);
  const client = new NewrankClient({ config: TEST_CONFIG, fetchImpl: fetch, timeoutMs: 50 });
  let caught: unknown;
  try {
    await client.listFiles({ platform: 'dy', date: '2026-04-24' });
  } catch (e) { caught = e; }
  expect(caught instanceof DataSourceError,                                    'timeout: threw');
  expect((caught as DataSourceError).code === 'PROVIDER_UNAVAILABLE',           'timeout: code = PROVIDER_UNAVAILABLE');
  expect((caught as DataSourceError).retryable === true,                        'timeout: retryable = true');
  expect(/timed out/i.test((caught as DataSourceError).message),                'timeout: message mentions timed out');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('─── newrank client: offline unit tests ───');

  await caseHappy();
  await caseAllPlatformsPartial();
  await caseAuthFailed();
  await caseBadRequestEnvelope();
  await caseRateLimited();
  await caseProviderUnavailable();
  await caseParseFailedBody();
  await caseParseFailedShape();
  await caseParseFailedItem();
  await caseInputValidation();
  await caseNetworkError();
  await caseTimeout();

  console.log('\n─────────────────────────────────────────────');
  if (totalFailures === 0) {
    console.log('✅ ALL CASES PASSED');
    process.exit(0);
  } else {
    console.log(`❌ ${totalFailures} assertion(s) failed`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('test runner errored:', e);
  process.exit(1);
});
