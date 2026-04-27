// D31 (2026-04-26) — 新榜 per-platform record → NormalizedTrendingItem.
//
// The 4 platform schemas (see docs/research/newrank_schema_*.json)
// disagree on field names and field presence:
//
//   platform  | fields | category naming                        | extras
//   ----------|--------|----------------------------------------|--------------------------
//   dy   (抖音)| 22     | opusFirstCategory / opusSecondCategory | topics
//   ks   (快手)| 22     | opusFirstCategory / opusSecondCategory | authorType + viewNum
//   xhs  (红书)| 23     | firstCategory / secondCategory         | title
//   bz   (B站) | 21     | firstCategory / secondCategory         | title + viewNum (no account)
//
// The topic-selection node (W4-01..04) needs a *uniform* shape so it
// can sort / rank / bucket across platforms without 4 branches. That
// uniform shape is `NormalizedTrendingItem`, produced by the
// per-platform adapters below.
//
// Rules this module enforces:
//   - First/secondCategory are always unprefixed (no "opus" carry-over).
//   - Numeric fields that the source says are missing stay `undefined`
//     (NOT 0) so downstream ranking can exclude them rather than
//     accidentally sort zeros to the top.
//   - Required fields (`platform`, `rank`, `opusId`) — if source
//     lacks them we drop the row via `normalizeTrendingRecord()`
//     returning `null`, rather than fake an ID.
//
// Pure functions, no IO. Easy to unit-test against docs/research/
// fixtures.

import type { NewrankPlatform } from './types';
import type { NewrankAvroRecord } from './avro-reader';

/**
 * Unified shape that the topic-selection node sees, regardless of
 * platform. Optional fields really do vary by platform — callers
 * must check before using.
 */
export interface NormalizedTrendingItem {
  platform: NewrankPlatform;
  rank:     number;
  /** The 新榜 "opusId" — opaque per-platform content ID. */
  opusId:   string;

  /** Permalink to the item on the source platform (may be undefined). */
  url?:     string;
  /** Cover / thumbnail image URL. */
  cover?:   string;
  /** Short text: xhs/bz call this `title`; dy/ks don't have one. */
  title?:   string;
  /** Longer text: present on all 4 platforms. */
  description?: string;
  /** Duration in seconds (source units: platform-dependent). */
  duration?: number;

  /** First-level category, unified name ("opus" prefix stripped). */
  firstCategory?:  string;
  /** Second-level category, unified name. */
  secondCategory?: string;
  /** Hashtags / topic string (dy only; freeform). */
  topics?: string;
  /** Content type label (dy only; freeform). */
  type?: string;

  /** Engagement counts — any may be undefined if source omits. */
  likeCount?:     number;
  commentCount?:  number;
  shareCount?:    number;
  collectCount?:  number;
  interactCount?: number;
  /** Play count: ks & bz only. Dy & xhs don't publish this. */
  playCount?:     number;

  /** Author fields. `account` is absent on bz. */
  authorUid?:      string;
  authorNickname?: string;
  authorAccount?:  string;
  /** ks-only: "个人" / "机构" / ... (kept as raw string). */
  authorType?:     string;
  /** Follower count at snapshot time. */
  authorFansNum?:  number;
  authorAvatar?:   string;

