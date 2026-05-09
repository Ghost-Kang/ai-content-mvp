// Manual cache-buster for the NewRank trending cache.
//
// Why this exists: `lib/data-source/newrank/trending.ts` wraps each
// (date, platform) fetch in `unstable_cache` with a 12h TTL. Next.js
// Data Cache is project-scoped and survives redeploys. If a single
// transient network blip lands a soft-error payload in that cache,
// the bad result locks for up to 12h and every user sees the same
// "PROVIDER_UNAVAILABLE" until expiry.
//
// This route revokes the `newrank-trending` tag so the next page hit
// re-fetches. Pair with the cache-bypass-on-error fix in trending.ts —
// that fix prevents *future* poisoning, but cache entries already
// stored before the fix deployed still need a manual revoke.
//
// Usage:
//   curl -X POST https://<host>/api/admin/revalidate-trending \
//     -H "Authorization: Bearer ${CRON_SECRET}"
//
// Auth model mirrors /api/admin/watchdog: bearer-token via CRON_SECRET,
// 401 without it, 503 if CRON_SECRET is missing entirely (so we never
// silently expose this in misconfigured envs).

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { TRENDING_CACHE_TAG } from '@/lib/data-source/newrank';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<Response> {
  const inProd = process.env.NODE_ENV === 'production';

  if (inProd && !process.env.CRON_SECRET) {
    return Response.json(
      { error: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' },
      { status: 503 },
    );
  }
  if (inProd && !isAuthorized(req)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    revalidateTag(TRENDING_CACHE_TAG);
    console.warn('[revalidate-trending] cache tag revoked', { tag: TRENDING_CACHE_TAG });
    return Response.json(
      { ok: true, tag: TRENDING_CACHE_TAG, ts: new Date().toISOString() },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[revalidate-trending] error', { message });
    return Response.json({ error: 'REVALIDATE_FAILED', message }, { status: 500 });
  }
}
