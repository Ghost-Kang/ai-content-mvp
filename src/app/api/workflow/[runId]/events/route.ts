// W2-07b — SSE endpoint for live workflow run snapshots.
//
// Why SSE (and not WebSocket / per-node QStash chain)?
//   • EventSource is browser-native, auto-reconnects on disconnect, ships
//     cookies same-origin (so Clerk session just works).
//   • One long connection beats N polling requests for the canvas tab.
//   • No need to touch NodeRunner / orchestrator — server-side polls the DB
//     and pushes deltas. Future W2-07c can swap the DB poll for a Redis
//     pubsub subscriber once we have orchestrator-side publishing.
//
// What this does NOT do:
//   • Doesn't replace polling — the client keeps useQuery as the source of
//     truth + fallback. SSE just calls setQueryData on each delta. If SSE
//     dies (network, Vercel timeout, browser tab background), polling
//     transparently takes over.
//   • Doesn't push from inside the orchestrator. We poll DB at 1s on the
//     server side. Real-time-ish (1s avg latency) but cheaper than browser
//     2s polling for the network round trip.
//
// Lifecycle:
//   1. GET /api/workflow/[runId]/events (Clerk middleware → 401 if unauth)
//   2. Verify run belongs to caller's tenant (404 otherwise — no info leak)
//   3. Send initial snapshot
//   4. Loop: every POLL_MS, query DB. If snapshot changed, emit `snapshot`
//      event. Every HEARTBEAT_MS, emit a comment line so reverse-proxies
//      don't reap us.
//   5. When run reaches terminal status → send final snapshot, close
//      stream gracefully.
//   6. Hard ceiling at MAX_LIFETIME_MS (Vercel maxDuration buffer) — we
//      close with an `event: end` so the client knows it was deliberate;
//      EventSource auto-reconnects after that.

import { NextRequest } from 'next/server';
import { createContext } from '@/server/context';
import { isTerminalRunStatus } from '@/lib/workflow/ui-helpers';
import { loadSnapshot, formatEvent, serializeSnapshot } from '@/lib/workflow/sse-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel maxDuration cap — we hold the connection open for at most this many
// seconds, then send `event: end` and let the browser's EventSource reconnect.
export const maxDuration = 300;

const POLL_MS         = 1_000;
const HEARTBEAT_MS    = 25_000;
const MAX_LIFETIME_MS = 270_000; // 4.5min — leave 30s buffer below maxDuration

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { runId } = await params;
  if (typeof runId !== 'string' || runId.length === 0) {
    return new Response('runId required', { status: 400 });
  }

  // Auth + tenant resolution (mirrors tRPC tenantProcedure semantics).
  // Clerk middleware already 307s unauthed callers, so an empty tenantId
  // here is a real bug (e.g. webhook flow accidentally hitting this URL).
  const ctx = await createContext();
  if (!ctx.tenantId || !ctx.userId) {
    return new Response('unauthorized', { status: 401 });
  }

  // Verify ownership — return 404 (not 403) so we don't leak existence.
  const initial = await loadSnapshot(runId, ctx.tenantId);
  if (!initial) {
    return new Response('not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSerialized = serializeSnapshot(initial);
      let closed = false;

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream already closed by the client (tab closed / nav away).
          closed = true;
        }
      };

      const close = (reason: string) => {
        if (closed) return;
        closed = true;
        try { enqueue(formatEvent('end', { reason })); } catch { /* swallow */ }
        try { controller.close(); } catch { /* swallow */ }
      };

      // Initial snapshot — always send, even if unchanged from a hypothetical
      // previous connection. The client treats this as the source of truth
      // for the first paint.
      enqueue(formatEvent('snapshot', initial));

      // If the run is already terminal, send the snapshot + close
      // immediately. No reason to hold the connection open polling.
      if (isTerminalRunStatus(initial.run.status as never)) {
        close('terminal');
        return;
      }

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let pollTimer:      ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer)      clearInterval(pollTimer);
        heartbeatTimer = null;
        pollTimer      = null;
      };

      heartbeatTimer = setInterval(() => {
        // SSE comment lines start with `:`. Browsers + reverse proxies
        // see traffic on the wire and don't reap us.
        enqueue(': heartbeat\n\n');
      }, HEARTBEAT_MS);

      pollTimer = setInterval(async () => {
        if (closed) { cleanup(); return; }

        // Vercel maxDuration ceiling — close cleanly so the client can
        // reconnect rather than hitting the framework's hard timeout.
        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          cleanup();
          close('max-lifetime');
          return;
        }

        try {
          const snap = await loadSnapshot(runId, ctx.tenantId);
          if (!snap) {
            // Run row deleted (tenant cleanup?) — close to surface to the UI.
            cleanup();
            close('gone');
            return;
          }

          const serialized = serializeSnapshot(snap);
          if (serialized !== lastSerialized) {
            lastSerialized = serialized;
            enqueue(formatEvent('snapshot', snap));
          }

          if (isTerminalRunStatus(snap.run.status as never)) {
            cleanup();
            close('terminal');
          }
        } catch (err) {
          // DB blip — log but don't kill the connection. Next tick will retry.
          console.warn('[sse] poll error', err);
        }
      }, POLL_MS);
    },

    cancel() {
      // Browser closed the connection (tab close / nav). Nothing to do —
      // the timers are scoped via closure to the start() block which has
      // already returned; the `closed` flag prevents further enqueues.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream; charset=utf-8',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      // Disable proxy buffering (Nginx, Vercel edge) so events flush
      // promptly — without this, snapshots can sit in a buffer for seconds.
      'X-Accel-Buffering':           'no',
    },
  });
}

// Helpers (loadSnapshot / formatEvent / serializeSnapshot / Snapshot)
// live in @/lib/workflow/sse-snapshot — see test-sse-snapshot.ts for unit cov.
