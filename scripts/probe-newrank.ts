// D31 (2026-04-25) — 新榜 API probe.
//
// Verifies:
//   1. NEWRANK_API_KEY is loaded and valid
//   2. file-list endpoint reachable across all 4 platforms (dy/ks/xhs/bz)
//   3. Response shape matches contract (url + md5 + name)
//   4. Sample download of the first file from the first available platform
//      so we know the actual file format (CSV / JSON / xlsx?) — this is
//      the unknown that blocks W4-01 file parser design.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/probe-newrank.ts [--date=YYYY-MM-DD]
//   pnpm tsx --env-file=.env.local scripts/probe-newrank.ts --no-download
//
// Default date = today − 2 days (T+2 contract from delivery note).

import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  ALL_PLATFORMS,
  DataSourceError,
  NewrankClient,
  PLATFORM_LABEL,
  loadNewrankConfig,
} from '../src/lib/data-source/newrank';

interface CliArgs {
  date:     string;
  download: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { date: defaultDate(), download: true };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--date=')) {
      args.date = a.slice('--date='.length);
    } else if (a === '--no-download') {
      args.download = false;
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: probe-newrank.ts [--date=YYYY-MM-DD] [--no-download]');
      process.exit(0);
    } else {
      console.warn(`Unknown arg: ${a}`);
    }
  }
  return args;
}

