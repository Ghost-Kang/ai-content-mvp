// W3-04-V3 — Supabase Storage probe (one-time bootstrap + smoke test).
//
// Run after first DATABASE_URL setup OR whenever the service-role key
// rotates. Verifies:
//   1. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present and valid
//   2. The `workflow-exports` bucket exists (creates it as `private` if not)
//   3. We can upload a tiny test object
//   4. We can mint a signed URL for it
//   5. We can DELETE it (so we don't leave orphan probe files)
//
// This is intentionally NOT in the test regression suite — it touches real
// Storage and costs API calls. Run manually when you want to verify creds.
//
// Usage: pnpm storage:probe

import {
  EXPORT_BUNDLE_BUCKET,
  StorageError,
  getStorage,
  uploadExportBundle,
} from '../src/lib/storage';

async function main() {
  console.log('--- W3-04-V3 Supabase Storage probe ---\n');

  // 1. Client check
  const sb = getStorage();
  if (!sb) {
    console.error('❌ Supabase client not constructed.');
    console.error('   Confirm SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set in .env.local.');
    process.exit(1);
  }
  console.log(`✅ client constructed (url=${process.env.SUPABASE_URL})`);

  // 2. Bucket check + create if missing
  const listRes = await sb.storage.listBuckets();
  if (listRes.error) {
    console.error(`❌ listBuckets failed: ${listRes.error.message}`);
    console.error('   Likely the service-role key is wrong or lacks Storage permission.');
    process.exit(1);
  }
  const found = (listRes.data ?? []).find((b) => b.name === EXPORT_BUNDLE_BUCKET);
  if (!found) {
    console.log(`ℹ bucket "${EXPORT_BUNDLE_BUCKET}" not found — creating (private)...`);
    const createRes = await sb.storage.createBucket(EXPORT_BUNDLE_BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50 MiB cap — Supabase free-tier ceiling; 60s short-form bundle ~5-10 MiB
    });
    if (createRes.error) {
      console.error(`❌ createBucket failed: ${createRes.error.message}`);
      process.exit(1);
    }
    console.log('✅ bucket created');
  } else {
    console.log(`✅ bucket "${EXPORT_BUNDLE_BUCKET}" exists`);
  }

  // 3 + 4. Upload + sign smoke test
  const probeBytes = new TextEncoder().encode(`probe ${new Date().toISOString()}`);
  let objectPath: string | null = null;
  try {
    const result = await uploadExportBundle({
      tenantId: '__probe__',
      runId:    `probe-${Date.now()}`,
      bundle:   probeBytes,
      filename: 'probe.txt',
    });
    objectPath = result.objectPath;
    console.log(`✅ upload + sign OK (${result.bytes} bytes → ${result.signedUrl.slice(0, 80)}...)`);
    console.log(`   expires at ${result.expiresAt}`);
  } catch (e) {
    if (e instanceof StorageError) {
      console.error(`❌ upload failed (${e.code}): ${e.message}`);
    } else {
      console.error('❌ upload failed:', e);
    }
    process.exit(1);
  }

  // 5. Cleanup — best effort
  if (objectPath) {
    const del = await sb.storage.from(EXPORT_BUNDLE_BUCKET).remove([objectPath]);
    if (del.error) {
      console.warn(`⚠ cleanup failed (orphan probe object remains): ${del.error.message}`);
    } else {
      console.log('✅ probe object deleted');
    }
  }

  console.log('\n🎉 Storage is wired up. ExportNodeRunner will produce real signed URLs.');
}

main().catch((e) => {
  console.error('probe errored:', e);
  process.exit(1);
});
