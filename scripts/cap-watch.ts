// LAUNCH-week active monitor: read live spend + monthly usage, compare
// against amber/red thresholds, emit one OK or ALERT line per (tenant,
// dimension). Designed to run by hand 1×/day in launch week, or wired
// into a cron later. The thresholds match `docs/LAUNCH_WEEK1_WATCHDOG.md`
// section B-pre.
//
// Run:
//   pnpm cap:watch                       # human readable
//   pnpm cap:watch --json                # machine readable (for cron / webhook)
//
// Exit code: 0 = all clear, 1 = ≥1 ALERT (cron-friendly).

import postgres from 'postgres';

// ─── Thresholds (single source of truth — keep in sync with WATCHDOG doc) ───
//
// Caps come from Vercel prod env (set 2026-05-07):
//   LLM_TENANT_DAILY_CAP_CNY        = 20  → 2000 fen
//   LLM_DAILY_CAP_CNY               = 100 → 10000 fen
//   WORKFLOW_MONTHLY_VIDEO_CAP_COUNT = 300
//   WORKFLOW_MONTHLY_COST_CAP_CNY    = 500 (default, unset in env) → 50000 fen
//
// Amber = "ping the user / start watching"; Red = "investigate immediately,
// likely a runaway loop or seed user genuinely hitting paid-plan territory".
const THRESHOLDS = {
  llmTenantDailyAmberFen: 1000,    // ¥10 of ¥20 cap (50%)
  llmGlobalDailyAmberFen: 8000,    // ¥80 of ¥100 cap (80%)
  monthlyVideoAmber:      200,     // 200 of 300 cap (67%)
  monthlyCostAmberFen:    40000,   // ¥400 of ¥500 cap (80% — D23 ARPU red line)
} as const;

interface Finding {
  level:     'OK' | 'ALERT';
  scope:     'tenant-day-llm' | 'global-day-llm' | 'tenant-month-video' | 'tenant-month-cost';
  subject:   string;          // tenant uuid or 'global'
  current:   string;          // human-friendly value
  threshold: string;
  detail?:   string;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(2); }
  const sql = postgres(url, { prepare: false, max: 1 });

  const findings: Finding[] = [];

  try {
    const today      = new Date().toISOString().slice(0, 10);
    const monthKey   = today.slice(0, 7);

    // 1) Daily LLM by tenant
    const llmByTenant = await sql<{ tenant: string; fen: number }[]>`
      SELECT COALESCE(tenant_id::text, 'system') AS tenant,
             SUM(cost_fen)::int AS fen
      FROM llm_spend_daily
      WHERE spend_date = ${today}
      GROUP BY tenant_id
      ORDER BY fen DESC
    `;
    for (const r of llmByTenant) {
      const alert = r.fen >= THRESHOLDS.llmTenantDailyAmberFen;
      findings.push({
        level:     alert ? 'ALERT' : 'OK',
        scope:     'tenant-day-llm',
        subject:   r.tenant,
        current:   `¥${(r.fen / 100).toFixed(2)}`,
        threshold: `amber ¥${(THRESHOLDS.llmTenantDailyAmberFen / 100).toFixed(2)} / cap ¥20`,
        detail:    alert ? 'ping user — possibly looping?' : undefined,
      });
    }

    // 2) Daily LLM global sum
    const globalFen = llmByTenant.reduce((s, r) => s + r.fen, 0);
    const globalAlert = globalFen >= THRESHOLDS.llmGlobalDailyAmberFen;
    findings.push({
      level:     globalAlert ? 'ALERT' : 'OK',
      scope:     'global-day-llm',
      subject:   'global',
      current:   `¥${(globalFen / 100).toFixed(2)}`,
      threshold: `amber ¥${(THRESHOLDS.llmGlobalDailyAmberFen / 100).toFixed(2)} / cap ¥100`,
      detail:    globalAlert ? 'check vercel logs `circuit-breaker` for fallback storms' : undefined,
    });

    // 3) Monthly video / cost by tenant
    const monthly = await sql<{ tenant: string; videos: number; fen: number }[]>`
      SELECT tenant_id::text AS tenant,
             SUM(video_count)::int    AS videos,
             SUM(total_cost_fen)::int AS fen
      FROM monthly_usage
      WHERE month_key = ${monthKey}
      GROUP BY tenant_id
      ORDER BY fen DESC
    `;
    for (const r of monthly) {
      const videoAlert = r.videos >= THRESHOLDS.monthlyVideoAmber;
      findings.push({
        level:     videoAlert ? 'ALERT' : 'OK',
        scope:     'tenant-month-video',
        subject:   r.tenant,
        current:   `${r.videos} clips`,
        threshold: `amber ${THRESHOLDS.monthlyVideoAmber} / cap 300`,
        detail:    videoAlert ? 'evaluate cap raise or push paid plan' : undefined,
      });
      const costAlert = r.fen >= THRESHOLDS.monthlyCostAmberFen;
      findings.push({
        level:     costAlert ? 'ALERT' : 'OK',
        scope:     'tenant-month-cost',
        subject:   r.tenant,
        current:   `¥${(r.fen / 100).toFixed(2)}`,
        threshold: `amber ¥${(THRESHOLDS.monthlyCostAmberFen / 100).toFixed(2)} / cap ¥500`,
        detail:    costAlert ? 'red line approaching — D23 ARPU margin in danger' : undefined,
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const jsonOut = process.argv.includes('--json');
  if (jsonOut) {
    console.log(JSON.stringify(
      { at: new Date().toISOString(), findings },
      null, 2,
    ));
  } else {
    const ts = new Date().toISOString();
    console.log(`# cap-watch @ ${ts}`);
    for (const f of findings) {
      const subj = f.subject === 'global' ? 'global' : f.subject.slice(0, 8);
      const tag  = f.level === 'ALERT' ? '\x1b[31m[ALERT]\x1b[0m' : '\x1b[32m[ OK  ]\x1b[0m';
      console.log(`${tag} ${f.scope.padEnd(20)} ${subj.padEnd(10)} ${f.current.padEnd(14)} (${f.threshold})${f.detail ? ` — ${f.detail}` : ''}`);
    }
    const alertCount = findings.filter((f) => f.level === 'ALERT').length;
    console.log(alertCount === 0 ? '\nall clear.' : `\n${alertCount} ALERT(s) — see above.`);
  }

  process.exit(findings.some((f) => f.level === 'ALERT') ? 1 : 0);
}

main().catch((e) => {
  console.error('cap-watch errored:', e);
  process.exit(2);
});
