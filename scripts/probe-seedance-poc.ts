// W2-04-V3 — Seedance PoC statistics probe.
//
// PURPOSE
// -------
// Run the SAME prompt N times against the real Seedance API, measure the
// four KILL-GATE metrics, and write a markdown report to `research/`.
//
//   1. success rate                     (target: ≥ 70%)
//   2. average latency (submit→terminal)
//   3. measured per-clip cost           (target: ≤ ¥15 / clip)
//   4. failure-reason distribution      (by VideoGenError.code)
//
// Pass criteria:  success ≥ 70%  AND  cost-per-clip ≤ ¥15.
// Fail either → exit 1 → triggers STRATEGY §4 kill check (W2-04 row in
// ENG_TASKS_V3.md).
//
// SAFETY
// ------
// • A real run with the defaults (50 × 10s @ ¥0.6/sec assumption) costs
//   ~¥300. The script REFUSES to start without an explicit "GO" confirmation
//   unless --no-confirm is passed.
// • A `--budget-cny` cap aborts the loop the moment cumulative measured
//   cost crosses the line, even if some `submit` calls were already issued
//   (we don't cancel in-flight jobs — money already spent — but we do not
//   issue any more).
// • `--dry-run` short-circuits the real API for a fake provider so the
//   skeleton (CLI parsing, statistics, markdown emitter) can be validated
//   for free. Use it before EVERY real run.
//
// USAGE
//   pnpm vg:probe:seedance -- --dry-run                      # ~10s, free
//   pnpm vg:probe:seedance -- --runs=5 --budget-cny=30       # ~5min, ~¥30 cap
//   pnpm vg:probe:seedance -- --runs=50 --budget-cny=350     # full PoC, ~25min
//
// ALL flags (defaults in []):
//   --runs=N             [50]      total invocations of the same prompt
//   --prompt="..."       [SAFE_DEFAULT_PROMPT below]
//   --duration=SEC       [10]      per-clip duration (Seedance accepts 3-12)
//   --resolution=RES     [720p]    480p | 720p | 1080p
//   --concurrency=C      [1]       parallel submits (1 = strict serial,
//                                  safer for rate-limit headroom)
//   --budget-cny=¥       [300]     hard cumulative cost cap; loop stops at
//                                  first run that crosses
//   --poll-interval=MS   [3000]    polling cadence
//   --max-wait=SEC       [300]     per-job wall-clock ceiling (POLL_TIMEOUT)
//   --report-dir=DIR     [../research]   (resolved relative to script cwd; the
//                                         repo's `research/` lives at project
//                                         root, one level above `app/`)
//   --report-name=NAME   [seedance_poc_<YYYY-MM-DD>.md]
//   --dry-run                       use fake provider; no money spent
//   --no-confirm                    skip the interactive "GO" prompt
//   --tag=NAME           [poc]      free-form label embedded in the report
//
// EXIT CODES
//   0 = both KILL gates passed
//   1 = at least one KILL gate failed (or aborted by budget)
//   2 = misconfiguration (missing key, bad arg)

import fs from 'node:fs/promises';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  SeedanceProvider,
  VideoGenError,
  getDefaultVideoProvider,
  type VideoGenJobSnapshot,
  type VideoGenJobStatus,
  type VideoGenRequest,
  type VideoGenSubmitResult,
  type VideoResolution,
  type VideoGenErrorCode,
} from '../src/lib/video-gen';
import { BaseVideoProvider } from '../src/lib/video-gen';
import { getVideoProviderConfig } from '../src/lib/video-gen/config';

// ─── Defaults / constants ─────────────────────────────────────────────────────

const SAFE_DEFAULT_PROMPT =
  '一只橘色小猫在洒满阳光的木地板上追逐一只飘动的羽毛，画面温暖明亮，柔和的午后光线。';

const KILL_GATE_SUCCESS_RATE = 0.7;
const KILL_GATE_COST_PER_CLIP_CNY = 15;

const PROBE_TENANT_ID = '__seedance_poc__';

// ─── CLI parsing ──────────────────────────────────────────────────────────────

interface CliArgs {
  runs: number;
  prompt: string;
  duration: number;
  resolution: VideoResolution;
  concurrency: number;
  budgetCny: number;
  pollIntervalMs: number;
  maxWaitSec: number;
  reportDir: string;
  reportName: string | null;
  dryRun: boolean;
  noConfirm: boolean;
  tag: string;
}

