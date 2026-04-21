// One-shot migration: add comment_bait_question and quality_issue columns
// to content_scripts (both nullable text). Safe to re-run — uses IF NOT EXISTS.
//
// Run: pnpm tsx --env-file=.env.local scripts/migrate-add-script-meta.ts

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      ALTER TABLE content_scripts
        ADD COLUMN IF NOT EXISTS comment_bait_question text,
        ADD COLUMN IF NOT EXISTS quality_issue text
    `;
    console.log('✅ Added content_scripts.comment_bait_question + quality_issue (idempotent)');
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
