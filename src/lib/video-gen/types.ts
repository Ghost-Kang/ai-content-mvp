// W2-03-V3 — Video generation provider abstraction (shared types).
//
// Mirrors the shape of `src/lib/llm/types.ts` so the same engineers can
// navigate both layers. The big difference: video generation is ASYNC —
// submit returns a job id; caller polls until terminal state.
//
// NEVER import provider SDKs / fetch URLs outside `src/lib/video-gen/providers/`.

export type VideoProviderName = 'seedance';

/** Output resolution. Limited to what Seedance 1.5 Pro supports today. */
export type VideoResolution = '480p' | '720p' | '1080p';

/**
 * Inputs the storyboard layer feeds in. Optional `firstFrameImage` is a
 * data-URL (`data:image/png;base64,...`) — for MVP-1 we go text-to-video,
 * but the field is here so W3 image-grounded mode is a one-line flip.
 */
export interface VideoGenRequest {
  /** Image prompt (≤ 80 chars per W2-01). Maps to Seedance text content. */
  prompt: string;
  /** Optional first-frame data URL for image-to-video mode. */
  firstFrameImage?: string;
  /** Per-clip duration. Seedance 1.5 Pro accepts integer seconds (3-12). */
  durationSec: number;
  resolution: VideoResolution;
  /** Pinned for deterministic re-runs; optional. */
  seed?: number;
  /** Tenant identifier used for spend / quota observability. */
  tenantId: string;
}

/** Returned synchronously by `submit()` — the polling key. */
export interface VideoGenSubmitResult {
  jobId: string;
  provider: VideoProviderName;
  model: string;
  /** ISO timestamp when the provider acknowledged the job. */
  acceptedAt: string;
}

export type VideoGenJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** Snapshot returned by `pollJob()`. Caller polls until status is terminal. */
export interface VideoGenJobSnapshot {
  jobId: string;
  provider: VideoProviderName;
  model: string;
  status: VideoGenJobStatus;
  /** Populated when status === 'succeeded'. */
  videoUrl?: string;
  /** Populated when status === 'failed' (provider error message). */
  errorMessage?: string;
  /**
   * Cost in cents (分). Best-effort estimate from the provider response;
   * may be 0 if the provider doesn't expose it (we'll fall back to
   * `tokenCount × costPerMTokensFen` for billing).
   */
  costFen?: number;
  /** Provider-reported duration in seconds (sanity check vs request). */
  actualDurationSec?: number;
  /**
   * Provider-reported billable tokens (`usage.completion_tokens`). Empirically
   * measured 2026-04-26 on doubao-seedance-1-0-pro-250528:
   *   5s @ 480p = 49,005 tokens · 5s @ 720p = 103,818 tokens
   * Cost = `tokenCount × costPerMTokensFen / 1_000_000`.
   */
  tokenCount?: number;
}

/**
 * Error taxonomy. Maps to the same retry policy NodeRunner uses for LLM:
 * `retryable=true` codes are eligible for exponential-backoff retry,
 * the rest are surfaced to the user.
 */
export type VideoGenErrorCode =
  | 'RATE_LIMITED'        // 429 (throttled, retry)
  | 'AUTH_FAILED'         // 401 / 403 / quota exhausted (do NOT retry)
  | 'BAD_REQUEST'         // 400 / 422 / invalid prompt / unsupported size
  | 'CONTENT_FILTERED'    // moderation blocked (do NOT retry — needs prompt edit)
  | 'PROVIDER_UNAVAILABLE'// 5xx / network (retry)
  | 'GENERATION_FAILED'   // job ran but came back failed (rare, do NOT retry)
  | 'POLL_TIMEOUT'        // we waited longer than maxWaitMs (caller decision)
  | 'UNKNOWN';

export class VideoGenError extends Error {
  constructor(
    public code:     VideoGenErrorCode,
    public provider: VideoProviderName,
    message:         string,
    public retryable: boolean,
    public cause?:    unknown,
  ) {
    super(message);
    this.name = 'VideoGenError';
  }
}