function parseArgs(argv: string[]): CliArgs {
  // Filter only flags (`--key=value` or `--key value` or boolean `--key`).
  const flat: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) {
      flat[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flat[key] = next;
        i++;
      } else {
        flat[key] = true;
      }
    }
  }

  const num = (k: string, d: number): number => {
    const v = flat[k];
    if (v === undefined || v === true) return d;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      console.error(`flag --${k} must be a number, got: ${String(v)}`);
      process.exit(2);
    }
    return n;
  };
  const str = (k: string, d: string): string => {
    const v = flat[k];
    return typeof v === 'string' ? v : d;
  };
  const bool = (k: string): boolean => flat[k] === true || flat[k] === 'true';

  const resolution = str('resolution', '720p');
  if (resolution !== '480p' && resolution !== '720p' && resolution !== '1080p') {
    console.error(`flag --resolution must be 480p|720p|1080p, got: ${resolution}`);
    process.exit(2);
  }

  return {
    runs:           num('runs', 50),
    prompt:         str('prompt', SAFE_DEFAULT_PROMPT),
    duration:       num('duration', 10),
    resolution:     resolution as VideoResolution,
    concurrency:    Math.max(1, num('concurrency', 1)),
    budgetCny:      num('budget-cny', 300),
    pollIntervalMs: num('poll-interval', 3000),
    maxWaitSec:     num('max-wait', 300),
    reportDir:      str('report-dir', '../research'),
    reportName:     typeof flat['report-name'] === 'string'
      ? (flat['report-name'] as string)
      : null,
    dryRun:         bool('dry-run'),
    noConfirm:      bool('no-confirm'),
    tag:            str('tag', 'poc'),
  };
}

// ─── Fake provider for --dry-run ──────────────────────────────────────────────
//
// Mimics realistic outcome distribution & latency so the report renderer
// produces something that looks like a real PoC report. NEVER touches network.
//
//   80% succeeded   (latency 30-90s, cost = duration × 60 fen)
//   12% RATE_LIMITED on submit
//    5% CONTENT_FILTERED on submit
//    3% poll returns failed status

class FakeSeedanceProvider extends BaseVideoProvider {
  readonly name = 'seedance' as const;
  readonly model = 'fake-doubao-seedance-1-0-pro-250528';
  readonly costPerMTokensFen = 1500;

  estimateTokensForFrame(durationSec: number, _resolution: VideoResolution): number {
    // Match real Seedance 480p empirical rate (D32, 2026-04-26).
    return Math.ceil(durationSec * 10_000);
  }

  private nextJobId = 1;
  private jobs = new Map<string, {
    outcome: 'succeeded' | 'failed';
    latencyMs: number;
    durationSec: number;
    submittedAt: number;
    errorMessage?: string;
  }>();

  async submit(request: VideoGenRequest): Promise<VideoGenSubmitResult> {
    const roll = Math.random();
    if (roll < 0.12) {
      throw new VideoGenError(
        'RATE_LIMITED',
        'seedance',
        '[fake] Too many requests — backoff suggested',
        true,
      );
    }
    if (roll < 0.17) {
      throw new VideoGenError(
        'CONTENT_FILTERED',
        'seedance',
        '[fake] Content moderation flagged the prompt',
        false,
      );
    }
    const willFailOnPoll = roll > 0.97; // 3%
    const jobId = `fake-job-${this.nextJobId++}`;
    this.jobs.set(jobId, {
      outcome: willFailOnPoll ? 'failed' : 'succeeded',
      latencyMs: 30_000 + Math.random() * 60_000, // 30-90s simulated wall time
      durationSec: request.durationSec,
      submittedAt: Date.now(),
      errorMessage: willFailOnPoll ? '[fake] generation crashed midway' : undefined,
    });
    return {
      jobId,
      provider: 'seedance',
      model: this.model,
      acceptedAt: new Date().toISOString(),
    };
  }

