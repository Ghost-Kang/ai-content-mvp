// Single-step dump of fb5632a7's video node — investigates why it
// reports done with 0 videos and ¥8.20 cost (vs sibling 3277dc0a which
// generated 17 videos for ¥7.91).

import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const rows = await sql<{ output_json: unknown; error_msg: string | null }[]>`
      SELECT output_json, error_msg
      FROM workflow_steps
      WHERE run_id = 'fb5632a7-bc56-4115-9068-be7a800d7791'
        AND node_type = 'video'
    `;
    if (rows.length === 0) { console.log('not found'); return; }
    console.log('error_msg:', rows[0].error_msg);
    console.log('output_json:');
    console.log(JSON.stringify(rows[0].output_json, null, 2).slice(0, 3500));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
