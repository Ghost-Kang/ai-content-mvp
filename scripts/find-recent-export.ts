// Ad-hoc helper: finds the most-recent zip in workflow-exports bucket and
// re-signs it for download. Intended use: after probe-workflow-full-v3.ts
// has already run + cleaned up DB rows, the zip object is still in
// storage; this resigns it so the operator can grab it.
//
// Run: pnpm tsx --env-file=.env.local scripts/find-recent-export.ts

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const BUCKET = 'workflow-exports';
const TTL_SEC = 3 * 60 * 60; // 3 hours — long enough to download + open in 剪映.

async function main() {
  console.log(`scanning bucket=${BUCKET}/exports for most recent zip…`);

  // Walk: exports/<tenantId>/<runId>/<filename>.zip
  const tenantsRes = await sb.storage.from(BUCKET).list('exports', { limit: 1000 });
  if (tenantsRes.error) {
    console.error('list tenants failed:', tenantsRes.error.message);
    process.exit(1);
  }
  const tenantDirs = (tenantsRes.data ?? []).filter((d) => d.id === null); // folders only
  if (tenantDirs.length === 0) {
    console.log('no tenant folders found.');
    process.exit(0);
  }

  type Found = { path: string; updatedAt: string; bytes: number };
  const all: Found[] = [];
  for (const tenantDir of tenantDirs) {
    const runsRes = await sb.storage
      .from(BUCKET)
      .list(`exports/${tenantDir.name}`, { limit: 1000 });
    if (runsRes.error) continue;
    for (const runDir of runsRes.data ?? []) {
      if (runDir.id !== null) continue;
      const filesRes = await sb.storage
        .from(BUCKET)
        .list(`exports/${tenantDir.name}/${runDir.name}`, { limit: 100 });
      if (filesRes.error) continue;
      for (const f of filesRes.data ?? []) {
        if (f.id === null) continue;
        if (!f.name.endsWith('.zip')) continue;
        const path = `exports/${tenantDir.name}/${runDir.name}/${f.name}`;
        const meta = f.metadata as Record<string, unknown> | undefined;
        const sizeRaw = meta?.size;
        const size = typeof sizeRaw === 'number' ? sizeRaw : 0;
        all.push({
          path,
          updatedAt: f.updated_at ?? f.created_at ?? '',
          bytes:     size,
        });
      }
    }
  }

  if (all.length === 0) {
    console.log('no zip objects found.');
    process.exit(0);
  }

  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const top = all.slice(0, 5);
  console.log(`\nmost recent ${top.length} zip(s):\n`);
  for (const [i, f] of top.entries()) {
    console.log(`${i + 1}. ${f.path} | ${(f.bytes / 1024).toFixed(1)} KB | updated_at=${f.updatedAt}`);
  }

  // Re-sign the freshest one and print download command.
  const latest = top[0];
  const signRes = await sb.storage.from(BUCKET).createSignedUrl(latest.path, TTL_SEC);
  if (signRes.error || !signRes.data?.signedUrl) {
    console.error('\nsign failed:', signRes.error?.message);
    process.exit(1);
  }
  const expires = new Date(Date.now() + TTL_SEC * 1000).toISOString();
  console.log(`\n📦 freshest zip: ${latest.path}`);
  console.log(`   ${(latest.bytes / 1024).toFixed(1)} KB · expires ${expires}\n`);
  console.log(`download with:\n  curl -L -o /tmp/workflow-export.zip "${signRes.data.signedUrl}"\n`);
}

main().catch((e) => {
  console.error('failed:', e);
  process.exit(1);
});
