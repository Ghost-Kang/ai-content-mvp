// One-shot inspector for a specific runId. Used as the launch-week
// alternative to PostHog while ANALYTICS_DISABLED=1 is in effect.
//
// Run: pnpm tsx --env-file=.env.local scripts/probe-run.ts <runId>

import postgres from 'postgres';

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: pnpm tsx scripts/probe-run.ts <runId>');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    console.log(`\n=== workflow_runs (${runId}) ===`);
    const run = await sql`
      SELECT id, status, topic,
             seed_input ->> 'source'        AS source,
             seed_input -> 'sourceMeta'     AS source_meta,
             created_at, completed_at,
             total_cost_fen, total_video_count
      FROM workflow_runs WHERE id = ${runId}
    `;
    console.table(run);

    console.log(`\n=== workflow_steps (per-node lifecycle) ===`);
    const steps = await sql`
      SELECT step_index, node_type, status, retry_count,
             started_at, completed_at, cost_fen,
             EXTRACT(EPOCH FROM (completed_at - started_at))::int AS dur_sec,
             error_msg
      FROM workflow_steps
      WHERE run_id = ${runId}
      ORDER BY step_index
    `;
    console.table(steps);

    console.log(`\n=== llm_spend_daily (today, all tenants) ===`);
    const today = new Date().toISOString().slice(0, 10);  // spend_date is text YYYY-MM-DD
    const spend = await sql`
      SELECT spend_date, tenant_id::text AS tenant,
             provider, total_tokens, cost_fen, call_count
      FROM llm_spend_daily
      WHERE spend_date = ${today}
      ORDER BY cost_fen DESC
      LIMIT 10
    `;
    console.table(spend);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
