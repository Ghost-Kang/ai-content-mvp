// One-shot: pull all of today's runs + step errors + spend summary.
// Used 2026-05-08 to triage seed-user testing day.
//
// Run: pnpm tsx --env-file=.env.local scripts/probe-today.ts

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    console.log(`\n=== runs by status (today, CN time) ===`);
    const byStatus = await sql`
      SELECT status, COUNT(*)::int AS n
      FROM workflow_runs
      WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
      GROUP BY status
      ORDER BY n DESC
    `;
    console.table(byStatus);

    console.log(`\n=== all runs today (newest first) ===`);
    const runs = await sql`
      SELECT
        id,
        tenant_id,
        status,
        LEFT(topic, 30) AS topic,
        seed_input ->> 'source' AS src,
        created_at AT TIME ZONE 'Asia/Shanghai' AS created_cn,
        completed_at AT TIME ZONE 'Asia/Shanghai' AS done_cn,
        EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))::int AS dur_sec,
        total_cost_fen,
        total_video_count
      FROM workflow_runs
      WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
      ORDER BY created_at DESC
      LIMIT 50
    `;
    console.table(runs);

    console.log(`\n=== failed / errored steps today ===`);
    const failed = await sql`
      SELECT
        s.run_id,
        s.step_index,
        s.node_type,
        s.status,
        s.retry_count,
        s.cost_fen,
        s.started_at AT TIME ZONE 'Asia/Shanghai' AS started_cn,
        LEFT(s.error_msg, 240) AS err
      FROM workflow_steps s
      JOIN workflow_runs r ON r.id = s.run_id
      WHERE (s.updated_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
        AND (s.status = 'failed' OR s.error_msg IS NOT NULL)
      ORDER BY s.updated_at DESC
      LIMIT 50
    `;
    console.table(failed);

    console.log(`\n=== step duration P50/P95 today (done only) ===`);
    const dur = await sql`
      SELECT
        node_type,
        COUNT(*)::int AS n,
        PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))::int AS p50_sec,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))::int AS p95_sec
      FROM workflow_steps
      WHERE (completed_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
        AND status = 'done'
        AND completed_at IS NOT NULL
        AND started_at IS NOT NULL
      GROUP BY node_type
      ORDER BY node_type
    `;
    console.table(dur);

    console.log(`\n=== LLM spend today (per provider) ===`);
    const spend = await sql`
      SELECT
        provider,
        COUNT(*)::int AS calls,
        SUM(cost_fen)::int AS total_fen
      FROM llm_spend_daily
      WHERE spend_date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date::text
      GROUP BY provider
      ORDER BY total_fen DESC
    `;
    console.table(spend);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
