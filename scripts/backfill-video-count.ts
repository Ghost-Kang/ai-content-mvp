// Backfill workflow_runs.total_video_count for runs that hit the
// hydrate-skip bug (commit 5c880d1 — orchestrator.ts:200 didn't
// re-accrue videoCount on hydrate-and-skip, so any run that went
// through QStash chunked dispatch landed with total_video_count=0
// despite producing N frames).
//
// Run:
//   pnpm tsx --env-file=.env.local scripts/backfill-video-count.ts             # dry-run
//   pnpm tsx --env-file=.env.local scripts/backfill-video-count.ts --apply     # actually UPDATE
//   pnpm tsx --env-file=.env.local scripts/backfill-video-count.ts --json      # machine readable
//
// Idempotent: re-running with --apply on the same DB is a no-op once
// the data is corrected (the WHERE clause excludes already-fixed rows).
//
// Filter discipline (no false positives possible):
//   status = 'done'              — only finalized runs (failed/pending may legitimately be 0)
//   total_video_count = 0        — only rows still showing the bug
//   frames_in_output > 0         — only rows where evidence of real frames exists
//
// Audit on 2026-05-09 found exactly 5 victims; all had frames=17 (the
// standard 17-frame happy path which is the only run shape long enough
// to require chunked dispatch).

import postgres from 'postgres';

interface Row {
  run_id:            string;
  tenant_id:         string;
  created_at:        Date;
  total_cost_fen:    number;
  before_count:      number;
  after_count:       number;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const json  = process.argv.includes('--json');

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    let rows: Row[];

    if (apply) {
      // Single-statement UPDATE inside an implicit txn; RETURNING gives us
      // the audit trail without a separate read query.
      rows = await sql<Row[]>`
        UPDATE workflow_runs r
        SET total_video_count = sub.frames_count,
            updated_at        = NOW()
        FROM (
          SELECT s.run_id,
                 jsonb_array_length(s.output_json -> 'frames') AS frames_count
          FROM workflow_steps s
          WHERE s.node_type = 'video'
            AND jsonb_array_length(s.output_json -> 'frames') > 0
        ) sub
        WHERE r.id                = sub.run_id
          AND r.status            = 'done'
          AND r.total_video_count = 0
        RETURNING
          r.id              AS run_id,
          r.tenant_id       AS tenant_id,
          r.created_at      AS created_at,
          r.total_cost_fen  AS total_cost_fen,
          0                 AS before_count,
          r.total_video_count AS after_count
      `;
    } else {
      // Dry-run preview: same WHERE filter, but read-only.
      rows = await sql<Row[]>`
        SELECT
          r.id              AS run_id,
          r.tenant_id       AS tenant_id,
          r.created_at      AS created_at,
          r.total_cost_fen  AS total_cost_fen,
          r.total_video_count AS before_count,
          jsonb_array_length(s.output_json -> 'frames')::int AS after_count
        FROM workflow_runs r
        JOIN workflow_steps s ON s.run_id = r.id AND s.node_type = 'video'
        WHERE r.status = 'done'
          AND r.total_video_count = 0
          AND jsonb_array_length(s.output_json -> 'frames') > 0
        ORDER BY r.created_at DESC
      `;
    }

    if (json) {
      console.log(JSON.stringify({ apply, count: rows.length, rows }, null, 2));
    } else {
      const mode = apply ? '🟢 APPLIED' : '🔵 DRY-RUN (use --apply to write)';
      console.log(`\n=== backfill workflow_runs.total_video_count — ${mode} ===`);
      console.log(`affected rows: ${rows.length}`);
      if (rows.length === 0) {
        console.log(apply ? '  (nothing to do — all rows already correct)' : '  (no victims found)');
      } else {
        console.log('');
        for (const r of rows) {
          const ts = new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ');
          console.log(`  ${ts}  run=${r.run_id.slice(0, 8)}  ${r.before_count} → ${r.after_count}  (cost=${r.total_cost_fen}fen tenant=${r.tenant_id.slice(0, 8)})`);
        }
        const totalNow = rows.reduce((acc, r) => acc + Number(r.after_count), 0);
        console.log(`\n  total frames recovered: ${totalNow}`);
      }
    }
    process.exit(0);
  } catch (e) {
    console.error('[backfill] error:', e);
    process.exit(2);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