  /** ISO-ish publish time as returned by 新榜 — no parsing here. */
  publishTime?: string;
  updateTime?:  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function strOr(record: NewrankAvroRecord, key: string): string | undefined {
  const v = record[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function numOr(record: NewrankAvroRecord, key: string): number | undefined {
  const v = record[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // avsc may surface Avro `long` as { value, type } or as bigint on
  // older configs — handle both defensively.
  if (typeof v === 'bigint') {
    // Row counts sit comfortably in Number range; the cast is safe
    // for this dataset (max interactNum ~ 10^9).
    return Number(v);
  }
  return undefined;
}

// ─── Per-platform adapters ────────────────────────────────────────────────────

function normalizeDy(r: NewrankAvroRecord): NormalizedTrendingItem | null {
  const opusId = strOr(r, 'opusId');
  const rank   = numOr(r, 'rank');
  if (!opusId || rank === undefined) return null;
  return {
    platform:        'dy',
    rank,
    opusId,
    url:             strOr(r, 'url'),
    cover:           strOr(r, 'cover'),
    description:     strOr(r, 'description'),
    duration:        numOr(r, 'duration'),
    firstCategory:   strOr(r, 'opusFirstCategory'),
    secondCategory:  strOr(r, 'opusSecondCategory'),
    topics:          strOr(r, 'topics'),
    type:            strOr(r, 'type'),
    likeCount:       numOr(r, 'likeNum'),
    commentCount:    numOr(r, 'commentNum'),
    shareCount:      numOr(r, 'shareNum'),
    collectCount:    numOr(r, 'collectNum'),
    interactCount:   numOr(r, 'interactNum'),
    authorUid:       strOr(r, 'uid'),
    authorNickname:  strOr(r, 'nickname'),
    authorAccount:   strOr(r, 'account'),
    authorFansNum:   numOr(r, 'fansNum'),
    authorAvatar:    strOr(r, 'avatar'),
    publishTime:     strOr(r, 'publishTime'),
    updateTime:      strOr(r, 'updateTime'),
  };
}

function normalizeKs(r: NewrankAvroRecord): NormalizedTrendingItem | null {
  const opusId = strOr(r, 'opusId');
  const rank   = numOr(r, 'rank');
  if (!opusId || rank === undefined) return null;
  return {
    platform:        'ks',
    rank,
    opusId,
    url:             strOr(r, 'url'),
    cover:           strOr(r, 'cover'),
    description:     strOr(r, 'description'),
    duration:        numOr(r, 'duration'),
    firstCategory:   strOr(r, 'opusFirstCategory'),
    secondCategory:  strOr(r, 'opusSecondCategory'),
    type:            strOr(r, 'type'),
    likeCount:       numOr(r, 'likeNum'),
    commentCount:    numOr(r, 'commentNum'),
    shareCount:      numOr(r, 'shareNum'),
    collectCount:    numOr(r, 'collectNum'),
    interactCount:   numOr(r, 'interactNum'),
    playCount:       numOr(r, 'viewNum'),
    authorUid:       strOr(r, 'uid'),
    authorNickname:  strOr(r, 'nickname'),
    authorAccount:   strOr(r, 'account'),
    authorType:      strOr(r, 'authorType'),
    authorFansNum:   numOr(r, 'fansNum'),
    authorAvatar:    strOr(r, 'avatar'),
    publishTime:     strOr(r, 'publishTime'),
    updateTime:      strOr(r, 'updateTime'),
  };
}

function normalizeXhs(r: NewrankAvroRecord): NormalizedTrendingItem | null {
  const opusId = strOr(r, 'opusId');
  const rank   = numOr(r, 'rank');
  if (!opusId || rank === undefined) return null;
  return {
    platform:        'xhs',
    rank,
    opusId,
    url:             strOr(r, 'url'),
    cover:           strOr(r, 'cover'),
    title:           strOr(r, 'title'),
    description:     strOr(r, 'description'),
    duration:        numOr(r, 'duration'),
    firstCategory:   strOr(r, 'firstCategory'),
    secondCategory:  strOr(r, 'secondCategory'),
    type:            strOr(r, 'type'),
    likeCount:       numOr(r, 'likeNum'),
    commentCount:    numOr(r, 'commentNum'),
    shareCount:      numOr(r, 'shareNum'),
    collectCount:    numOr(r, 'collectNum'),
    interactCount:   numOr(r, 'interactNum'),
    authorUid:       strOr(r, 'uid'),
    authorNickname:  strOr(r, 'nickname'),
    authorAccount:   strOr(r, 'account'),
    authorFansNum:   numOr(r, 'fansNum'),
    authorAvatar:    strOr(r, 'avatar'),
    publishTime:     strOr(r, 'publishTime'),
    updateTime:      strOr(r, 'updateTime'),
  };
}

function normalizeBz(r: NewrankAvroRecord): NormalizedTrendingItem | null {
  const opusId = strOr(r, 'opusId');
  const rank   = numOr(r, 'rank');
  if (!opusId || rank === undefined) return null;
  return {
    platform:        'bz',
    rank,
    opusId,
    url:             strOr(r, 'url'),
    cover:           strOr(r, 'cover'),
    title:           strOr(r, 'title'),
    description:     strOr(r, 'description'),
    duration:        numOr(r, 'duration'),
    firstCategory:   strOr(r, 'firstCategory'),
    secondCategory:  strOr(r, 'secondCategory'),
    type:            strOr(r, 'type'),
    likeCount:       numOr(r, 'likeNum'),
    commentCount:    numOr(r, 'commentNum'),
    shareCount:      numOr(r, 'shareNum'),
    collectCount:    numOr(r, 'collectNum'),
    interactCount:   numOr(r, 'interactNum'),
    playCount:       numOr(r, 'viewNum'),
    authorUid:       strOr(r, 'uid'),
    authorNickname:  strOr(r, 'nickname'),
    authorFansNum:   numOr(r, 'fansNum'),
    authorAvatar:    strOr(r, 'avatar'),
    publishTime:     strOr(r, 'publishTime'),
    updateTime:      strOr(r, 'updateTime'),
  };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export function normalizeTrendingRecord(
  platform: NewrankPlatform,
  record: NewrankAvroRecord,
): NormalizedTrendingItem | null {
  switch (platform) {
    case 'dy':  return normalizeDy(record);
    case 'ks':  return normalizeKs(record);
    case 'xhs': return normalizeXhs(record);
    case 'bz':  return normalizeBz(record);
  }
}

export function normalizeTrendingRecords(
  platform: NewrankPlatform,
  records: ReadonlyArray<NewrankAvroRecord>,
): NormalizedTrendingItem[] {
  const out: NormalizedTrendingItem[] = [];
  for (const r of records) {
    const item = normalizeTrendingRecord(platform, r);
    if (item) out.push(item);
  }
  return out;
}
