// W3-07 — Unit tests for friendlyFromNodeError().
//
// Covers:
//   1. All NodeError taxonomy codes get a non-empty title + detail + hint
//   2. Same code emits different copy when node context differs (PROVIDER_FAILED
//      means Seedance for video, Vercel Blob for export)
//   3. Empty / null / unparseable error_msg → safe fallback
//   4. Specific cause-string heuristics fire (api key missing, rate limited,
//      timeout, content filtered, context too long)
//   5. isOpsIssue / isRetryable flags are sensible per code
//
// Pure / no-DB / no-LLM. Runs in <100ms.
//
// Run: pnpm wf:test:friendly

import { friendlyFromNodeError } from '../src/lib/error-messages';
import type { NodeType } from '../src/lib/workflow/types';

let failures = 0;
function expect(cond: boolean, msg: string) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${tag}] ${msg}`);
}

function group(name: string) {
  console.log(`\n${name}`);
}

function nonEmpty(s: string): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

// ─── Case 1: every taxonomy code emits a populated envelope ───────────────────

function caseAllCodesPopulated() {
  group('[case 1] every NodeError code → non-empty title/detail/hint');
  const codes: ReadonlyArray<string> = [
    'UPSTREAM_MISSING',
    'INVALID_INPUT',
    'SPEND_CAP_EXCEEDED',
    'PARSE_FAILED',
    'VALIDATION_FAILED',
    'LLM_FATAL',
    'PROVIDER_FAILED',
    'UNKNOWN',
  ];
  const nodes: ReadonlyArray<NodeType> = ['script', 'storyboard', 'video', 'export'];
  for (const code of codes) {
    for (const node of nodes) {
      const f = friendlyFromNodeError(`${code}: synthetic test message for ${node}`, node);
      expect(nonEmpty(f.title),  `${code} × ${node}: title non-empty`);
      expect(nonEmpty(f.detail), `${code} × ${node}: detail non-empty`);
      expect(nonEmpty(f.hint),   `${code} × ${node}: hint non-empty`);
      expect(typeof f.isRetryable === 'boolean', `${code} × ${node}: isRetryable is boolean`);
      expect(typeof f.isOpsIssue  === 'boolean', `${code} × ${node}: isOpsIssue is boolean`);
    }
  }
}

// ─── Case 2: cross-node differentiation for same code ─────────────────────────

function caseCrossNodeDifferentiation() {
  group('[case 2] same code differentiates by node (PROVIDER_FAILED)');
  const video  = friendlyFromNodeError(
    'PROVIDER_FAILED: video frame 1 failed: API authentication failed',
    'video',
  );
  const exp    = friendlyFromNodeError(
    'PROVIDER_FAILED: export upload failed: AUTH: blob token invalid',
    'export',
  );
  expect(video.title !== exp.title, 'video PROVIDER_FAILED title ≠ export PROVIDER_FAILED title');
  expect(video.title.includes('视频'), `video PROVIDER_FAILED title mentions 视频 — got "${video.title}"`);
  expect(exp.title.includes('导出') || exp.title.includes('上传'),
    `export PROVIDER_FAILED title mentions 导出/上传 — got "${exp.title}"`);
}

// ─── Case 3: empty / null / unparseable input → safe fallback ─────────────────

function caseEmptyOrUnparseable() {
  group('[case 3] empty / null / unparseable error_msg');

  const nullCase = friendlyFromNodeError(null, 'video');
  expect(nullCase.code === 'UNKNOWN', `null → code UNKNOWN (got ${nullCase.code})`);
  expect(nonEmpty(nullCase.title), 'null → title non-empty');
  expect(nullCase.isRetryable === true, 'null → isRetryable=true (safe default)');

  const emptyCase = friendlyFromNodeError('', 'script');
  expect(emptyCase.code === 'UNKNOWN', `empty → code UNKNOWN (got ${emptyCase.code})`);

  const whitespace = friendlyFromNodeError('   \n   ', 'script');
  expect(whitespace.code === 'UNKNOWN', 'whitespace-only → code UNKNOWN');

  const garbled = friendlyFromNodeError('this is not a valid CODE: prefix', 'video');
  // "this" is lowercase → won't match /^[A-Z_]+:/, so code is UNPARSEABLE
  expect(garbled.code === 'UNPARSEABLE',
    `garbled → code UNPARSEABLE (got ${garbled.code})`);
  expect(garbled.rawMessage.includes('this is not a valid'),
    'garbled → rawMessage preserves original');
}

// ─── Case 4: cause-string heuristics ──────────────────────────────────────────

function caseCauseHeuristics() {
  group('[case 4] cause-string heuristics fire correctly');

  // API key missing (the real-world Seedance bug we saw in W2-07a)
  const apiKey = friendlyFromNodeError(
    'UNKNOWN: video frame 1 unknown error: Seedance API key not configured',
    'video',
  );
  expect(apiKey.isOpsIssue === true, 'api key missing → isOpsIssue=true');
  expect(apiKey.isRetryable === false, 'api key missing → isRetryable=false');
  expect(apiKey.title.includes('未配置') || apiKey.title.includes('配置'),
    `api key missing → title mentions 配置 — got "${apiKey.title}"`);

  // PROVIDER_FAILED with AUTH_FAILED inside → ops issue, not retryable
  const auth = friendlyFromNodeError(
    'PROVIDER_FAILED: video frame 2 AUTH_FAILED: invalid api key',
    'video',
  );
  expect(auth.isOpsIssue === true,  'PROVIDER_FAILED + AUTH_FAILED → isOpsIssue=true');
  expect(auth.isRetryable === false, 'PROVIDER_FAILED + AUTH_FAILED → isRetryable=false');

  // PROVIDER_FAILED + RATE_LIMITED → retryable (wait + retry)
  const rate = friendlyFromNodeError(
    'PROVIDER_FAILED: video frame 3 RATE_LIMITED: too many requests',
    'video',
  );
  expect(rate.isRetryable === true, 'PROVIDER_FAILED + RATE_LIMITED → isRetryable=true');
  expect(rate.isOpsIssue === false, 'PROVIDER_FAILED + RATE_LIMITED → isOpsIssue=false');
  expect(rate.title.includes('限流'), `RATE_LIMITED → title mentions 限流 — got "${rate.title}"`);

  // POLL_TIMEOUT
  const timeout = friendlyFromNodeError(
    'PROVIDER_FAILED: video frame 4 POLL_TIMEOUT: provider timed out after 300s',
    'video',
  );
  expect(timeout.title.includes('超时'), `POLL_TIMEOUT → title mentions 超时 — got "${timeout.title}"`);
  expect(timeout.isRetryable === true, 'POLL_TIMEOUT → isRetryable=true');

  // LLM_FATAL with CONTEXT_TOO_LONG
  const ctx = friendlyFromNodeError(
    'LLM_FATAL: LLM CONTEXT_TOO_LONG: 8001 > 8000',
    'storyboard',
  );
  expect(ctx.title.includes('长度') || ctx.title.includes('上限'),
    `CONTEXT_TOO_LONG → title mentions 长度/上限 — got "${ctx.title}"`);
  expect(ctx.isRetryable === false, 'CONTEXT_TOO_LONG → isRetryable=false');

  // LLM_FATAL with CONTENT_FILTERED
  const cf = friendlyFromNodeError(
    'LLM_FATAL: LLM CONTENT_FILTERED: 内容包含敏感词',
    'script',
  );
  expect(cf.title.includes('过滤'), `CONTENT_FILTERED → title mentions 过滤 — got "${cf.title}"`);
  expect(cf.isRetryable === false, 'CONTENT_FILTERED → isRetryable=false');

  // LLM_FATAL with AUTH_FAILED
  const llmAuth = friendlyFromNodeError(
    'LLM_FATAL: LLM AUTH_FAILED: insufficient_quota',
    'script',
  );
  expect(llmAuth.isOpsIssue === true,  'LLM AUTH_FAILED → isOpsIssue=true');
  expect(llmAuth.isRetryable === false, 'LLM AUTH_FAILED → isRetryable=false');

  // LLM_FATAL with SPEND_CAP_EXCEEDED (tenant-level)
  // Real production payload: storyboard wraps non-retryable LLMError as
  // NodeError('LLM_FATAL', 'LLM SPEND_CAP_EXCEEDED: Tenant daily cap hit: 526/500 分')
  // and we must not mislead the user with "auth/context/filter" copy.
  const tenantCap = friendlyFromNodeError(
    'LLM_FATAL: LLM SPEND_CAP_EXCEEDED: Tenant daily cap hit: 526/500 分',
    'storyboard',
  );
  expect(tenantCap.title.includes('预算'), `tenant SPEND_CAP → title mentions 预算 — got "${tenantCap.title}"`);
  expect(tenantCap.detail.includes('团队'), `tenant SPEND_CAP → detail mentions 团队 — got "${tenantCap.detail}"`);
  expect(tenantCap.isRetryable === false, 'tenant SPEND_CAP → isRetryable=false');
  expect(tenantCap.isOpsIssue === true,   'tenant SPEND_CAP → isOpsIssue=true');
  expect(!tenantCap.detail.includes('认证') && !tenantCap.detail.includes('过滤'),
    `tenant SPEND_CAP must NOT show auth/filter copy — got detail "${tenantCap.detail}"`);

  // LLM_FATAL with SPEND_CAP_EXCEEDED (global)
  const globalCap = friendlyFromNodeError(
    'LLM_FATAL: LLM SPEND_CAP_EXCEEDED: Global daily cap hit: 5012/5000 分',
    'script',
  );
  expect(globalCap.title.includes('系统'),  `global SPEND_CAP → title mentions 系统 — got "${globalCap.title}"`);
  expect(globalCap.isRetryable === false,    'global SPEND_CAP → isRetryable=false');
  expect(globalCap.isOpsIssue === true,      'global SPEND_CAP → isOpsIssue=true');
}

// ─── Case 5: SPEND_CAP_EXCEEDED + UPSTREAM_MISSING flags ──────────────────────

function caseFlagSemantics() {
  group('[case 5] SPEND_CAP_EXCEEDED + UPSTREAM_MISSING flag semantics');

  const cap = friendlyFromNodeError(
    'SPEND_CAP_EXCEEDED: monthly cap of 50000 fen exceeded (would push to 51200)',
    'video',
  );
  expect(cap.isRetryable === false, 'SPEND_CAP_EXCEEDED → isRetryable=false (waiting for reset)');
  expect(cap.isOpsIssue === true,    'SPEND_CAP_EXCEEDED → isOpsIssue=true (admin needs to act)');

  // Real production payload from SpendCapError — distinguishes video cap vs cost cap.
  const videoCap = friendlyFromNodeError(
    'SPEND_CAP_EXCEEDED: Monthly cap exceeded: video_cap_exceeded (cost 3477/50000 fen, videos 51/60)',
    'video',
  );
  expect(videoCap.title.includes('视频条数'), `video cap → title says 视频条数 — got "${videoCap.title}"`);
  expect(videoCap.detail.includes('51 / 60'), `video cap → detail shows 51/60 — got "${videoCap.detail}"`);
  expect(videoCap.hint.includes('WORKFLOW_MONTHLY_VIDEO_CAP_COUNT'), 'video cap → hint names the env var to bump');
  expect(videoCap.isRetryable === false, 'video cap → isRetryable=false');
  expect(videoCap.isOpsIssue === true,   'video cap → isOpsIssue=true');

  const costCap = friendlyFromNodeError(
    'SPEND_CAP_EXCEEDED: Monthly cap exceeded: cost_cap_exceeded (cost 51200/50000 fen, videos 30/60)',
    'video',
  );
  expect(costCap.title.includes('预算'),     `cost cap → title says 预算 — got "${costCap.title}"`);
  expect(costCap.detail.includes('512.00 元'), `cost cap → detail shows numbers in 元 — got "${costCap.detail}"`);
  expect(costCap.hint.includes('WORKFLOW_MONTHLY_COST_CAP_CNY'), 'cost cap → hint names the env var to bump');

  const upstream = friendlyFromNodeError(
    'UPSTREAM_MISSING: Node export requires upstream video output but it is missing',
    'export',
  );
  expect(upstream.isRetryable === false, 'UPSTREAM_MISSING → isRetryable=false (must fix upstream)');
  expect(upstream.isOpsIssue === false,  'UPSTREAM_MISSING → isOpsIssue=false (user can fix)');

  const parse = friendlyFromNodeError(
    'PARSE_FAILED: LLM returned no parseable storyboard across all retries',
    'storyboard',
  );
  expect(parse.isRetryable === true, 'PARSE_FAILED → isRetryable=true');
  expect(parse.isOpsIssue === false, 'PARSE_FAILED → isOpsIssue=false');

  const validation = friendlyFromNodeError(
    'VALIDATION_FAILED: storyboard validation failed across 4 attempts: COUNT mismatch',
    'storyboard',
  );
  expect(validation.isRetryable === true, 'VALIDATION_FAILED (storyboard) → isRetryable=true');

  const exportValidation = friendlyFromNodeError(
    'VALIDATION_FAILED: export node: storyboard frame 5 has no matching video frame (video produced 4/5 frames)',
    'export',
  );
  expect(exportValidation.title.includes('导出'),
    `VALIDATION_FAILED + export node → title mentions 导出 — got "${exportValidation.title}"`);
}

// ─── Case 6: rawMessage is preserved verbatim ─────────────────────────────────

function caseRawMessagePreserved() {
  group('[case 6] rawMessage strips the leading "CODE: " but preserves rest');

  const msg = 'PROVIDER_FAILED: video frame 7 GENERATION_FAILED: pipeline error xyz123';
  const f = friendlyFromNodeError(msg, 'video');
  expect(f.rawMessage === 'video frame 7 GENERATION_FAILED: pipeline error xyz123',
    `rawMessage strips CODE prefix only — got "${f.rawMessage}"`);

  // Multi-line raw messages survive (s flag in regex)
  const multi = friendlyFromNodeError(
    'UNKNOWN: line one\nline two\nline three',
    'script',
  );
  expect(multi.rawMessage.includes('line one'), 'multi-line: line one preserved');
  expect(multi.rawMessage.includes('line three'), 'multi-line: line three preserved');
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('--- W3-07 friendlyFromNodeError tests ---');
  caseAllCodesPopulated();
  caseCrossNodeDifferentiation();
  caseEmptyOrUnparseable();
  caseCauseHeuristics();
  caseFlagSemantics();
  caseRawMessagePreserved();

  console.log('');
  if (failures === 0) {
    console.log('✅ All W3-07 friendly-error assertions pass.');
    process.exit(0);
  } else {
    console.log(`❌ ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main();
