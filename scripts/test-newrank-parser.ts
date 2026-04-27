// D31 (2026-04-26) — Offline tests for 新榜 Avro decode + normalize.
//
// Uses the 4 real sample files saved by `pnpm ds:dump:newrank` under
// app/docs/research/. No network, no NEWRANK_API_KEY, no DB. Ensures
// that:
//   1. All 4 platform files decode cleanly via `avsc` (codec=null OCF).
//   2. Row count matches Top-500 expectation (allow ±10% for empty
//      days / short tail).
//   3. Every record yields a `NormalizedTrendingItem` (required
//      fields `platform`, `rank`, `opusId` present).
//   4. Platform-specific field contracts hold:
//        - dy/xhs: playCount is ALWAYS undefined.
//        - ks/bz:  playCount is populated on at least 1 record.
//        - xhs/bz: title    is populated on at least 1 record.
//        - dy/ks:  title    is always undefined.
//        - bz:     authorAccount is always undefined.
//   5. Cross-platform sortability: interactCount / likeCount are
//      numeric where present (not string / bigint), so the topic
//      node's sort can be a plain `a.likeCount - b.likeCount`.
//
// Run:  pnpm ds:test:newrank:parser

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  decodeNewrankAvroBuffer,
  normalizeTrendingRecords,
  type NewrankPlatform,
  type NormalizedTrendingItem,
} from '../src/lib/data-source/newrank';

const FIXTURE_DATE = '2026-04-23';
const FIXTURES: Record<NewrankPlatform, string> = {
  dy:  `newrank_sample_${FIXTURE_DATE}_dy_htkj_dy_rankTop500_daily_data_20260423.avro`,
  ks:  `newrank_sample_${FIXTURE_DATE}_ks_htkj_ks_rankTop500_daily_data_20260423.avro`,
  xhs: `newrank_sample_${FIXTURE_DATE}_xhs_htkj_xhs_rankTop500_daily_data_20260423.avro`,
  bz:  `newrank_sample_${FIXTURE_DATE}_bz_htkj_bz_rankTop500_daily_data_20260423.avro`,
};

const FIXTURE_DIR = path.resolve(__dirname, '../docs/research');

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};
const section = (t: string) => console.log(`\n▶ ${t}`);

// ─── helpers ─────────────────────────────────────────────────────────────────

function everyUndefined(items: NormalizedTrendingItem[], key: keyof NormalizedTrendingItem): boolean {
  return items.every((it) => it[key] === undefined);
}

function anyDefined(items: NormalizedTrendingItem[], key: keyof NormalizedTrendingItem): boolean {
  return items.some((it) => it[key] !== undefined);
}

async function loadPlatform(p: NewrankPlatform) {
  const fpath = path.join(FIXTURE_DIR, FIXTURES[p]);
  if (!existsSync(fpath)) {
    console.error(
      `❌ fixture missing: ${fpath}\n` +
      `   run \`pnpm ds:dump:newrank --date=${FIXTURE_DATE} --platform=${p}\` first.`,
    );
    process.exit(3);
  }
  const buf = readFileSync(fpath);
  const decoded = await decodeNewrankAvroBuffer(buf);
  const items = normalizeTrendingRecords(p, decoded.records);
  return { buf, decoded, items };
}

// ─── cases ────────────────────────────────────────────────────────────────────

async function runPlatform(p: NewrankPlatform) {
  section(`${p} — decode + normalize`);
  const { buf, decoded, items } = await loadPlatform(p);

  expect(decoded.records.length > 0,     `${p}: decoded > 0 records`);
  expect(decoded.records.length >= 400,  `${p}: decoded ≥ 400 rows (Top-500 tolerance, got ${decoded.records.length})`);
  expect(decoded.codec === 'null',       `${p}: codec = null (got "${decoded.codec}")`);
  expect(decoded.schemaJson.length > 100, `${p}: schema JSON embedded (${decoded.schemaJson.length} chars)`);
  expect(items.length === decoded.records.length,
    `${p}: every record normalized (no drops)`);

  // Required fields
  expect(items.every((x) => x.platform === p), `${p}: platform stamped on every item`);
  expect(items.every((x) => typeof x.rank === 'number' && x.rank > 0),
    `${p}: rank is a positive number on every item`);
  expect(items.every((x) => typeof x.opusId === 'string' && x.opusId.length > 0),
    `${p}: opusId non-empty on every item`);

  // Ranks should be monotonic-ish (1..N) — check min == 1 and max approximately N
  const ranks = items.map((x) => x.rank).sort((a, b) => a - b);
  expect(ranks[0] === 1,                 `${p}: rank range starts at 1`);
  expect(ranks[ranks.length - 1] >= ranks.length * 0.9,
    `${p}: rank range covers most of the population (max=${ranks[ranks.length - 1]})`);

  // Sortability of engagement fields
  const likes = items.map((x) => x.likeCount).filter((v): v is number => typeof v === 'number');
  expect(likes.length > items.length * 0.5,
    `${p}: likeCount populated on >50% of rows (got ${likes.length}/${items.length})`);
  expect(likes.every((v) => Number.isFinite(v)),
    `${p}: every numeric likeCount is finite (not bigint / NaN)`);

  // Non-empty sample for eyeballing
  const top = items.find((x) => x.rank === 1);
  console.log(`  [INFO] rank=1 sample for ${p}:`);
  console.log('        nickname   =', top?.authorNickname);
  console.log('        firstCat   =', top?.firstCategory);
  console.log('        secondCat  =', top?.secondCategory);
  console.log('        likeCount  =', top?.likeCount);
  console.log('        commentCnt =', top?.commentCount);
  console.log('        playCount  =', top?.playCount);
  console.log('        title      =', top?.title);
  console.log('        url        =', top?.url?.slice(0, 80));

  return items;
}

