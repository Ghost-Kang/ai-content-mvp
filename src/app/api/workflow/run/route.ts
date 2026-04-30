// W2-07a — QStash worker that runs the orchestrator out-of-band.
//
// QStash POSTs here when `dispatchRun(runId)` runs in 'qstash' mode.
//
// Idempotency contract:
//   QStash retries on 5xx (default 3 times). To prevent double-execution
//   we acquire a single-writer LOCK via an atomic
//     UPDATE ... WHERE status IN ('pending', 'failed') RETURNING id
//   If 0 rows update → another worker already grabbed this run → 200 OK
//   without touching anything. This is safer than NodeRunner-level
//   idempotency (which doesn't exist yet — see comment in node-runner.ts).
//
// Error contract:
//   • Lock acquisition fails (DB blip) → 500 → QStash retries (safe, lock
//     is durable so any retry that wins still goes through the CAS gate).
//   • After lock acquired, any throw → caught here, run row marked
//     failed, return 200. NEVER let QStash retry post-lock — the second
//     attempt would just bounce off the lock and waste a request.

import { NextRequest } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { Client } from '@upstash/qstash';
import { eq, and, inArray, sql } from 'drizzle-orm';

import { db, workflowRuns } from '@/db';
import { buildFullOrchestrator } from '@/lib/workflow';
import { VIDEO_CONTINUE_REQUIRED } from '@/lib/workflow/nodes/video';
import { resetRunForContinuation } from '@/lib/workflow/continuation';

// Vercel runtime: the worker may run for the duration of a full 5-node
// workflow. The MVP-1 budget is ~5 minutes (Pro tier max). If we
// regularly hit this in prod the next move is W2-07c (per-node QStash
// chain — each NodeRunner enqueues the next).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface WorkerBody {
  runId: string;
}

function resolveWorkerBaseUrlOrNull(): string | null {
  const explicit = process.env.WORKFLOW_WORKER_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return null;
}

async function enqueueContinuation(runId: string): Promise<string | null> {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = resolveWorkerBaseUrlOrNull();
  if (!token || !baseUrl) return null;
  const workerUrl = `${baseUrl}/api/workflow/run`;
  const client = new Client({
    token,
    baseUrl: process.env.QSTASH_URL,
  });
  const res = await client.publishJSON({
    url: workerUrl,
    body: { runId },
    retries: 3,
  });
  return (res as { messageId?: string }).messageId ?? null;
}