  async pollJob(jobId: string): Promise<VideoGenJobSnapshot> {
    const j = this.jobs.get(jobId);
    if (!j) {
      throw new VideoGenError('UNKNOWN', 'seedance', `[fake] no such job ${jobId}`, false);
    }
    const elapsed = Date.now() - j.submittedAt;
    if (elapsed < j.latencyMs) {
      return { jobId, provider: 'seedance', model: this.model, status: 'running' };
    }
    if (j.outcome === 'failed') {
      return {
        jobId,
        provider: 'seedance',
        model: this.model,
        status: 'failed',
        errorMessage: j.errorMessage,
      };
    }
    const tokenCount = Math.ceil(j.durationSec * 10_000);  // 480p baseline
    return {
      jobId,
      provider: 'seedance',
      model: this.model,
      status: 'succeeded',
      videoUrl: `https://fake-seedance.example.com/${jobId}.mp4`,
      actualDurationSec: j.durationSec,
      tokenCount,
      costFen: Math.ceil((tokenCount * this.costPerMTokensFen) / 1_000_000),
    };
  }

  validateConfig(): void { /* always OK */ }
  async healthCheck() { return true; }
  protected normalizeError(): VideoGenError {
    return new VideoGenError('UNKNOWN', 'seedance', '[fake] not used', false);
  }
}

// ─── One-run executor ─────────────────────────────────────────────────────────

interface RunRecord {
  index:        number;
  ok:           boolean;
  jobId?:       string;
  status?:      VideoGenJobStatus;
  errorCode?:   VideoGenErrorCode | 'POLL_TIMEOUT' | 'UNCAUGHT';
  errorMessage?: string;
  /** Submit→terminal latency, ms. Only meaningful for `ok` runs. */
  latencyMs?:   number;
  /** Cost in fen. Provider-reported when available. */
  costFen?:     number;
  videoUrl?:    string;
  actualDurationSec?: number;
}

