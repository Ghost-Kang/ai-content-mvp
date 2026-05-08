// Stuck-run recovery + watchdog.
//
// Detects three failure modes that leave workflow_runs / workflow_steps
// in 'running' forever (Vercel maxDuration silent kill, worker OOM,
// network hang during LLM call). Default DRY-RUN — pass --apply to flip
// status to 'failed' so the user can retry.
//
// Run:
//   pnpm prod:watchdog                # dry-run, human readable
//   pnpm prod:watchdog --apply        # actually flip stuck rows to failed
//   pnpm prod:watchdog --json         # machine readable (cron-friendly)
//
// Exit code: 0 = nothing stuck, 1 = ≥1 stuck row found (with or without
// --apply, mirroring cap-watch's contract).
//
// WeChat push (optional): same SERVERCHAN_KEY env as cap-watch.
//
// Detection windows — chosen so a normal long video run with QStash
// continuation chain (max 17 frames × 3 invocations × ~90s) won't trip:
//   - step stuck         : status='running' for > 12 minutes
//   - run stuck (zombie) : status='running' for > 45 minutes
//   - ghost run          : status='running', 0 workflow_steps, age > 5 min
//   - data-corrupt step  : completed_at < started_at (alert only, never auto-fix)

import postgres from 'postgres';

const STEP_STUCK_MINUTES  = 12;
const RUN_STUCK_MINUTES   = 45;
const GHOST_RUN_MINUTES   = 5;

interface StuckStep {
  kind:       'step-stuck';
  runId:      string;
  stepId:     string;
  nodeType:   string;
  startedAt:  string;
  ageMin:     number;
}

interface StuckRun {
  kind:       'run-stuck';
  runId:      string;
  startedAt:  string;
  ageMin:     number;
}

interface GhostRun {
  kind:       'ghost-run';
  runId:      string;
  createdAt:  string;
  ageMin:     number;
}

interface CorruptStep {
  kind:        'corrupt-step';
  runId:       string;
  stepId:      string;
  nodeType:    string;
  startedAt:   string;
  completedAt: string;
}

type Finding = StuckStep | StuckRun | GhostRun | CorruptStep;