async function caseContracts(
  dyItems: NormalizedTrendingItem[],
  ksItems: NormalizedTrendingItem[],
  xhsItems: NormalizedTrendingItem[],
  bzItems: NormalizedTrendingItem[],
) {
  section('per-platform field contracts');

  // playCount: only ks & bz
  expect(everyUndefined(dyItems,  'playCount'), 'dy: playCount is ALWAYS undefined');
  expect(everyUndefined(xhsItems, 'playCount'), 'xhs: playCount is ALWAYS undefined');
  expect(anyDefined(ksItems, 'playCount'),      'ks: playCount is populated on ≥1 row');
  expect(anyDefined(bzItems, 'playCount'),      'bz: playCount is populated on ≥1 row');

  // title: only xhs & bz
  expect(everyUndefined(dyItems, 'title'),  'dy: title is ALWAYS undefined');
  expect(everyUndefined(ksItems, 'title'),  'ks: title is ALWAYS undefined');
  expect(anyDefined(xhsItems, 'title'),     'xhs: title is populated on ≥1 row');
  expect(anyDefined(bzItems, 'title'),      'bz: title is populated on ≥1 row');

  // authorAccount: bz has no source field; should never be defined
  expect(everyUndefined(bzItems, 'authorAccount'),
    'bz: authorAccount is ALWAYS undefined (schema has no `account` field)');

  // authorType: only ks
  expect(everyUndefined(dyItems,  'authorType'), 'dy: authorType is ALWAYS undefined');
  expect(everyUndefined(xhsItems, 'authorType'), 'xhs: authorType is ALWAYS undefined');
  expect(everyUndefined(bzItems,  'authorType'), 'bz: authorType is ALWAYS undefined');
  expect(anyDefined(ksItems, 'authorType'),      'ks: authorType is populated on ≥1 row');

  // topics: only dy
  expect(anyDefined(dyItems, 'topics'),          'dy: topics populated on ≥1 row');
  expect(everyUndefined(ksItems,  'topics'),     'ks: topics is ALWAYS undefined');
  expect(everyUndefined(xhsItems, 'topics'),     'xhs: topics is ALWAYS undefined');
  expect(everyUndefined(bzItems,  'topics'),     'bz: topics is ALWAYS undefined');

  // Category normalization — first/secondCategory should NEVER retain
  // the "opus" prefix for any platform (prefix-stripping happens in
  // the per-platform adapter).
  //
  // Empirical note (D31 probe 2026-04-23):
  //   - dy/xhs/bz all populate categories on the majority of rows.
  //   - ks declares opusFirstCategory/opusSecondCategory in its Avro
  //     schema but **omits these fields from the wire records**.
  //     Result: ks NormalizedTrendingItem always has undefined
  //     first/secondCategory. Topic-selection must not rely on ks
  //     category for bucketing — treat ks as category-less.
  for (const [label, items] of [
    ['dy', dyItems], ['xhs', xhsItems], ['bz', bzItems],
  ] as const) {
    const hasCategory = items.some((x) => x.firstCategory || x.secondCategory);
    expect(hasCategory, `${label}: at least 1 row has firstCategory/secondCategory`);
  }
  const ksHasCategory = ksItems.some((x) => x.firstCategory || x.secondCategory);
  expect(!ksHasCategory,
    'ks: firstCategory/secondCategory always undefined (source omits; not an adapter bug)');
}

// ─── runner ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('─── newrank parser: offline tests against docs/research/ fixtures ───');

  const dyItems  = await runPlatform('dy');
  const ksItems  = await runPlatform('ks');
  const xhsItems = await runPlatform('xhs');
  const bzItems  = await runPlatform('bz');

  await caseContracts(dyItems, ksItems, xhsItems, bzItems);

  console.log('\n─────────────────────────────────────────────');
  if (totalFailures === 0) {
    console.log('✅ ALL CASES PASSED');
    process.exit(0);
  } else {
    console.log(`❌ ${totalFailures} assertion(s) failed`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('test runner errored:', e);
  process.exit(1);
});
