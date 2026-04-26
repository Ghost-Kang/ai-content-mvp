// W2-07a — Workflow dispatcher.
//
// Decouples "the user kicks off a run" from "the orchestrator actually runs".
// Two modes, picked via WORKFLOW_DISPATCH_MODE:
//
//   inline (default in dev) — `void buildFullOrchestrator().run(runId)` in
//     the same process. Same as the W3-05 fire-and-forget hack, but
//     centralized so we have one place to swap. Local dev DOES NOT need
//     QStash because QStash can't reach localhost (no public URL).
//
//   qstash (default in prod when keys present) — publish a signed JSON
//     message to QStash; QStash POSTs to our worker route, which runs
//     the orchestrator out-of-band. The user's HTTP request returns in
//     ~50ms, so navigating away or closing the browser cannot abort
//     the run. This is the W3-05 known-limitation fix.
//
// ⚠ Vercel runtime cap: even with QStash the worker route runs as a
//   single function invocation. Vercel Pro caps non-streaming functions
//   at 300s; full 5-node runs (especially video) can exceed that. If
//   we hit it in production the next step is W2-07c (per-node QStash
//   chain — each node enqueues the next). Documented but NOT implemented
//   here to keep this PR small.

import { Client } from '@upstash/qstash';
import { buildFullOrchestrator } from '.';
import type { RunResult } from './orchestrator';

// ─── Config ───────────────────────────────────────────────────────────────────

export type DispatchMode = 'inline' | 'qstash';

export interface DispatchResult {
  mode:        DispatchMode;
  /** QStash message id (qstash mode only). undefined for inline. */
  messageId?:  string;
  /** ISO timestamp of when dispatch returned (NOT when the run finishes). */
  dispatchedAt: string;
}

export class DispatchError extends Error {
  constructor(public readonly code: 'NO_PUBLIC_URL' | 'PUBLISH_FAILED' | 'BAD_MODE', message: string) {
    super(message);
    this.name = 'DispatchError';
  }
}

// ─── Mode resolution ──────────────────────────────────────────────────────────

/**
 * Determines which dispatch mode to use based on env. Order:
 *   1. explicit WORKFLOW_DISPATCH_MODE — wins
 *   2. QSTASH_TOKEN present + we can derive a public URL → 'qstash'
 *   3. else → 'inline'
 */
export function resolveDispatchMode(): DispatchMode {
  const explicit = process.env.WORKFLOW_DISPATCH_MODE;
  if (explicit === 'inline' || explicit === 'qstash') return explicit;
  if (explicit) {
    throw new DispatchError(
      'BAD_MODE',
      `WORKFLOW_DISPATCH_MODE must be 'inline' or 'qstash', got "${explicit}"`,
    );
  }

  if (process.env.QSTASH_TOKEN && resolveWorkerBaseUrlOrNull()) {
    return 'qstash';
  }
  return 'inline';
}

function resolveWorkerBaseUrlOrNull(): string | null {
  // Allow explicit override (useful with ngrok / cloudflared during local
  // QStash testing or non-Vercel deploys).
  const explicit = process.env.WORKFLOW_WORKER_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  // Vercel injects VERCEL_URL on deployments (without protocol).
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // Public-facing URL for production deploys behind a custom domain.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  return null;
}

function resolveWorkerBaseUrl(): string {
  const url = resolveWorkerBaseUrlOrNull();
  if (!url) {
    throw new DispatchError(
      'NO_PUBLIC_URL',
      'qstash mode requires WORKFLOW_WORKER_BASE_URL or VERCEL_URL or NEXT_PUBLIC_APP_URL',
    );
  }
  return url;
}

// ─── Dependency injection seam (for tests) ────────────────────────────────────

export interface DispatchDeps {
  /**
   * Publishes a signed JSON message to the QStash worker URL.
   * Default impl uses the @upstash/qstash SDK. Tests inject a stub.
   */
  publish?:    (args: PublishArgs) => Promise<{ messageId: string }>;
  /**
   * Inline runner. Default impl `void`s the promise and logs failures.
   * Tests inject a stub that captures the runId for assertions.
   */
  runInline?:  (runId: string) => Promise<RunResult> | void;
}

