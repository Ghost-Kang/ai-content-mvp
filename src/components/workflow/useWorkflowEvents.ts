// W2-07b — client side of SSE workflow events.
//
// Pairs with /api/workflow/[runId]/events. Returns a status flag the canvas
// uses to dial polling up/down:
//   • SSE up → poll at SLOW_POLL_MS (insurance only)
//   • SSE down / terminal / browser w/o EventSource → poll at FAST_POLL_MS
//
// Lifecycle:
//   1. mount → open EventSource (cookies flow same-origin → Clerk auth works)
//   2. on `snapshot` event → setQueryData on workflow.get cache
//   3. on `end` event   → server closed cleanly; flip to polling
//   4. on error          → EventSource auto-reconnects; we just track state
//   5. terminal status   → close manually so we don't burn a connection
//   6. unmount           → close

'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc-client';

interface UseWorkflowEventsArgs {
  runId:    string;
  /** Skip SSE entirely (e.g. when the canvas is rendered with auto-refresh paused). */
  disabled?: boolean;
}

export type SseStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'unsupported';

export function useWorkflowEvents({ runId, disabled }: UseWorkflowEventsArgs) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<SseStatus>('idle');

  useEffect(() => {
    if (disabled) {
      setStatus('idle');
      return;
    }
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      setStatus('unsupported');
      return;
    }
    // Note: we open SSE unconditionally — even for already-terminal runs.
    // The server detects terminal state and immediately sends the snapshot
    // followed by `event: end`, so the connection lifetime is bounded by
    // the round-trip. This avoids a chicken-and-egg with the useQuery cache
    // needing to be hydrated first to know runStatus.

    let cancelled = false;
    setStatus('connecting');

    const url = `/api/workflow/${encodeURIComponent(runId)}/events`;
    const es = new EventSource(url);

    es.addEventListener('open', () => {
      if (cancelled) return;
      setStatus('open');
    });

    es.addEventListener('snapshot', (event) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          run:   unknown;
          steps: unknown;
        };
        // tRPC react-query cache is keyed by superjson-serialized input. We
        // mirror the workflow.get response shape exactly — see the route's
        // Snapshot interface. The client doesn't care if Date fields come
        // through as ISO strings (they're rendered via formatRelativeTime
        // which accepts both).
        utils.workflow.get.setData({ runId }, payload as never);
      } catch (err) {
        // Bad payload shouldn't kill the connection — wait for next tick.
        console.warn('[sse] malformed snapshot', err);
      }
    });

    es.addEventListener('end', () => {
      if (cancelled) return;
      // Server closed cleanly (terminal status, max-lifetime, or run gone).
      // Don't reopen — caller will rely on polling.
      setStatus('closed');
      es.close();
    });

    es.addEventListener('error', () => {
      if (cancelled) return;
      // EventSource will auto-reconnect with backoff. We tag as `connecting`
      // so the UI can show "重连中" if it cares; polling fallback is gated
      // on `status !== 'open'` so it kicks in immediately.
      setStatus(es.readyState === EventSource.CLOSED ? 'closed' : 'connecting');
    });

    return () => {
      cancelled = true;
      es.close();
    };
    // utils is stable across renders, but eslint can't prove it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, disabled]);

  return { status };
}
