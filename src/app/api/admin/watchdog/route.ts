// Stuck-run watchdog HTTP entry point.
//
// Trigger options (pick one — none are wired by default):
//   - Vercel Cron: add `{ "crons": [{ "path": "/api/admin/watchdog?apply=1",
//     "schedule": "*/15 * * * *" }] }` to vercel.json. Requires Pro plan
//     (Hobby = daily cron only); CRON_SECRET must be set in env so Vercel
//     auto-injects `Authorization: Bearer ${CRON_SECRET}`.
//   - GitHub Actions: schedule a workflow that curls this URL with the
//     same bearer header. Free, supports any cron expression, ~5-15min lag.
//   - Local cron / pnpm prod:watchdog --apply: bypass HTTP entirely,
//     same logic via shared `lib/admin/stuck-runs.ts`.
//
// Auth model:
//   - In production: require `Authorization: Bearer ${CRON_SECRET}`.
//     Manual GETs from the internet without the header are 401'd.
//   - When CRON_SECRET is not set we fail closed with 503 in production,
//     mirroring the same posture as the QStash worker route in
//     `api/workflow/run/route.ts`.
//
// Behavior:
//   - GET (no apply): dry-run, returns findings only — used for ad-hoc
//     checks via curl + token.
//   - GET ?apply=1: detection + flip — this is what schedulers should hit.
//   - Always returns JSON with { ts, apply, findings, fixes } so logs are
//     searchable for "fixes":[ entries.

import { NextRequest } from 'next/server';
import { detectAndRecover } from '@/lib/admin/stuck-runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Detection + at most a handful of UPDATEs; should finish in < 5 seconds
// even on a busy day. Cap below maxDuration to surface DB stalls clearly.
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  // Vercel Cron sends "Bearer <CRON_SECRET>" exactly.
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const inProd = process.env.NODE_ENV === 'production';

  if (inProd && !process.env.CRON_SECRET) {
    console.error('[watchdog] refusing to run — CRON_SECRET missing in production');
    return Response.json(
      { error: 'WATCHDOG_NOT_CONFIGURED', message: 'CRON_SECRET is not set' },
      { status: 503 },
    );
  }

  if (inProd && !isAuthorized(req)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const apply = req.nextUrl.searchParams.get('apply') === '1';

  try {
    const result = await detectAndRecover({ apply });

    if (result.findings.length > 0) {
      console.warn('[watchdog] findings', {
        apply:  result.apply,
        counts: countByKind(result.findings),
        fixes:  result.fixes,
      });
    }

    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[watchdog] error', { message, err });
    return Response.json(
      { error: 'WATCHDOG_ERROR', message },
      { status: 500 },
    );
  }
}

function countByKind(findings: { kind: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}