async function main() {
  const apply = process.argv.includes('--apply');
  const json  = process.argv.includes('--json');

  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(2); }
  const sql = postgres(url, { prepare: false, max: 1 });

  const findings: Finding[] = [];
  const fixes: string[] = [];

  try {
    // 1) Steps stuck in 'running' beyond threshold.
    const stuckSteps = await sql<{
      run_id: string; step_id: string; node_type: string;
      started_at: string; age_min: number;
    }[]>`
      SELECT
        s.run_id,
        s.id::text AS step_id,
        s.node_type::text AS node_type,
        s.started_at::text AS started_at,
        EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60 AS age_min
      FROM workflow_steps s
      WHERE s.status = 'running'
        AND s.started_at IS NOT NULL
        AND s.started_at < NOW() - (${STEP_STUCK_MINUTES} || ' minutes')::interval
    `;
    for (const r of stuckSteps) {
      findings.push({
        kind: 'step-stuck', runId: r.run_id, stepId: r.step_id,
        nodeType: r.node_type, startedAt: r.started_at,
        ageMin: Math.round(Number(r.age_min)),
      });
    }

    // 2) Runs stuck in 'running' beyond threshold.
    const stuckRuns = await sql<{
      run_id: string; started_at: string; age_min: number;
    }[]>`
      SELECT
        r.id AS run_id,
        COALESCE(r.started_at, r.created_at)::text AS started_at,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(r.started_at, r.created_at))) / 60 AS age_min
      FROM workflow_runs r
      WHERE r.status = 'running'
        AND COALESCE(r.started_at, r.created_at) < NOW() - (${RUN_STUCK_MINUTES} || ' minutes')::interval
    `;
    for (const r of stuckRuns) {
      findings.push({
        kind: 'run-stuck', runId: r.run_id, startedAt: r.started_at,
        ageMin: Math.round(Number(r.age_min)),
      });
    }

    // 3) Ghost runs — running for >5 min but never inserted any steps.
    const ghostRuns = await sql<{
      run_id: string; created_at: string; age_min: number;
    }[]>`
      SELECT
        r.id AS run_id,
        r.created_at::text AS created_at,
        EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 60 AS age_min
      FROM workflow_runs r
      WHERE r.status = 'running'
        AND r.created_at < NOW() - (${GHOST_RUN_MINUTES} || ' minutes')::interval
        AND NOT EXISTS (
          SELECT 1 FROM workflow_steps s WHERE s.run_id = r.id
        )
    `;
    for (const r of ghostRuns) {
      findings.push({
        kind: 'ghost-run', runId: r.run_id, createdAt: r.created_at,
        ageMin: Math.round(Number(r.age_min)),
      });
    }

    // 4) Data-corrupt steps — completed_at < started_at. ALERT ONLY.
    // We never auto-flip these because the corruption itself means the
    // history is unreliable, and forcing a status change could mask a
    // genuine in-flight worker. Patch in node-runner.ts addresses the
    // root cause prospectively.
    const corruptSteps = await sql<{
      run_id: string; step_id: string; node_type: string;
      started_at: string; completed_at: string;
    }[]>`
      SELECT
        s.run_id,
        s.id::text AS step_id,
        s.node_type::text AS node_type,
        s.started_at::text AS started_at,
        s.completed_at::text AS completed_at
      FROM workflow_steps s
      WHERE s.completed_at IS NOT NULL
        AND s.started_at IS NOT NULL
        AND s.completed_at < s.started_at
    `;
    for (const r of corruptSteps) {
      findings.push({
        kind: 'corrupt-step', runId: r.run_id, stepId: r.step_id,
        nodeType: r.node_type, startedAt: r.started_at,
        completedAt: r.completed_at,
      });
    }

    // ─── Apply (write path) ──────────────────────────────────────────────────
    // Per-row updates rather than ANY/IN array binding — postgres-js's
    // type inference balks at `id = ANY($1::uuid[])` here, and we have
    // at most a couple dozen stuck rows in practice. Each UPDATE re-checks
    // status='running' to avoid clobbering a row another worker just
    // legitimately completed in the gap between SELECT and UPDATE.
    if (apply && findings.length > 0) {
      const stepErr = `WATCHDOG_TIMEOUT: step stuck > ${STEP_STUCK_MINUTES}min — likely Vercel maxDuration kill or worker crash`;
      const runErr  = `WATCHDOG_TIMEOUT: run stuck > ${RUN_STUCK_MINUTES}min — likely Vercel maxDuration kill or worker crash`;

      const stuckStepIds = findings
        .filter((f): f is StuckStep => f.kind === 'step-stuck')
        .map((f) => f.stepId);
      let stepFlips = 0;
      for (const stepId of stuckStepIds) {
        const updated = await sql`
          UPDATE workflow_steps
             SET status       = 'failed',
                 error_msg    = ${stepErr},
                 completed_at = NOW(),
                 updated_at   = NOW()
           WHERE id     = ${stepId}::uuid
             AND status = 'running'
          RETURNING id
        `;
        stepFlips += updated.length;
      }
      if (stepFlips > 0) fixes.push(`flipped ${stepFlips} stuck steps → failed`);

      const allStuckRunIds = [
        ...findings.filter((f): f is StuckRun => f.kind === 'run-stuck').map((f) => f.runId),
        ...findings.filter((f): f is GhostRun => f.kind === 'ghost-run').map((f) => f.runId),
      ];
      let runFlips = 0;
      for (const runId of allStuckRunIds) {
        const updated = await sql`
          UPDATE workflow_runs
             SET status       = 'failed',
                 error_msg    = ${runErr},
                 completed_at = NOW(),
                 updated_at   = NOW()
           WHERE id     = ${runId}::uuid
             AND status = 'running'
          RETURNING id
        `;
        runFlips += updated.length;
      }
      if (runFlips > 0) fixes.push(`flipped ${runFlips} stuck/ghost runs → failed`);
    }

    // ─── Output ─────────────────────────────────────────────────────────────
    if (json) {
      console.log(JSON.stringify({
        ts:       new Date().toISOString(),
        apply,
        findings,
        fixes,
      }, null, 2));
    } else {
      const ts = new Date().toISOString();
      console.log(`# watchdog @ ${ts} ${apply ? '(APPLY)' : '(dry-run)'}`);
      if (findings.length === 0) {
        console.log('all clear.');
      } else {
        for (const f of findings) {
          if (f.kind === 'step-stuck') {
            console.log(`\x1b[31m[STUCK-STEP]\x1b[0m ${f.nodeType.padEnd(11)} run=${f.runId.slice(0, 8)} step=${f.stepId.slice(0, 8)} age=${f.ageMin}min`);
          } else if (f.kind === 'run-stuck') {
            console.log(`\x1b[31m[STUCK-RUN ]\x1b[0m run=${f.runId.slice(0, 8)} age=${f.ageMin}min`);
          } else if (f.kind === 'ghost-run') {
            console.log(`\x1b[31m[GHOST-RUN ]\x1b[0m run=${f.runId.slice(0, 8)} age=${f.ageMin}min (no workflow_steps)`);
          } else {
            console.log(`\x1b[33m[CORRUPT   ]\x1b[0m ${f.nodeType.padEnd(11)} run=${f.runId.slice(0, 8)} completed_at(${f.completedAt}) < started_at(${f.startedAt})`);
          }
        }
        if (fixes.length > 0) {
          console.log('\nfixes:');
          for (const f of fixes) console.log(`  ✓ ${f}`);
        } else if (!apply) {
          console.log('\n(dry-run — pass --apply to flip stuck rows to failed)');
        }
      }
    }

    if (findings.length > 0 && (apply || !json)) {
      await pushServerChan(findings, apply, fixes);
    }

    process.exit(findings.length > 0 ? 1 : 0);
  } finally {
    await sql.end();
  }
}