async function handler(req: NextRequest): Promise<Response> {
  let body: WorkerBody;
  try {
    body = (await req.json()) as WorkerBody;
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const runId = body.runId;
  if (typeof runId !== 'string' || runId.length === 0) {
    return Response.json({ error: 'MISSING_RUN_ID' }, { status: 400 });
  }

  // ─── Step 1: atomic lock acquisition (CAS on status) ────────────────────────
  // Only `pending` and `failed` runs are eligible to start. `done` and
  // `cancelled` are terminal — silently ignore (likely QStash retry of an
  // already-completed run, which is fine). `running` is held by another
  // worker — also silently ignore.
  let acquired: { id: string }[];
  try {
    acquired = await db
      .update(workflowRuns)
      .set({
        status:    'running',
        startedAt: sql`COALESCE(${workflowRuns.startedAt}, NOW())`,
        errorMsg:  null,
      })
      .where(
        and(
          eq(workflowRuns.id, runId),
          inArray(workflowRuns.status, ['pending', 'failed']),
        ),
      )
      .returning({ id: workflowRuns.id });
  } catch (err) {
    // DB blip during lock — let QStash retry. The lock semantics still
    // hold on the next attempt.
    console.error('[workflow.worker] lock acquisition failed', { runId, err });
    return Response.json({ error: 'LOCK_DB_ERROR' }, { status: 500 });
  }

  if (acquired.length === 0) {
    // Run is either already running (another worker won), already done,
    // or already cancelled. Either way, there's nothing for us to do —
    // return 200 so QStash drops the message.
    console.info('[workflow.worker] dispatch ignored (lock not granted)', { runId });
    return Response.json({ ok: true, ignored: true }, { status: 200 });
  }

  // ─── Step 2: run orchestrator (catches its own internal failures) ──────────
  try {
    // W2-07c guardrail: split video rendering across chained worker invocations
    // unless explicitly overridden. This keeps each worker run inside Vercel's
    // 300s cap for 17-frame storyboards.
    if (!process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION) {
      process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION = '2';
    }

    const orchestrator = buildFullOrchestrator();
    const result = await orchestrator.run(runId);

    // W2-07c (minimal): when video node requests continuation, chain the next
    // worker invocation immediately so long 17-frame runs split across multiple
    // 300s windows.
    if (
      result.status === 'failed'
      && typeof result.errorMsg === 'string'
      && result.errorMsg.includes(VIDEO_CONTINUE_REQUIRED)
    ) {
      try {
        const messageId = await enqueueContinuation(runId);
        if (messageId) {
          // UX: orchestrator wrote run+step status='failed' as part of
          // throwing VIDEO_CONTINUE_REQUIRED. Now that we know the next
          // worker invocation is queued (messageId truthy), reset state
          // to 'pending' so SSE doesn't push misleading 'failed' to the
          // client during the 1–5s QStash delivery gap. We also need
          // 'pending' (not 'running') so the next worker's CAS lock
          // gate (status IN pending,failed) can re-acquire the run.
          // See `lib/workflow/continuation.ts` for the full rationale.
          await resetRunForContinuation(runId, 'video');
        }
        return Response.json(
          {
            ok: true,
            continued: true,
            continuationMessageId: messageId,
            result,
          },
          { status: 200 },
        );
      } catch (enqueueErr) {
        console.error('[workflow.worker] continuation enqueue failed', { runId, enqueueErr });
        // Keep 200 to prevent duplicate retries; run is safely in failed and can
        // be redispatched manually.
        return Response.json(
          {
            ok: false,
            continuationEnqueueFailed: true,
            message: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
            result,
          },
          { status: 200 },
        );
      }
    }

    return Response.json({ ok: true, result }, { status: 200 });
  } catch (err) {
    // Orchestrator should write `failed` status itself, but in case
    // something throws BEFORE the orchestrator's own try/catch kicks in
    // (e.g. preflight DB read), we backstop here so the run doesn't
    // sit in `running` forever.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[workflow.worker] orchestrator threw outside its handler', {
      runId,
      err,
    });
    try {
      await db
        .update(workflowRuns)
        .set({
          status:      'failed',
          errorMsg:    `WORKER_UNCAUGHT: ${message.slice(0, 500)}`,
          completedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));
    } catch (writeErr) {
      console.error('[workflow.worker] failed to write failure status', { runId, writeErr });
    }
    // Return 200 — we own this run now (the lock is ours). Letting QStash
    // retry would just bounce off the lock.
    return Response.json({ ok: false, error: 'UNCAUGHT', message }, { status: 200 });
  }
}

// Two flavours of the handler so local dev can hit it without a QStash
// signature. We require BOTH signing keys to opt into verification — if
// either is missing we assume "dev or test", and the route is open in
// development.
//
// Production fail-closed (audit #2, 2026-04-30): if either signing key is
// missing in production we 503 the request rather than running the
// handler open. Without this, a one-time env misconfiguration silently
// exposes the worker route — anyone who guesses a runId can dispatch
// arbitrary workflows. Per-route opt-out exists for ops via the explicit
// WORKFLOW_WORKER_SKIP_SIGNATURE=1 escape hatch.
const verifiedHandler = verifySignatureAppRouter(handler);

export async function POST(req: NextRequest): Promise<Response> {
  const explicitSkip = process.env.WORKFLOW_WORKER_SKIP_SIGNATURE === '1';
  const missingKeys = !process.env.QSTASH_CURRENT_SIGNING_KEY
    || !process.env.QSTASH_NEXT_SIGNING_KEY;

  if (process.env.NODE_ENV === 'production' && missingKeys && !explicitSkip) {
    console.error('[workflow.worker] refusing to run — QStash signing keys missing in production');
    return Response.json(
      { error: 'WORKER_NOT_CONFIGURED', message: 'QStash signing keys are not set' },
      { status: 503 },
    );
  }

  if (explicitSkip || missingKeys) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[workflow.worker] running WITHOUT signature verification (explicit opt-out)');
    }
    return handler(req);
  }
  return verifiedHandler(req);
}
