// One-shot probe: confirm llm_spend_daily exists in prod Supabase + sample
// recent rows. Used as launch checklist evidence (no app code touch).
//
// Run: pnpm tsx --env-file=.env.local scripts/probe-spend-table.ts

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set; abort.');
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    const t = await sql<{ reg: string | null }[]>`
      SELECT to_regclass('public.llm_spend_daily')::text AS reg
    `;
    const tableExists = t[0].reg !== null;
    console.log('llm_spend_daily table exists:', tableExists);
    if (!tableExists) {
      process.exit(1);
    }

    const c = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM llm_spend_daily`;
    console.log('row count:', c[0].n);

    if (c[0].n > 0) {
      const r = await sql`
        SELECT spend_date, provider, total_tokens, cost_fen, call_count
        FROM llm_spend_daily
        ORDER BY spend_date DESC
        LIMIT 5
      `;
      console.log('latest 5 rows:');
      console.table(r);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error('probe errored:', e);
  process.exit(1);
});
