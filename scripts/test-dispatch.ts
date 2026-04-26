// W2-07a unit tests for the workflow dispatcher.
//
// Pure offline — no DB, no network, no QStash. Both modes are exercised
// through the DispatchDeps injection seam.
//
// Cases:
//   1. inline mode → calls runInline with runId, returns immediately
//   2. inline mode → does NOT block on slow runInline
//   3. qstash mode → calls publish with worker URL + runId body, returns
//                    messageId
//   4. qstash mode → no public URL → DispatchError(NO_PUBLIC_URL)
//   5. explicit mode override (WORKFLOW_DISPATCH_MODE=qstash)
//   6. explicit mode invalid → DispatchError(BAD_MODE)
//   7. publish throws → DispatchError(PUBLISH_FAILED) (not bare error)
//
// Run: pnpm wf:test:dispatch

import {
  dispatchRun,
  resolveDispatchMode,
  DispatchError,
  type DispatchDeps,
} from '../src/lib/workflow/dispatch';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

// Snapshot env so each case starts clean. Mutating process.env per-test
// is fine because tsx runs the file as a single process top-to-bottom.
const ENV_KEYS_TO_SAVE = [
  'WORKFLOW_DISPATCH_MODE',
  'QSTASH_TOKEN',
  'WORKFLOW_WORKER_BASE_URL',
  'VERCEL_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS_TO_SAVE) savedEnv[k] = process.env[k];

function clearEnv() {
  for (const k of ENV_KEYS_TO_SAVE) delete process.env[k];
}

function restoreEnv() {
  for (const k of ENV_KEYS_TO_SAVE) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

const RUN_ID = '00000000-0000-0000-0000-00000000abcd';

// ─── case 1: inline calls runInline + returns immediately ─────────────────────

async function caseInlineHappy() {
  console.log('\n[case 1] inline mode → calls runInline with runId');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'inline';

  const seen: string[] = [];
  const deps: DispatchDeps = {
    runInline: (id) => { seen.push(id); },
  };

  const result = await dispatchRun(RUN_ID, deps);
  expect(result.mode === 'inline', `mode === 'inline' (got ${result.mode})`);
  expect(seen.length === 1, `runInline invoked once (got ${seen.length})`);
  expect(seen[0] === RUN_ID, `runInline invoked with correct runId`);
  expect(result.messageId === undefined, 'no messageId in inline mode');
  expect(typeof result.dispatchedAt === 'string' && result.dispatchedAt.length > 0,
    'dispatchedAt populated');
}

// ─── case 2: inline does NOT block on slow runInline ──────────────────────────

async function caseInlineNonBlocking() {
  console.log('\n[case 2] inline mode → does NOT block on slow runInline');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'inline';

  // Inject a runInline that returns a 5s-deferred promise. dispatchRun
  // must NOT await it (it returns void and the dispatcher discards).
  let resolved = false;
  const deps: DispatchDeps = {
    runInline: () => {
      void new Promise<void>((r) => setTimeout(() => { resolved = true; r(); }, 5_000));
    },
  };

  const t0 = Date.now();
  await dispatchRun(RUN_ID, deps);
  const elapsed = Date.now() - t0;
  expect(elapsed < 100, `dispatch returned in <100ms (got ${elapsed}ms)`);
  expect(resolved === false, 'dispatch did NOT wait for runInline to settle');
}

// ─── case 3: qstash publishes with correct URL + body ─────────────────────────

async function caseQstashHappy() {
  console.log('\n[case 3] qstash mode → publishes with worker URL + body');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'qstash';
  process.env.WORKFLOW_WORKER_BASE_URL = 'https://example.test';

  let publishedUrl  = '';
  let publishedBody: { runId: string } | null = null;
  const deps: DispatchDeps = {
    publish: async ({ url, body }) => {
      publishedUrl  = url;
      publishedBody = body;
      return { messageId: 'msg_abc123' };
    },
  };

  const result = await dispatchRun(RUN_ID, deps);
  expect(result.mode === 'qstash', `mode === 'qstash' (got ${result.mode})`);
  expect(publishedUrl === 'https://example.test/api/workflow/run',
    `worker URL constructed correctly (got ${publishedUrl})`);
  expect(publishedBody !== null && (publishedBody as { runId: string }).runId === RUN_ID,
    `body contains runId`);
  expect(result.messageId === 'msg_abc123',
    `messageId surfaced (got ${result.messageId})`);
}

// ─── case 4: qstash + no public URL → DispatchError ───────────────────────────

async function caseQstashNoUrl() {
  console.log('\n[case 4] qstash mode + no public URL → DispatchError(NO_PUBLIC_URL)');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'qstash';
  // intentionally no WORKFLOW_WORKER_BASE_URL / VERCEL_URL / NEXT_PUBLIC_APP_URL

  let thrown: unknown;
  try {
    await dispatchRun(RUN_ID, {
      publish: async () => ({ messageId: 'should-not-be-called' }),
    });
  } catch (e) { thrown = e; }
  expect(thrown instanceof DispatchError, 'threw DispatchError');
  expect((thrown as DispatchError).code === 'NO_PUBLIC_URL',
    `code === NO_PUBLIC_URL (got ${(thrown as DispatchError).code})`);
}

// ─── case 5: WORKFLOW_DISPATCH_MODE=qstash explicit ───────────────────────────

async function caseExplicitMode() {
  console.log('\n[case 5] explicit WORKFLOW_DISPATCH_MODE=qstash overrides auto-detect');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'qstash';
  process.env.WORKFLOW_WORKER_BASE_URL = 'https://x.test';
  // Note: QSTASH_TOKEN is NOT set; default publish would fail, but we
  // override with deps.publish so we never reach it.

  expect(resolveDispatchMode() === 'qstash', `resolveDispatchMode() === qstash`);
}

// ─── case 6: invalid WORKFLOW_DISPATCH_MODE → DispatchError ───────────────────

async function caseInvalidMode() {
  console.log('\n[case 6] invalid WORKFLOW_DISPATCH_MODE → DispatchError(BAD_MODE)');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'banana';

  let thrown: unknown;
  try { resolveDispatchMode(); } catch (e) { thrown = e; }
  expect(thrown instanceof DispatchError, 'threw DispatchError');
  expect((thrown as DispatchError).code === 'BAD_MODE',
    `code === BAD_MODE (got ${(thrown as DispatchError).code})`);
}

// ─── case 7: publish throws → wrapped as DispatchError(PUBLISH_FAILED) ────────

async function casePublishThrows() {
  console.log('\n[case 7] publish throws → DispatchError(PUBLISH_FAILED)');
  clearEnv();
  process.env.WORKFLOW_DISPATCH_MODE = 'qstash';
  process.env.WORKFLOW_WORKER_BASE_URL = 'https://x.test';

  let thrown: unknown;
  try {
    await dispatchRun(RUN_ID, {
      publish: async () => { throw new Error('quota exceeded'); },
    });
  } catch (e) { thrown = e; }
  expect(thrown instanceof DispatchError, 'threw DispatchError (not bare Error)');
  expect((thrown as DispatchError).code === 'PUBLISH_FAILED',
    `code === PUBLISH_FAILED (got ${(thrown as DispatchError).code})`);
  expect(((thrown as DispatchError).message ?? '').includes('quota exceeded'),
    `inner error message preserved`);
}

// ─── auto-detect smoke (case 8) ───────────────────────────────────────────────

async function caseAutoDetect() {
  console.log('\n[case 8] auto-detect: QSTASH_TOKEN + VERCEL_URL → qstash');
  clearEnv();
  process.env.QSTASH_TOKEN  = 'qstash_test_token';
  process.env.VERCEL_URL    = 'ai-content-mvp.vercel.app';
  expect(resolveDispatchMode() === 'qstash',
    `resolveDispatchMode() === qstash (got ${resolveDispatchMode()})`);

  console.log('\n[case 8b] auto-detect: no QSTASH_TOKEN → inline');
  clearEnv();
  process.env.VERCEL_URL = 'ai-content-mvp.vercel.app';
  expect(resolveDispatchMode() === 'inline',
    `resolveDispatchMode() === inline`);
}

// ─── runner ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    await caseInlineHappy();
    await caseInlineNonBlocking();
    await caseQstashHappy();
    await caseQstashNoUrl();
    await caseExplicitMode();
    await caseInvalidMode();
    await casePublishThrows();
    await caseAutoDetect();
  } finally {
    restoreEnv();
  }

  console.log(totalFailures === 0 ? '\n✅ All assertions pass.' : `\n❌ ${totalFailures} failure(s).`);
  process.exit(totalFailures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Unexpected harness error', err);
  process.exit(1);
});
