// W4-03-V3 — Topic Analysis Redis cache.
//
// Trending data + LLM analysis are both effectively static once
// produced (the same opusId on the same niche will yield the same
// answer for ~24h). Caching saves ~¥0.01-0.05 per repeat click and
// hides 3-5s of LLM latency on second view.
//
// Key shape:
//   topic-analysis:v1:<platform>:<opusId>:<nicheKey>
//
// `nicheKey` is a small djb2 hash of the trimmed/normalized niche so
// changing one character invalidates correctly, but trailing
// whitespace doesn't (we trim before hashing). When no niche is
// supplied, we use the literal "no-niche" sentinel.
//
// We deliberately do not import a shared Redis client — none exists,
// and `Redis.fromEnv()` is what `app/api/healthz` already does. If a
// second cache user appears we'll lift this into `lib/redis.ts`.

import { Redis } from '@upstash/redis';
import {
  TOPIC_ANALYSIS_PROMPT_VERSION,
  type TopicAnalysisInput,
  type TopicAnalysisResult,
} from './types';

const TTL_SECONDS = 60 * 60 * 24; // 24h
const CACHE_PREFIX = `topic-analysis:${TOPIC_ANALYSIS_PROMPT_VERSION}`;

let cachedClient: Redis | null = null;

function getRedis(): Redis | null {
  if (cachedClient) return cachedClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  cachedClient = Redis.fromEnv();
  return cachedClient;
}

/**
 * Stable, deterministic hash of the niche string. djb2 is plenty for a
 * cache-busting key (collisions would only mean a stale read for one
 * niche-pair, which TTL fixes within 24h).
 */
export function nicheKey(niche?: string): string {
  if (!niche) return 'no-niche';
  const normalized = niche.trim().toLowerCase().normalize('NFKC');
  if (normalized.length === 0) return 'no-niche';
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 33) ^ normalized.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function buildCacheKey(input: Pick<TopicAnalysisInput, 'platform' | 'opusId' | 'niche'>): string {
  return `${CACHE_PREFIX}:${input.platform}:${input.opusId}:${nicheKey(input.niche)}`;
}

/**
 * Read-through. Returns null on cache miss OR when Redis isn't
 * configured (dev without Upstash creds will simply re-call the LLM
 * every time — graceful degradation).
 */
export async function readCached(
  input: Pick<TopicAnalysisInput, 'platform' | 'opusId' | 'niche'>,
): Promise<TopicAnalysisResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  const key = buildCacheKey(input);
  try {
    const raw = await redis.get<TopicAnalysisResult | string | null>(key);
    if (!raw) return null;
    // Upstash auto-parses JSON when the stored value was a JSON string,
    // but `redis.set(key, JSON.stringify(...))` round-trips as string.
    // Handle both shapes.
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    const result = parsed as TopicAnalysisResult;
    return { ...result, cacheHit: true };
  } catch {
    // Cache outage must never break the user flow. Fall through to LLM.
    return null;
  }
}

export async function writeCached(
  input: Pick<TopicAnalysisInput, 'platform' | 'opusId' | 'niche'>,
  result: TopicAnalysisResult,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = buildCacheKey(input);
  try {
    // Strip `cacheHit` before storage so a re-read can set it correctly.
    const { cacheHit: _drop, ...storable } = result;
    void _drop;
    await redis.set(key, JSON.stringify(storable), { ex: TTL_SECONDS });
  } catch {
    // Same as read path — cache is best-effort.
  }
}

/**
 * Test seam — overrides the module-level Redis client. Tests should
 * pass `null` to clear, or a fake with `get`/`set`/`ping` shape.
 */
export function __setRedisClientForTesting(client: Redis | null): void {
  cachedClient = client;
}

export const TOPIC_ANALYSIS_CACHE_TTL_SECONDS = TTL_SECONDS;