function defaultDate(): string {
  // Empirical (D31 probe 2026-04-26): files for T-1 are always empty,
  // T-2 day typically has ks/xhs/bz ready but dy lags, T-3 has all 4
  // platforms present. Use T-3 as the safe default so a fresh probe
  // exits green without the caller guessing dates.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`--- 新榜 API probe (D31) ---`);
  console.log(`Date:     ${args.date} (T+2)`);
  console.log(`Download: ${args.download}`);
  console.log('');

  // Step 1 — config
  let client: NewrankClient;
  try {
    client = new NewrankClient({ config: loadNewrankConfig() });
    console.log(`✅ config loaded (key length=${process.env.NEWRANK_API_KEY!.length})`);
  } catch (e) {
    console.error(`❌ config: ${(e as Error).message}`);
    process.exit(2);
  }

  // Step 2 — list all 4 platforms in parallel
  console.log('\n[2/4] fetching file lists for all 4 platforms in parallel...');
  const results = await client.listFilesAllPlatforms(args.date);

  let okCount     = 0;
  let firstUrlOK: { platform: string; url: string; md5: string; name: string } | null = null;

  for (const { platform, result } of results) {
    const label = PLATFORM_LABEL[platform];
    if (result instanceof DataSourceError) {
      console.log(`  ❌ ${label.padEnd(4)} (${platform}): ${result.code}` +
        (result.serverCode ? ` [server=${result.serverCode}]` : '') +
        ` — ${result.message}`);
      continue;
    }
    okCount += 1;
    console.log(`  ✅ ${label.padEnd(4)} (${platform}): ${result.files.length} files · requestId=${result.requestId.slice(0, 12) || '<none>'}`);
    for (const [i, f] of result.files.slice(0, 3).entries()) {
      console.log(`      [${i}] ${f.name}  md5=${f.md5.slice(0, 12)}…`);
      if (!firstUrlOK) firstUrlOK = { platform: label, url: f.url, md5: f.md5, name: f.name };
    }
    if (result.files.length > 3) {
      console.log(`      … ${result.files.length - 3} more`);
    }
  }

  console.log(`\n📊 List results: ${okCount}/${ALL_PLATFORMS.length} platforms returned data`);

  if (!args.download) {
    console.log('\nSkipping sample download (--no-download).');
    process.exit(okCount === ALL_PLATFORMS.length ? 0 : 1);
  }

  if (!firstUrlOK) {
    console.error('\n❌ No file URL returned by any platform. Either:');
    console.error('   - Date has no data (try --date=YYYY-MM-DD with a known good day)');
    console.error('   - Auth failure on all platforms (check key)');
    process.exit(1);
  }

  // Step 3 — download a sample file to inspect format
  console.log(`\n[3/4] downloading sample: ${firstUrlOK.platform} — ${firstUrlOK.name}`);
  const downloadStart = Date.now();
  let buf: Buffer;
  try {
    const res = await fetch(firstUrlOK.url);
    if (!res.ok) {
      console.error(`❌ HTTP ${res.status} downloading file`);
      process.exit(1);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error(`❌ download error: ${(e as Error).message}`);
    process.exit(1);
  }
  const downloadMs = Date.now() - downloadStart;
  console.log(`✅ downloaded ${fmtFileSize(buf.length)} in ${downloadMs}ms`);

  // Step 4 — md5 check + format sniff
  const computedMd5 = createHash('md5').update(buf).digest('hex');
  const md5OK = computedMd5.toLowerCase() === firstUrlOK.md5.toLowerCase();
  console.log(`   md5: ${md5OK ? '✅ matches' : '❌ MISMATCH (server=' + firstUrlOK.md5 + ' vs computed=' + computedMd5 + ')'}`);

  const head = buf.slice(0, 8);
  const headHex = head.toString('hex');
  let formatHint = 'unknown';
  // Avro OCF magic = "Obj\x01" (0x4f 0x62 0x6a 0x01). Check before the
  // generic "plain text" branch — "Obj" alone is 3 printable ASCII bytes
  // and would otherwise be mis-labelled.
  if (head[0] === 0x4F && head[1] === 0x62 && head[2] === 0x6A && head[3] === 0x01) {
    formatHint = 'avro OCF (Obj\\x01 magic)';
  } else if (head[0] === 0x50 && head[1] === 0x4B)        formatHint = 'zip / xlsx (PK header)';
  else if (head[0] === 0x7B || head[0] === 0x5B)          formatHint = 'json (starts with { or [)';
  else if (head[0] === 0xEF && head[1] === 0xBB)          formatHint = 'utf-8 BOM text (likely csv/tsv)';
  else if (head[0] >= 0x20 && head[0] <= 0x7E)            formatHint = 'plain text (likely csv/tsv/json)';
  console.log(`   first 8 bytes: ${headHex}  → ${formatHint}`);

  const previewBytes = Math.min(buf.length, 800);
  const previewText  = buf.slice(0, previewBytes).toString('utf8');
  console.log(`\n--- File preview (first ${previewBytes} bytes as utf8) ---`);
  console.log(previewText);
  console.log('--- end preview ---');

  // Save sample for offline inspection. `__dirname` = app/scripts, so
  // `../docs/research` = app/docs/research (the one that exists). Old
  // path '../../docs/research' resolved to repo root and ENOENT'd.
  const outDir  = path.resolve(__dirname, '../docs/research');
  const safeName = firstUrlOK.name.replace(/[^\w.-]/g, '_');
  const outPath = path.join(outDir, `newrank_sample_${args.date}_${firstUrlOK.platform}_${safeName}`);
  try {
    writeFileSync(outPath, buf);
    console.log(`\n💾 sample saved → ${outPath}`);
  } catch (e) {
    console.warn(`⚠ could not save sample: ${(e as Error).message}`);
  }

  console.log('\n🎉 probe complete. Next steps:');
  console.log('   1. Eyeball the preview above — confirm format (csv? json? xlsx?)');
  console.log('   2. If csv: count columns, identify which fields map to playCount/likes/topic etc.');
  console.log('   3. Update DECISIONS_LOG with concrete file format (D31 follow-up)');
  console.log('   4. Build W4-01 parser using the inferred schema');

  process.exit(okCount === ALL_PLATFORMS.length && md5OK ? 0 : 1);
}

main().catch((e) => {
  console.error('probe errored:', e);
  process.exit(1);
});