async function runOne(
  index: number,
  provider: BaseVideoProvider,
  request: VideoGenRequest,
  pollIntervalMs: number,
  maxWaitMs: number,
): Promise<RunRecord> {
  const t0 = Date.now();
  let submit: VideoGenSubmitResult;
  try {
    submit = await provider.submit(request);
  } catch (e) {
    if (e instanceof VideoGenError) {
      return {
        index,
        ok: false,
        errorCode: e.code,
        errorMessage: e.message,
      };
    }
    return {
      index,
      ok: false,
      errorCode: 'UNCAUGHT',
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }

  // Poll loop
  while (true) {
    const elapsed = Date.now() - t0;
    if (elapsed > maxWaitMs) {
      return {
        index,
        ok: false,
        jobId: submit.jobId,
        errorCode: 'POLL_TIMEOUT',
        errorMessage: `Job did not reach terminal state within ${Math.round(maxWaitMs / 1000)}s`,
      };
    }

    let snap: VideoGenJobSnapshot;
    try {
      snap = await provider.pollJob(submit.jobId);
    } catch (e) {
      if (e instanceof VideoGenError) {
        if (e.retryable) {
          // Transient — keep polling after backoff
          await sleep(pollIntervalMs);
          continue;
        }
        return {
          index,
          ok: false,
          jobId: submit.jobId,
          errorCode: e.code,
          errorMessage: e.message,
        };
      }
      return {
        index,
        ok: false,
        jobId: submit.jobId,
        errorCode: 'UNCAUGHT',
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }

    if (snap.status === 'succeeded') {
      return {
        index,
        ok: true,
        jobId: submit.jobId,
        status: 'succeeded',
        latencyMs: Date.now() - t0,
        costFen: snap.costFen,
        videoUrl: snap.videoUrl,
        actualDurationSec: snap.actualDurationSec,
      };
    }
    if (snap.status === 'failed') {
      return {
        index,
        ok: false,
        jobId: submit.jobId,
        status: 'failed',
        errorCode: 'GENERATION_FAILED',
        errorMessage: snap.errorMessage ?? 'unknown generation failure',
      };
    }
    // queued | running → wait & poll again
    await sleep(pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Statistics ───────────────────────────────────────────────────────────────

interface Stats {
  total:           number;
  successCount:    number;
  failureCount:    number;
  successRate:     number;
  // latency stats — only over successful runs
  latency: {
    count:   number;
    meanMs:  number;
    medianMs:number;
    p95Ms:   number;
    minMs:   number;
    maxMs:   number;
  };
  // cost — sum of provider-reported costFen across ALL runs (failed runs
  // typically cost 0 because the provider doesn't bill failed jobs, but if
  // they ever do we capture it).
  cost: {
    totalFen:        number;
    perRunMeanFen:   number; // mean over total runs
    perSuccessFen:   number; // mean over successes only (= true unit cost)
  };
  errorBreakdown: Array<{ code: string; count: number; sampleMessage: string }>;
}

function computeStats(records: RunRecord[]): Stats {
  const successes = records.filter((r) => r.ok);
  const failures  = records.filter((r) => !r.ok);

  const latencies = successes
    .map((r) => r.latencyMs ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const totalCostFen = records.reduce((acc, r) => acc + (r.costFen ?? 0), 0);
  const successCostFen = successes.reduce((acc, r) => acc + (r.costFen ?? 0), 0);

  const errorBuckets = new Map<string, { count: number; sampleMessage: string }>();
  for (const f of failures) {
    const code = f.errorCode ?? 'UNKNOWN';
    const cur = errorBuckets.get(code);
    if (cur) {
      cur.count += 1;
    } else {
      errorBuckets.set(code, {
        count: 1,
        sampleMessage: f.errorMessage ?? '(no message)',
      });
    }
  }

  return {
    total:        records.length,
    successCount: successes.length,
    failureCount: failures.length,
    successRate:  records.length > 0 ? successes.length / records.length : 0,
    latency: {
      count:    latencies.length,
      meanMs:   latencies.length ? avg(latencies) : 0,
      medianMs: latencies.length ? percentile(latencies, 0.5) : 0,
      p95Ms:    latencies.length ? percentile(latencies, 0.95) : 0,
      minMs:    latencies[0] ?? 0,
      maxMs:    latencies[latencies.length - 1] ?? 0,
    },
    cost: {
      totalFen:        totalCostFen,
      perRunMeanFen:   records.length ? totalCostFen / records.length : 0,
      perSuccessFen:   successes.length ? successCostFen / successes.length : 0,
    },
    errorBreakdown: Array.from(errorBuckets.entries())
      .map(([code, v]) => ({ code, count: v.count, sampleMessage: v.sampleMessage }))
      .sort((a, b) => b.count - a.count),
  };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function fenToYuan(fen: number): number {
  return Math.round(fen) / 100;
}
function formatYuan(fen: number): string {
  return `¥${fenToYuan(fen).toFixed(2)}`;
}
function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

// ─── KILL GATE evaluation ─────────────────────────────────────────────────────

interface GateResult {
  successRatePassed: boolean;
  costPerClipPassed: boolean;
  overallPassed:     boolean;
}

function evaluateGates(stats: Stats): GateResult {
  const successRatePassed = stats.successRate >= KILL_GATE_SUCCESS_RATE;
  const costPerClipPassed =
    stats.successCount === 0
      ? false
      : fenToYuan(stats.cost.perSuccessFen) <= KILL_GATE_COST_PER_CLIP_CNY;
  return {
    successRatePassed,
    costPerClipPassed,
    overallPassed: successRatePassed && costPerClipPassed,
  };
}

// ─── Markdown report ──────────────────────────────────────────────────────────

interface ReportInput {
  cli:          CliArgs;
  startedAt:    string;
  finishedAt:   string;
  totalElapsedMs: number;
  providerModel: string;
  costPerMTokensFen: number;
  records:      RunRecord[];
  stats:        Stats;
  gates:        GateResult;
  abortedByBudget: boolean;
}

function renderReport(r: ReportInput): string {
  const titleSuffix = r.cli.dryRun ? ' [DRY RUN]' : '';
  const passEmoji = (p: boolean) => (p ? '✅' : '🔴');

  const sections: string[] = [];

  sections.push(`# Seedance PoC — ${r.cli.tag}${titleSuffix}`);
  sections.push('');
  sections.push('> W2-04-V3 KILL-GATE statistics. Generated by `pnpm vg:probe:seedance`.');
  sections.push('');

  // ─── Executive summary
  sections.push('## Executive summary');
  sections.push('');
  sections.push(`- **Overall**: ${passEmoji(r.gates.overallPassed)} ${r.gates.overallPassed ? 'PASS' : 'FAIL'}`);
  sections.push(`- **Success rate ≥ 70%**: ${passEmoji(r.gates.successRatePassed)} ${(r.stats.successRate * 100).toFixed(1)}%  (${r.stats.successCount}/${r.stats.total})`);
  if (r.stats.successCount > 0) {
    sections.push(`- **Cost per clip ≤ ¥15**: ${passEmoji(r.gates.costPerClipPassed)} ${formatYuan(r.stats.cost.perSuccessFen)}/clip  (mean over successes)`);
  } else {
    sections.push(`- **Cost per clip ≤ ¥15**: 🔴 N/A (0 successful runs — cannot measure unit cost)`);
  }
  if (r.abortedByBudget) {
    sections.push(`- ⚠ **Run aborted early**: cumulative cost crossed --budget-cny=${r.cli.budgetCny}`);
  }
  sections.push('');

  // ─── Run parameters
  sections.push('## Run parameters');
  sections.push('');
  sections.push('| Key | Value |');
  sections.push('|---|---|');
  sections.push(`| mode | ${r.cli.dryRun ? '**DRY RUN** (fake provider)' : 'real Seedance API'} |`);
  sections.push(`| runs (planned) | ${r.cli.runs} |`);
  sections.push(`| runs (executed) | ${r.records.length} |`);
  sections.push(`| prompt | \`${escapeMd(truncate(r.cli.prompt, 120))}\` |`);
  sections.push(`| duration / clip | ${r.cli.duration}s |`);
  sections.push(`| resolution | ${r.cli.resolution} |`);
  sections.push(`| concurrency | ${r.cli.concurrency} |`);
  sections.push(`| budget cap | ¥${r.cli.budgetCny} |`);
  sections.push(`| poll interval | ${r.cli.pollIntervalMs}ms |`);
  sections.push(`| max wait per job | ${r.cli.maxWaitSec}s |`);
  sections.push(`| provider model | ${r.providerModel} |`);
  sections.push(`| cost rate | ${r.costPerMTokensFen} fen / 百万 tokens (${formatYuan(r.costPerMTokensFen)}/百万 tokens) |`);
  sections.push(`| started | ${r.startedAt} |`);
  sections.push(`| finished | ${r.finishedAt} |`);
  sections.push(`| total elapsed | ${formatMs(r.totalElapsedMs)} |`);
  sections.push('');

  // ─── Aggregate
  sections.push('## Aggregate metrics');
  sections.push('');
  sections.push('| Metric | Value |');
  sections.push('|---|---|');
  sections.push(`| total runs | ${r.stats.total} |`);
  sections.push(`| successes | ${r.stats.successCount} |`);
  sections.push(`| failures | ${r.stats.failureCount} |`);
  sections.push(`| success rate | ${(r.stats.successRate * 100).toFixed(1)}% |`);
  sections.push(`| total cost | ${formatYuan(r.stats.cost.totalFen)} |`);
  sections.push(`| mean cost / run | ${formatYuan(r.stats.cost.perRunMeanFen)} |`);
  sections.push(`| **mean cost / successful clip** | **${formatYuan(r.stats.cost.perSuccessFen)}** |`);
  sections.push('');

  // ─── Latency
  sections.push('## Latency (successful runs only)');
  sections.push('');
  if (r.stats.latency.count === 0) {
    sections.push('*No successful runs — cannot compute latency distribution.*');
  } else {
    sections.push('| Metric | Value |');
    sections.push('|---|---|');
    sections.push(`| sample size | ${r.stats.latency.count} |`);
    sections.push(`| mean | ${formatMs(r.stats.latency.meanMs)} |`);
    sections.push(`| median | ${formatMs(r.stats.latency.medianMs)} |`);
    sections.push(`| p95 | ${formatMs(r.stats.latency.p95Ms)} |`);
    sections.push(`| min | ${formatMs(r.stats.latency.minMs)} |`);
    sections.push(`| max | ${formatMs(r.stats.latency.maxMs)} |`);
  }
  sections.push('');

  // ─── Error breakdown
  sections.push('## Failure-reason distribution');
  sections.push('');
  if (r.stats.errorBreakdown.length === 0) {
    sections.push('*No failures.*');
  } else {
    sections.push('| Code | Count | Sample message |');
    sections.push('|---|---|---|');
    for (const e of r.stats.errorBreakdown) {
      sections.push(`| \`${e.code}\` | ${e.count} | ${escapeMd(truncate(e.sampleMessage, 140))} |`);
    }
  }
  sections.push('');

  // ─── Per-run appendix
  sections.push('## Per-run raw appendix');
  sections.push('');
  sections.push('| # | ok | jobId | latency | cost | err.code | err.msg (first 80) |');
  sections.push('|---|---|---|---|---|---|---|');
  for (const rec of r.records) {
    sections.push([
      '',
      String(rec.index),
      rec.ok ? '✅' : '❌',
      rec.jobId ? '`' + truncate(rec.jobId, 36) + '`' : '–',
      rec.latencyMs ? formatMs(rec.latencyMs) : '–',
      rec.costFen ? formatYuan(rec.costFen) : '–',
      rec.errorCode ? '`' + rec.errorCode + '`' : '–',
      rec.errorMessage ? escapeMd(truncate(rec.errorMessage, 80)) : '–',
      '',
    ].join('|'));
  }
  sections.push('');

  // ─── Closing
  sections.push('---');
  sections.push('');
  sections.push('*If this is a real run, snapshot this file under `research/` and ' +
                'reference it from PROGRESS.md (W2-04 row).*');
  sections.push('');

  return sections.join('\n');
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function confirmInteractive(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const ans = await rl.question(question);
    return ans.trim().toUpperCase() === 'GO';
  } finally {
    rl.close();
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  console.log('--- W2-04-V3 Seedance PoC probe ---\n');
  console.log(`mode:          ${cli.dryRun ? 'DRY RUN (fake provider)' : 'REAL SEEDANCE API'}`);
  console.log(`runs:          ${cli.runs}`);
  console.log(`prompt:        ${truncate(cli.prompt, 100)}`);
  console.log(`duration:      ${cli.duration}s @ ${cli.resolution}`);
  console.log(`concurrency:   ${cli.concurrency}`);
  console.log(`budget cap:    ¥${cli.budgetCny}`);
  console.log(`max wait/job:  ${cli.maxWaitSec}s (poll every ${cli.pollIntervalMs}ms)`);
  console.log(`report dir:    ${cli.reportDir}`);
  console.log('');

  // Provider construction
  let provider: BaseVideoProvider;
  let providerCostPerMTokensFen: number;
  let providerModel: string;
  if (cli.dryRun) {
    provider = new FakeSeedanceProvider();
    providerCostPerMTokensFen = (provider as FakeSeedanceProvider).costPerMTokensFen;
    providerModel = provider.model;
    console.log('ℹ Using fake provider — no API calls, no money spent.\n');
  } else {
    const cfg = getVideoProviderConfig('seedance');
    if (!cfg.apiKey) {
      console.error('❌ SEEDANCE_API_KEY not set in .env.local.');
      console.error('   Get one at https://www.volcengine.com/docs/82379/1541594');
      console.error('   Or run with --dry-run to validate the script skeleton.');
      process.exit(2);
    }
    provider = getDefaultVideoProvider();
    providerCostPerMTokensFen = (provider as SeedanceProvider).costPerMTokensFen;
    providerModel = provider.model;
    console.log(`✓ Provider configured: model=${providerModel}, baseUrl=${cfg.baseUrl}`);

    // Worst-case cost estimation: estimateTokens × cost per M tokens
    const worstTokens = cli.runs * provider.estimateTokensForFrame(
      cli.duration,
      cli.resolution as VideoResolution,
    );
    const worstFen = Math.ceil((worstTokens * providerCostPerMTokensFen) / 1_000_000);
    console.log(`⚠ Worst-case cost (all succeed): ${formatYuan(worstFen)} (${worstTokens.toLocaleString()} tokens @ ¥${(providerCostPerMTokensFen / 100).toFixed(2)}/百万)`);
    if (worstFen / 100 > cli.budgetCny) {
      console.log(`  Budget cap (¥${cli.budgetCny}) will trigger early stop before all ${cli.runs} runs complete.`);
    }
    console.log('');

    if (!cli.noConfirm) {
      const ok = await confirmInteractive(
        `Type "GO" to proceed (anything else cancels): `,
      );
      if (!ok) {
        console.log('Cancelled.');
        process.exit(0);
      }
    }
  }

  // Execute the loop
  const startedAt = new Date();
  const records: RunRecord[] = [];
  let cumulativeCostFen = 0;
  let abortedByBudget = false;
  const budgetCapFen = cli.budgetCny * 100;

  const request: VideoGenRequest = {
    prompt:      cli.prompt,
    durationSec: cli.duration,
    resolution:  cli.resolution,
    tenantId:    PROBE_TENANT_ID,
  };

  // Concurrency-bounded execution. We dispatch in waves so the budget check
  // catches up between rounds.
  const indices = Array.from({ length: cli.runs }, (_, i) => i + 1);
  let nextIdx = 0;
  const inFlight = new Set<Promise<void>>();
  let successCount = 0;
  let failureCount = 0;

  while (nextIdx < indices.length || inFlight.size > 0) {
    if (abortedByBudget) break;

    while (
      inFlight.size < cli.concurrency &&
      nextIdx < indices.length &&
      !abortedByBudget
    ) {
      const i = indices[nextIdx++];
      const p = runOne(
        i,
        provider,
        request,
        cli.pollIntervalMs,
        cli.maxWaitSec * 1000,
      ).then((rec) => {
        records.push(rec);
        if (rec.ok) successCount += 1; else failureCount += 1;
        if (rec.costFen) cumulativeCostFen += rec.costFen;
        if (cumulativeCostFen >= budgetCapFen && !abortedByBudget) {
          abortedByBudget = true;
        }
        // One-line status with current totals
        const done = records.length;
        const elapsedMs = Date.now() - startedAt.getTime();
        process.stdout.write(
          `[${String(done).padStart(3)}/${cli.runs}] ` +
          `✅${String(successCount).padStart(3)} ` +
          `❌${String(failureCount).padStart(3)} ` +
          `cost=${formatYuan(cumulativeCostFen).padStart(8)} ` +
          `elapsed=${formatMs(elapsedMs)}  ` +
          (rec.ok
            ? `latency=${formatMs(rec.latencyMs ?? 0)}`
            : `❌${rec.errorCode}: ${truncate(rec.errorMessage ?? '', 50)}`) +
          '\n',
        );
      }).finally(() => {
        inFlight.delete(p);
      });
      inFlight.add(p);
    }

    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }

  // Wait for any stragglers (race only resolves first)
  await Promise.allSettled(Array.from(inFlight));

  const finishedAt = new Date();
  // Sort records by index for stable appendix
  records.sort((a, b) => a.index - b.index);

  // Compute + render
  const stats = computeStats(records);
  const gates = evaluateGates(stats);
  const reportInput: ReportInput = {
    cli,
    startedAt:      startedAt.toISOString(),
    finishedAt:     finishedAt.toISOString(),
    totalElapsedMs: finishedAt.getTime() - startedAt.getTime(),
    providerModel,
    costPerMTokensFen: providerCostPerMTokensFen,
    records,
    stats,
    gates,
    abortedByBudget,
  };
  const md = renderReport(reportInput);

  // Write report
  const dateStr = new Date().toISOString().slice(0, 10);
  const dryTag = cli.dryRun ? '_dryrun' : '';
  const fname = cli.reportName
    ?? `seedance_poc_${dateStr}${dryTag}.md`;
  const fullPath = path.resolve(cli.reportDir, fname);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, md, 'utf8');

  // Final stdout summary
  console.log('');
  console.log('--- Summary ---');
  console.log(`success rate:        ${(stats.successRate * 100).toFixed(1)}%  (${stats.successCount}/${stats.total})  ${gates.successRatePassed ? '✅ ≥70%' : '🔴 <70%'}`);
  if (stats.successCount > 0) {
    console.log(`mean cost / clip:    ${formatYuan(stats.cost.perSuccessFen)}  ${gates.costPerClipPassed ? '✅ ≤¥15' : '🔴 >¥15'}`);
    console.log(`mean latency:        ${formatMs(stats.latency.meanMs)} (median ${formatMs(stats.latency.medianMs)}, p95 ${formatMs(stats.latency.p95Ms)})`);
  } else {
    console.log(`mean cost / clip:    N/A (no successful runs)  🔴`);
  }
  console.log(`total cost:          ${formatYuan(stats.cost.totalFen)}`);
  console.log(`total elapsed:       ${formatMs(reportInput.totalElapsedMs)}`);
  if (abortedByBudget) {
    console.log(`⚠ aborted early at ¥${cli.budgetCny} budget cap`);
  }
  console.log('');
  console.log(`Report written to: ${fullPath}`);
  console.log('');
  console.log(gates.overallPassed
    ? '🟢 KILL GATE PASSED — W2-04 unblocks W2 Gate.'
    : '🔴 KILL GATE FAILED — see report for failure breakdown. Triggers STRATEGY §4 kill check.');

  process.exit(gates.overallPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('probe errored:', e);
  process.exit(1);
});
