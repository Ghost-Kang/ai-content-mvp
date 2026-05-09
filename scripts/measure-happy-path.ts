// Daily P50/P95 collector for the LAUNCH_CHECKLIST happy-path red line
// (P50 < 7 min · P95 < 10 min, 5-day aggregate). Designed to be run by
// the same local cron that runs cap-watch — appends one row to a CSV
// log AND one human-readable line to LAUNCH_DAILY_NOTES.md.
//
// Run:
//   pnpm perf:snapshot                  # human readable + appends to docs
//   pnpm perf:snapshot --json           # machine readable (cron / webhook)
//   pnpm perf:snapshot --no-write       # don't append to disk (dry-run)
//
// Exit code: 0 = collected, 1 = no done runs today (insufficient sample),
// 2 = errored. Cron-friendly.
//
// Sources of truth:
//   - workflow_runs.completed_at - created_at        : end-to-end wall time
//   - workflow_steps.{started_at,completed_at}.dur   : per-node latency
//   - we keep BOTH because run-level captures user-thinking gaps in
//     Solo Review (which step-level misses), step-level catches per-node
//     regressions (which run-level masks).

import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CSV_PATH  = resolve(REPO_ROOT, 'docs/perf-snapshots.csv');
const NOTES_PATH = resolve(REPO_ROOT, 'docs/LAUNCH_DAILY_NOTES.md');

interface NodeStat { node: string; n: number; p50: number; p95: number }
interface RunStat  { n: number; p50: number; p95: number }
interface Snapshot {
  ts:        string;          // ISO
  cnDate:    string;          // YYYY-MM-DD CN
  run:       RunStat;
  steps:     NodeStat[];
  redLineP50Min: number;       // 7
  redLineP95Min: number;       // 10
  redLineP50Pass: boolean;     // run.p50 < 7min
  redLineP95Pass: boolean;     // run.p95 < 10min
}

async function main() {
  const json     = process.argv.includes('--json');
  const noWrite  = process.argv.includes('--no-write');

  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(2); }
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });

  try {
    // Run-level n: only count `done` runs (failed runs would skew downward
    // because they fail fast, and skew upward if they hit timeout — both
    // worse than excluding them entirely). P50/P95 are NOT taken from
    // (completed_at - created_at) — that wall time includes Solo Review
    // user thinking time, which LAUNCH_CHECKLIST §"Happy path E2E" excludes.
    // Run P50/P95 below = sum of per-node percentiles, matching the doc table.
    const runCountRows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM workflow_runs
      WHERE status = 'done'
        AND completed_at IS NOT NULL
        AND (created_at AT TIME ZONE 'Asia/Shanghai')::date
            = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
    `;
    const runN = runCountRows[0]!.n;

    // Step-level: by node_type, only `done` steps.
    const stepRows = await sql<{ node_type: string; n: number; p50: number; p95: number }[]>`
      SELECT
        node_type::text AS node_type,
        COUNT(*)::int   AS n,
        PERCENTILE_CONT(0.5)  WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))::int AS p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))::int AS p95
      FROM workflow_steps
      WHERE status = 'done'
        AND completed_at IS NOT NULL
        AND started_at   IS NOT NULL
        AND (completed_at AT TIME ZONE 'Asia/Shanghai')::date
            = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
      GROUP BY node_type
      ORDER BY MIN(step_index)
    `;

    const cnDateRow = await sql<{ d: string }[]>`
      SELECT (NOW() AT TIME ZONE 'Asia/Shanghai')::date::text AS d
    `;
    const cnDate = cnDateRow[0]!.d;

    const steps = stepRows.map((s) => ({ node: s.node_type, n: s.n, p50: s.p50, p95: s.p95 }));
    const run: RunStat = {
      n:   runN,
      p50: steps.reduce((acc, s) => acc + s.p50, 0),
      p95: steps.reduce((acc, s) => acc + s.p95, 0),
    };

    const snap: Snapshot = {
      ts:    new Date().toISOString(),
      cnDate,
      run,
      steps,
      redLineP50Min: 7,
      redLineP95Min: 10,
      redLineP50Pass: run.p50 > 0 && run.p50 < 7 * 60,
      redLineP95Pass: run.p95 > 0 && run.p95 < 10 * 60,
    };

    if (json) {
      console.log(JSON.stringify(snap, null, 2));
    } else {
      printHuman(snap);
    }

    if (!noWrite && run.n > 0) {
      await appendCsv(snap);
      await appendNotes(snap);
    }

    if (run.n === 0) process.exit(1);
    process.exit(0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function fmtSec(s: number): string {
  if (s === 0) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m${r.toString().padStart(2, '0')}s`;
}

