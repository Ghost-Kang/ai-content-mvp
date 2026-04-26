// W4-01: Create llm_spend_daily table.
// Safe to re-run — uses IF NOT EXISTS for table and indexes.
//
// Run: pnpm tsx --env-file=.env.local scripts/migrate-add-llm-spend.ts

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS llm_spend_daily (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    uuid REFERENCES tenants(id),
        spend_date   text NOT NULL,
        provider     text NOT NULL,
        total_tokens integer NOT NULL DEFAULT 0,
        cost_fen     integer NOT NULL DEFAULT 0,
        call_count   integer NOT NULL DEFAULT 0,
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_llm_spend_day_provider ON llm_spend_daily(spend_date, provider)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_llm_spend_tenant_day ON llm_spend_daily(tenant_id, spend_date)`;
    // Unique constraint on (tenant_id, spend_date, provider) — NULL tenant_id
    // rows use partial unique index so multiple NULL are allowed only once per day per provider.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_spend_tenant_day_provider
        ON llm_spend_daily(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), spend_date, provider)
    `;
    console.log('✅ llm_spend_daily created (idempotent)');
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
