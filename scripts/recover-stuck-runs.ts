// Stuck-run recovery + watchdog.
//
// Manual / local entry point for the same detection + recovery logic the
// Vercel cron route (`api/admin/watchdog/route.ts`) calls every 15 min.
// Both paths share `src/lib/admin/stuck-runs.ts` so detection windows
// can never drift.
//
// Run:
//   pnpm prod:watchdog                # dry-run, human readable
//   pnpm prod:watchdog --apply        # actually flip stuck rows to failed
//   pnpm prod:watchdog --json         # machine readable (cron-friendly)
//
// Exit code: 0 = nothing stuck, 1 = ≥1 stuck row found, 2 = errored.
//
// WeChat push (optional): set SERVERCHAN_KEY in .env.local. Mirrors
// cap-watch's behavior — failures only console.warn, never mask exit code.

import { detectAndRecover, type Finding } from '../src/lib/admin/stuck-runs';

async function main() {
  const apply = process.argv.includes('--apply');
  const json  = process.argv.includes('--json');

  let result;
  try {
    result = await detectAndRecover({ apply });
  } catch (e) {
    console.error('watchdog errored:', e);
    process.exit(2);
  }

  const { findings, fixes } = result;

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`# watchdog @ ${result.ts} ${apply ? '(APPLY)' : '(dry-run)'}`);
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

  if (findings.length > 0) {
    await pushServerChan(findings, apply, fixes);
  }

  process.exit(findings.length > 0 ? 1 : 0);
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
