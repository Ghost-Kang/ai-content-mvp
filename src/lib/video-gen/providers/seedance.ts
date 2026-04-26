// W2-03-V3 — Seedance (Volcengine Ark / BytePlus) video generation client.
//
// API shape (from Volcengine Ark docs, last verified 2026-04-21):
//   POST {baseUrl}/api/v3/contents/generations/tasks
//     headers: Authorization: Bearer <apiKey>, Content-Type: application/json
//     body:    { model, content: [{type:'text',text}, optional image_url], resolution, duration, seed? }
//     200:     { id: 'cgt-...', created_at: <epoch> }
//
//   GET  {baseUrl}/api/v3/contents/generations/tasks/{id}
//     200:     { id, model, status: queued|running|succeeded|failed,
//                content?: { video_url }, error?: { code, message },
//                usage?: { total_seconds }, created_at, updated_at }
//
// Error code mapping is conservative — we mark anything we're unsure about
// retryable: false. The W2-06 NodeRunner retry policy multiplies whatever
// we tag retryable=true, so over-retrying = real money.
//
// W2-03 acceptance: 4 error classes + happy path covered by the unit test
// at `scripts/test-seedance-client.ts`. Real-API smoke is W2-04 PoC.

import { randomUUID } from 'crypto';
import { BaseVideoProvider, type FetchImpl } from './base';
import { VideoGenError } from '../types';
import type {
  VideoProviderName,
  VideoGenRequest,
  VideoGenSubmitResult,
  VideoGenJobSnapshot,
  VideoGenJobStatus,
  VideoResolution,
} from '../types';
import { getVideoProviderConfig } from '../config';

/**
 * Empirical tokens-per-second by resolution (D32, 2026-04-26).
 * Anchored at measured 480p / 720p; 1080p extrapolated by px-area ratio
 * (~2.25× 720p area). Adds 5% headroom for prompt complexity variance.
 * Used by `estimateTokensForFrame()` for cap preflight.
 */
const SEEDANCE_TOKENS_PER_SEC: Record<VideoResolution, number> = {
  '480p':   10_500,   // measured 9_801/sec → +5% headroom
  '720p':   22_000,   // measured 20_764/sec → +5% headroom
  '1080p':  50_000,   // extrapolated; first real run will recalibrate
};

// ─── Native response shapes (Volcengine Ark) ──────────────────────────────────

interface ArkSubmitResponse {
  id?:         string;
  created_at?: number;
  // On error, Ark wraps in { error: { code, message } } at the top level.
  error?:      { code?: string; message?: string };
}