function printHuman(s: Snapshot): void {
  const ok50 = s.redLineP50Pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const ok95 = s.redLineP95Pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`# perf-snapshot @ ${s.cnDate} (CN)`);
  if (s.run.n === 0) {
    console.log('  (no done runs today — insufficient sample)');
    return;
  }
  console.log(`  runs done    : ${s.run.n}`);
  console.log(`  run P50      : ${fmtSec(s.run.p50).padEnd(8)} ${ok50} (red line ${s.redLineP50Min}min)`);
  console.log(`  run P95      : ${fmtSec(s.run.p95).padEnd(8)} ${ok95} (red line ${s.redLineP95Min}min)`);
  console.log('');
  console.log('  per-node     : n     P50      P95');
  for (const st of s.steps) {
    console.log(`    ${st.node.padEnd(12)} ${String(st.n).padStart(3)}  ${fmtSec(st.p50).padStart(7)}  ${fmtSec(st.p95).padStart(7)}`);
  }
}

async function appendCsv(s: Snapshot): Promise<void> {
  const header = 'date_cn,runs,run_p50_sec,run_p95_sec,run_p50_pass,run_p95_pass,topic_p50,script_p50,storyboard_p50,video_p50,export_p50,topic_p95,script_p95,storyboard_p95,video_p95,export_p95\n';
  const byNode: Record<string, NodeStat | undefined> = Object.fromEntries(s.steps.map((x) => [x.node, x]));
  const get50 = (n: string) => byNode[n]?.p50 ?? 0;
  const get95 = (n: string) => byNode[n]?.p95 ?? 0;
  const row = [
    s.cnDate, s.run.n, s.run.p50, s.run.p95,
    s.redLineP50Pass ? 1 : 0, s.redLineP95Pass ? 1 : 0,
    get50('topic'), get50('script'), get50('storyboard'), get50('video'), get50('export'),
    get95('topic'), get95('script'), get95('storyboard'), get95('video'), get95('export'),
  ].join(',') + '\n';

  let exists = true;
  try { await fs.stat(CSV_PATH); } catch { exists = false; }
  if (!exists) await fs.writeFile(CSV_PATH, header);
  await fs.appendFile(CSV_PATH, row);
}

async function appendNotes(s: Snapshot): Promise<void> {
  // Append-only stub under "实战开始" — leave the human to flesh out
  // surrounding fields (seed user feedback, mood, etc.).
  let body: string;
  try { body = await fs.readFile(NOTES_PATH, 'utf-8'); }
  catch { return; }

  // Idempotent: skip if today already has an auto-perf line.
  const marker = `<!-- perf-auto:${s.cnDate} -->`;
  if (body.includes(marker)) return;

  const ok50 = s.redLineP50Pass ? '✅' : '⚠️';
  const ok95 = s.redLineP95Pass ? '✅' : '⚠️';
  const stepLine = s.steps
    .map((x) => `${x.node}=${fmtSec(x.p50)}/${fmtSec(x.p95)}`)
    .join(' · ');

  const block = [
    '',
    marker,
    `### auto-perf · ${s.cnDate}`,
    '',
    `- runs done: **${s.run.n}**`,
    `- run P50: **${fmtSec(s.run.p50)}** ${ok50} (red line 7min)`,
    `- run P95: **${fmtSec(s.run.p95)}** ${ok95} (red line 10min)`,
    `- per-node P50/P95: ${stepLine}`,
    '',
  ].join('\n');

  await fs.appendFile(NOTES_PATH, block);
}

main().catch((e) => {
  console.error('measure-happy-path errored:', e);
  process.exit(2);
});