async function pushServerChan(findings: Finding[], apply: boolean, fixes: string[]): Promise<void> {
  const key = process.env.SERVERCHAN_KEY?.trim();
  if (!key) return;

  const stuck = findings.filter((f) => f.kind !== 'corrupt-step');
  const corrupt = findings.filter((f) => f.kind === 'corrupt-step');

  const title = `[ai-content-mvp] watchdog: ${stuck.length} stuck / ${corrupt.length} corrupt`;
  const lines: string[] = [];
  for (const f of stuck) {
    if (f.kind === 'step-stuck') {
      lines.push(`- **stuck step** \`${f.runId.slice(0, 8)}/${f.nodeType}\` ${f.ageMin}min`);
    } else if (f.kind === 'run-stuck') {
      lines.push(`- **stuck run** \`${f.runId.slice(0, 8)}\` ${f.ageMin}min`);
    } else if (f.kind === 'ghost-run') {
      lines.push(`- **ghost run** \`${f.runId.slice(0, 8)}\` ${f.ageMin}min (no steps)`);
    }
  }
  for (const f of corrupt) {
    if (f.kind === 'corrupt-step') {
      lines.push(`- **corrupt** \`${f.runId.slice(0, 8)}/${f.nodeType}\` completed < started`);
    }
  }
  if (apply && fixes.length > 0) {
    lines.push('', '**fixes applied:**');
    for (const x of fixes) lines.push(`- ${x}`);
  } else if (!apply && stuck.length > 0) {
    lines.push('', '_(dry-run — re-run with --apply to release users)_');
  }

  try {
    const body = new URLSearchParams({ title, desp: lines.join('\n') });
    const res = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
      method:  'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      console.warn(`[watchdog] ServerChan HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn('[watchdog] ServerChan POST failed:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error('watchdog errored:', e);
  process.exit(2);
});
