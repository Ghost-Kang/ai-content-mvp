// W4-06-V3 — Trending items facade.
//
// One-stop function for the topic-selection UI:
//   list files → download → decode Avro → normalize per-platform records →
//   sort by rank → return.
//
// Wrapped in `unstable_cache` (12h) per (date, platform) so the /topics
// page can be re-hydrated cheaply: the underlying network round trip is
// 4 × ~300-500 KB downloads + Avro decode (~200ms total wall time on a
// warm DNS), too expensive to repeat on every page nav.
//
// Server-only module: imports `next/cache` and reads NEWRANK_API_KEY
// via the underlying client. Do not import from a client component.

import { unstable_cache } from 'next/cache';
import {
  ALL_PLATFORMS,
  type NewrankPlatform,
  PLATFORM_LABEL,
  DataSourceError,
} from './types';
import { getDefaultNewrankClient } from './client';
import { decodeNewrankAvroBuffer } from './avro-reader';
import {
  normalizeTrendingRecords,
  type NormalizedTrendingItem,
} from './normalize';

export interface TrendingFetchResult {
  /** Date the items were published for (caller-supplied, not "today"). */
  date:     string;
  /** Per-platform results; one entry per platform asked for. */
  platforms: Array<{
    platform: NewrankPlatform;
    label:    string;
    items:    NormalizedTrendingItem[];
    /** Soft error string if this platform failed; items will be empty. */
    error?:   string;
  }>;
  /** ISO-ish wall-clock time the underlying fetch ran. */
  fetchedAt: string;
}

/**
 * T-3 default — by 2026-04-26 probe, T-1 is always empty, T-2 dy lags,
 * T-3 has all 4 platforms reliably populated. UI callers can pass a
 * different date to backfill.
 */
export function defaultTrendingDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
}

/**
 * Internal — actually does the network calls + decode + normalize for
 * one (date, platform). Returns either items or a soft error string;
 * never throws (so one failing platform doesn't poison the others).
 */
async function fetchOnePlatform(
  date: string,
  platform: NewrankPlatform,
): Promise<{ items: NormalizedTrendingItem[]; error?: string }> {
  const client = getDefaultNewrankClient();
  let listResult;
  try {
    listResult = await client.listFiles({ platform, date });
  } catch (e) {
    if (e instanceof DataSourceError) {
      return { items: [], error: `${e.code}: ${e.message}` };
    }
    return { items: [], error: (e as Error)?.message ?? String(e) };
  }
  if (listResult.files.length === 0) {
    return { items: [], error: 'NOT_READY: file list empty for this date' };
  }

  // Per-platform there's a single daily file; if 新榜 ever ships > 1
  // we just take the first (the only one observed in production so far).
  const file = listResult.files[0];

  let buf: Buffer;
  try {
    const res = await fetch(file.url);
    if (!res.ok) {
      return { items: [], error: `download HTTP ${res.status}` };
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { items: [], error: `download failed: ${(e as Error)?.message ?? String(e)}` };
  }

  let decoded;
  try {
    decoded = await decodeNewrankAvroBuffer(buf);
  } catch (e) {
    return { items: [], error: `avro decode failed: ${(e as Error)?.message ?? String(e)}` };
  }

  const items = normalizeTrendingRecords(platform, decoded.records);
  // 新榜 returns ranks roughly sorted but not strictly — make it explicit
  // so the UI doesn't have to.
  items.sort((a, b) => a.rank - b.rank);
  return { items };
}

/** Cached fetch of trending items for one (date, platform) pair. */
const fetchCachedOnePlatform = unstable_cache(
  async (date: string, platform: NewrankPlatform) => fetchOnePlatform(date, platform),
  ['newrank-trending-one'],
  {
    revalidate: 60 * 60 * 12, // 12h — file is static once published; T-3 is never going to change.
    tags:       ['newrank-trending'],
  },
);

/**
 * Fetch trending items for the given date across multiple platforms in
 * parallel. Each platform is cached independently — first request takes
 * ~600ms wall (network + decode), subsequent requests within the TTL are
 * effectively free.
 *
 * @param opts.date     YYYY-MM-DD (CST). Defaults to T-3.
 * @param opts.platforms Subset of platforms to fetch. Defaults to all 4.
 */
export async function fetchTrendingItems(opts: {
  date?:     string;
  platforms?: ReadonlyArray<NewrankPlatform>;
} = {}): Promise<TrendingFetchResult> {
  const date     = opts.date ?? defaultTrendingDate();
  const targets  = opts.platforms && opts.platforms.length > 0
    ? Array.from(opts.platforms)
    : ALL_PLATFORMS;

  const fetchedAt = new Date().toISOString();
  const platforms = await Promise.all(
    targets.map(async (platform) => {
      const { items, error } = await fetchCachedOnePlatform(date, platform);
      return {
        platform,
        label: PLATFORM_LABEL[platform],
        items,
        error,
      };
    }),
  );

  return { date, platforms, fetchedAt };
}

/** Tag exported for `revalidateTag` in admin actions / cron handlers. */
export const TRENDING_CACHE_TAG = 'newrank-trending';