export interface PublishArgs {
  url:    string;
  body:   { runId: string };
}

const defaultPublish: NonNullable<DispatchDeps['publish']> = async ({ url, body }) => {
  // QStash is region-scoped. Default qstash.upstash.io routes to EU; US
  // accounts get "user (...) not found in this region (eu-central-1)".
  // Set QSTASH_URL to the regional endpoint:
  //   https://qstash-us-east-1.upstash.io
  //   https://qstash-eu-central-1.upstash.io
  // (Format is qstash-<region>.upstash.io — NOT <region>.qstash.upstash.io
  //  which doesn't resolve. We learned this the hard way.)
  // Docs: https://upstash.com/docs/qstash/howto/multi-region
  const client = new Client({
    token:    process.env.QSTASH_TOKEN!,
    baseUrl:  process.env.QSTASH_URL,   // undefined → SDK default
  });
  // QStash retries 3x on 5xx by default — we rely on this for transient
  // worker errors. The worker route MUST be idempotent (it is — see route).
  const res = await client.publishJSON({
    url,
    body,
    // Allow up to 5 minutes for worker — Vercel Pro hard cap.
    // Per-node split (W2-07c) would let us drop this dramatically.
    retries: 3,
  });
  return { messageId: (res as { messageId: string }).messageId };
};

const defaultRunInline: NonNullable<DispatchDeps['runInline']> = (runId: string) => {
  // void the promise so the awaiting caller doesn't block on orchestrator
  // completion. Failures land in the run row (orchestrator persists status)
  // — console.warn is just operator visibility.
  void buildFullOrchestrator()
    .run(runId)
    .catch((err) => {
      console.warn('[workflow.dispatch.inline] orchestrator failure', { runId, err });
    });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hands a runId off to the orchestrator. Returns IMMEDIATELY — the
 * orchestrator runs out-of-band (qstash) or in the same Node process
 * fire-and-forget (inline). Either way, callers MUST NOT assume the run
 * is finished when this resolves; poll workflow.get instead.
 */
export async function dispatchRun(
  runId: string,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const mode = resolveDispatchMode();
  const dispatchedAt = new Date().toISOString();

  if (mode === 'inline') {
    const runner = deps.runInline ?? defaultRunInline;
    runner(runId);
    return { mode, dispatchedAt };
  }

  // qstash
  const baseUrl = resolveWorkerBaseUrl();
  const workerUrl = `${baseUrl}/api/workflow/run`;
  const publish = deps.publish ?? defaultPublish;

  try {
    const { messageId } = await publish({
      url:  workerUrl,
      body: { runId },
    });
    return { mode, messageId, dispatchedAt };
  } catch (err) {
    // Node fetch wraps DNS / TCP / TLS / cert errors as a generic
    // "fetch failed" — the real cause is on err.cause (an AggregateError
    // or system error). Surface it so users can debug instead of guessing.
    throw new DispatchError(
      'PUBLISH_FAILED',
      `QStash publish failed: ${describeFetchError(err)} [worker=${workerUrl}, qstashUrl=${process.env.QSTASH_URL ?? '(default)'}]`,
    );
  }
}

function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    parts.push(`cause: ${cause.message}`);
    // AggregateError (DNS lookup may try multiple addrs and aggregate)
    const inner = (cause as { errors?: unknown[] }).errors;
    if (Array.isArray(inner)) {
      for (const e of inner) {
        if (e instanceof Error) parts.push(`  - ${e.message}`);
      }
    }
    const sysCode = (cause as { code?: string }).code;
    if (sysCode) parts.push(`code=${sysCode}`);
  } else if (cause !== undefined) {
    parts.push(`cause: ${String(cause)}`);
  }
  return parts.join(' | ');
}