interface ArkPollResponse {
  id?:        string;
  model?:     string;
  status?:    string; // queued / running / succeeded / failed
  content?:   { video_url?: string };
  error?:     { code?: string; message?: string };
  /**
   * Empirically (2026-04-26) the real Ark response uses `completion_tokens`
   * + `total_tokens` — there is no `total_seconds` field. The legacy field
   * is left here for forward-compat with potential schema-drift.
   */
  usage?:     { completion_tokens?: number; total_tokens?: number; total_seconds?: number };
  /** Top-level `duration` in seconds (e.g. 5, 10). */
  duration?:  number;
  resolution?: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class SeedanceProvider extends BaseVideoProvider {
  readonly name: VideoProviderName = 'seedance';
  readonly model: string;
  readonly costPerMTokensFen: number;

  private apiKey:  string;
  private baseUrl: string;
  private fetchImpl: FetchImpl;

  /**
   * @param fetchImpl - injectable fetch (default = global). Tests pass a fake.
   */
  constructor(fetchImpl?: FetchImpl) {
    super();
    const cfg = getVideoProviderConfig('seedance');
    this.apiKey            = cfg.apiKey;
    this.baseUrl           = cfg.baseUrl;
    this.model             = cfg.model;
    this.costPerMTokensFen = cfg.costPerMTokensFen;
    this.fetchImpl         = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  estimateTokensForFrame(durationSec: number, resolution: VideoResolution): number {
    const perSec = SEEDANCE_TOKENS_PER_SEC[resolution] ?? SEEDANCE_TOKENS_PER_SEC['720p'];
    return Math.ceil(durationSec * perSec);
  }

  validateConfig(): void {
    if (!this.apiKey) {
      throw new Error(
        'Seedance API key not configured. Set SEEDANCE_API_KEY in .env.local ' +
        '(获取地址：https://www.volcengine.com/docs/82379/1541594).',
      );
    }
  }

  async submit(request: VideoGenRequest): Promise<VideoGenSubmitResult> {
    this.validateConfig();

    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: request.prompt },
    ];
    if (request.firstFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: request.firstFrameImage },
        role: 'first_frame',
      });
    }

    const body: Record<string, unknown> = {
      model:      this.model,
      content,
      resolution: request.resolution,
      duration:   request.durationSec,
    };
    if (typeof request.seed === 'number') body.seed = request.seed;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/v3/contents/generations/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${this.apiKey}`,
          'X-Request-Id': randomUUID(),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Network-level failure (DNS, TCP reset, abort) — retryable.
      throw new VideoGenError(
        'PROVIDER_UNAVAILABLE',
        'seedance',
        `Seedance network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
        e,
      );
    }

    if (!res.ok) {
      // Try to parse Ark's error envelope; fall back to status text.
      const errBody = await safeJson<ArkSubmitResponse>(res);
      throw this.normalizeError({ status: res.status, body: errBody });
    }

    const data = await safeJson<ArkSubmitResponse>(res);
    if (!data?.id) {
      throw new VideoGenError(
        'UNKNOWN',
        'seedance',
        `Seedance submit returned no id (body=${JSON.stringify(data)})`,
        false,
      );
    }

    return {
      jobId:      data.id,
      provider:   'seedance',
      model:      this.model,
      acceptedAt: data.created_at
        ? new Date(data.created_at * 1000).toISOString()
        : new Date().toISOString(),
    };
  }

  async pollJob(jobId: string): Promise<VideoGenJobSnapshot> {
    this.validateConfig();

    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(jobId)}`,
        {
          method:  'GET',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      );
    } catch (e) {
      throw new VideoGenError(
        'PROVIDER_UNAVAILABLE',
        'seedance',
        `Seedance poll network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
        e,
      );
    }

    if (!res.ok) {
      const errBody = await safeJson<ArkPollResponse>(res);
      throw this.normalizeError({ status: res.status, body: errBody });
    }

    const data = await safeJson<ArkPollResponse>(res);
    const status = mapArkStatus(data?.status);

    // 2026-04-26: real Ark response shape is `usage.completion_tokens` +
    // top-level `duration` (seconds). The legacy `usage.total_seconds`
    // probe is kept as a fallback in case Ark backfills it.
    const tokenCount = data?.usage?.completion_tokens
      ?? data?.usage?.total_tokens;
    const actualSec  = data?.duration ?? data?.usage?.total_seconds;

    const snapshot: VideoGenJobSnapshot = {
      jobId,
      provider: 'seedance',
      model:    data?.model ?? this.model,
      status,
      actualDurationSec: actualSec,
      tokenCount,
      costFen: typeof tokenCount === 'number'
        ? Math.ceil((tokenCount * this.costPerMTokensFen) / 1_000_000)
        : undefined,
    };

    if (status === 'succeeded') {
      snapshot.videoUrl = data?.content?.video_url;
      if (!snapshot.videoUrl) {
        throw new VideoGenError(
          'UNKNOWN',
          'seedance',
          `Seedance reported succeeded but content.video_url missing (job=${jobId})`,
          false,
        );
      }
    } else if (status === 'failed') {
      snapshot.errorMessage = data?.error?.message ?? 'unknown failure';
    }

    return snapshot;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    // No public ping endpoint — issue a HEAD against the tasks URL and accept
    // 4xx as "service reachable, auth scoped to POST". Anything that throws
    // or returns 5xx counts as unhealthy.
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/api/v3/contents/generations/tasks`,
        {
          method: 'OPTIONS',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      );
      return res.status < 500;
    } catch {
      return false;
    }
  }

  protected normalizeError(raw: unknown): VideoGenError {
    const r = raw as {
      status?: number;
      body?: { error?: { code?: string; message?: string } };
    };
    const status = r?.status ?? 0;
    const code   = (r?.body?.error?.code ?? '').toString();
    const msg    = (r?.body?.error?.message ?? '').toString();
    const haystack = `${code} ${msg}`;

    // Auth / quota — 401, 403, or 429 with quota wording. Do NOT retry.
    if (status === 401 || status === 403) {
      return new VideoGenError('AUTH_FAILED', 'seedance', `Seedance auth failed: ${msg || code}`, false);
    }
    if (status === 429) {
      if (/quota|insufficient|balance|recharge|exceeded/i.test(haystack)) {
        return new VideoGenError('AUTH_FAILED', 'seedance', `Seedance quota exhausted: ${msg || code}`, false);
      }
      return new VideoGenError('RATE_LIMITED', 'seedance', `Seedance rate limit: ${msg || code}`, true);
    }

    // Content moderation — Ark flags as `risk_control` / `sensitive_content`.
    if (/risk_control|sensitive|moderat|policy/i.test(haystack)) {
      return new VideoGenError(
        'CONTENT_FILTERED',
        'seedance',
        `Seedance content filtered: ${msg || code}`,
        false,
      );
    }

    if (status >= 400 && status < 500) {
      return new VideoGenError(
        'BAD_REQUEST',
        'seedance',
        `Seedance bad request (${status}): ${msg || code || 'no detail'}`,
        false,
      );
    }

    if (status >= 500) {
      return new VideoGenError(
        'PROVIDER_UNAVAILABLE',
        'seedance',
        `Seedance server error (${status}): ${msg || code}`,
        true,
      );
    }

    return new VideoGenError('UNKNOWN', 'seedance', msg || code || `status=${status}`, false);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapArkStatus(raw: string | undefined): VideoGenJobStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'queued':
    case 'pending':
      return 'queued';
    case 'running':
    case 'in_progress':
    case 'processing':
      return 'running';
    case 'succeeded':
    case 'success':
    case 'completed':
      return 'succeeded';
    case 'failed':
    case 'cancelled':
    case 'canceled':
      return 'failed';
    default:
      // Unknown/missing status — treat as still running so the caller polls
      // again rather than declaring success or surfacing a confusing error.
      return 'running';
  }
}

async function safeJson<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}
