// Inspect monthly_usage table — used to debug WORKFLOW_MONTHLY_*_CAP triggers.
// Run: pnpm tsx --env-file=.env.local scripts/probe-monthly-usage.ts

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    const monthKey = new Date().toISOString().slice(0, 7);
    console.log(`\n=== monthly_usage (month=${monthKey}, all tenants/users) ===`);
    const rows = await sql`
      SELECT tenant_id::text  AS tenant,
             user_id::text    AS user,
             month_key,
             video_count, workflow_run_count, total_cost_fen,
             last_updated_at
      FROM monthly_usage
      WHERE month_key = ${monthKey}
      ORDER BY total_cost_fen DESC
    `;
    console.table(rows);

    if (rows.length === 0) return;
    console.log('\n=== aggregates ===');
    const agg = await sql`
      SELECT
        COUNT(DISTINCT tenant_id) AS tenants,
        SUM(video_count)::int     AS total_videos,
        SUM(total_cost_fen)::int  AS total_fen
      FROM monthly_usage WHERE month_key = ${monthKey}
    `;
    console.table(agg);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
